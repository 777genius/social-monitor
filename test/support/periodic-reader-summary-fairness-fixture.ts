import { ok, tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { InMemoryReaderSummaryPolicyRepository } from "@social-monitor/summary/adapters/persistence/in-memory-reader-summary-policy.repository";
import { defaultReaderSummaryGenerationPolicy, ReaderSummaryPolicy, type ScheduledReaderSummaryCadence } from "@social-monitor/summary/domain";
import type { ReaderSummaryJobRepositoryPort } from "@social-monitor/summary/ports";
import type { RequestReaderSummaryCommand } from "@social-monitor/summary/features/request-reader-summary/request-reader-summary.command";
import type { RequestReaderSummaryUseCase } from "@social-monitor/summary/features/request-reader-summary/request-reader-summary.use-case";
import type { SchedulePeriodicReaderSummariesCommand } from "@social-monitor/summary/features/schedule-periodic-reader-summaries/schedule-periodic-reader-summaries.command";
import { SchedulePeriodicReaderSummariesUseCase } from "@social-monitor/summary/features/schedule-periodic-reader-summaries/schedule-periodic-reader-summaries.use-case";

export const fairnessNow = new Date("2026-11-27T12:00:00.000Z");
export const fairnessPolicy = (
  id: string,
  cadences: readonly ScheduledReaderSummaryCadence[] = ["daily"],
) => ReaderSummaryPolicy.create({
  id,
  tenantId: tenantId("tenant-" + id),
  workspaceId: workspaceId("workspace-" + id),
  scope: { type: "workspace" },
  ...defaultReaderSummaryGenerationPolicy(),
  schedule: { enabled: true, timezone: "UTC", cadences },
  createdAt: fairnessNow,
  updatedAt: fairnessNow,
});

export const setupFairness = async (
  initial: readonly ReaderSummaryPolicy[],
  jobs?: Pick<ReaderSummaryJobRepositoryPort, "findByIdempotencyKey">,
) => {
  const policies = new InMemoryReaderSummaryPolicyRepository();
  for (const policy of initial) await policies.save(policy);
  const requests: RequestReaderSummaryCommand[] = [];
  const admitted = new Set<string>();
  const execute = jest.fn<ReturnType<RequestReaderSummaryUseCase["execute"]>, Parameters<RequestReaderSummaryUseCase["execute"]>>(
    async (command) => {
      requests.push(command);
      const created = !admitted.has(command.idempotencyKey);
      admitted.add(command.idempotencyKey);
      return ok({
        readerSummaryJobId: "job-" + admitted.size,
        status: "requested" as const,
        created,
        period: {
          cadence: command.cadence ?? "daily",
          startedAt: command.period!.startedAt.toISOString(),
          endedAt: command.period!.endedAt.toISOString(),
          timezone: "UTC",
          periodKey: "fixture-period",
        },
      });
    },
  );
  return {
    policies, requests, admitted, execute,
    useCase: new SchedulePeriodicReaderSummariesUseCase(policies, { execute }, jobs),
  };
};

export const fairnessTick = async (
  useCase: SchedulePeriodicReaderSummariesUseCase,
  command: Partial<SchedulePeriodicReaderSummariesCommand> = {},
) => {
  const result = await useCase.execute({
    now: fairnessNow, limit: 1, correlationId: "fairness-fixture", ...command,
  });
  if (!result.ok) throw result.error;
  return result.value;
};
