import { InMemoryReaderSummaryJobQueueAdapter } from "@social-monitor/summary/adapters/messaging/reader-summary-job-queue.adapter";
import { InMemoryReaderSummaryJobRepository } from "@social-monitor/summary/adapters/persistence/in-memory-reader-summary-job.repository";
import { FixedClock, ok, tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { InMemoryReaderSummaryPolicyRepository } from "@social-monitor/summary/adapters/persistence/in-memory-reader-summary-policy.repository";
import { completedReaderSummaryPeriodForCadence, defaultReaderSummaryGenerationPolicy, ReaderSummaryJob, ReaderSummaryPolicy, type ScheduledReaderSummaryCadence } from "@social-monitor/summary/domain";
import type { ReaderSummaryJobRepositoryPort } from "@social-monitor/summary/ports";
import type { RequestReaderSummaryCommand } from "@social-monitor/summary/features/request-reader-summary/request-reader-summary.command";
import { RequestReaderSummaryUseCase } from "@social-monitor/summary/features/request-reader-summary/request-reader-summary.use-case";
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

export const setupHistoricalFairness = async () => {
  const now = new Date("2026-11-28T00:00:00.000Z");
  const policy = fairnessPolicy("a");
  const snapshot = policy.toSnapshot();
  const policies = new InMemoryReaderSummaryPolicyRepository();
  await policies.save(policy);
  await policies.save(fairnessPolicy("b"));
  const jobs = new InMemoryReaderSummaryJobRepository();
  const queue = new InMemoryReaderSummaryJobQueueAdapter();
  for (const days of [1, 2]) {
    const period = completedReaderSummaryPeriodForCadence({
      cadence: "daily", now: new Date(now.getTime() - days * 86_400_000), timezone: "UTC",
    });
    const job = ReaderSummaryJob.request({
      id: "historical-" + days, tenantId: snapshot.tenantId, workspaceId: snapshot.workspaceId,
      scope: snapshot.scope, period, requestedAt: period.endedAt, selectionStrategy: "jev_primary_v3",
      idempotencyKey: ["reader-summary", snapshot.tenantId, snapshot.workspaceId, "workspace",
        "daily", period.periodKey, "shared", snapshot.updatedAt.toISOString()].join(":"),
    });
    await jobs.save(ReaderSummaryJob.rehydrate({
      ...job.toSnapshot(), status: "failed", failedAt: new Date(now.getTime() - 600_000),
      terminalFailureCode: "presentation_dependency_unavailable",
      failureReason: "presentation_runtime_failure_repeated:task_timeout:executions_closed",
    }));
  }
  let sequence = 0;
  const request = new RequestReaderSummaryUseCase(
    jobs, queue, { reserveSummaryJob: async () => ok({ remaining: 100, resetAt: "2026-11-29T00:00:00.000Z" }) },
    { generate: () => "recovery-" + ++sequence }, new FixedClock(now), { resolve: () => "jev_primary_v3" },
  );
  return { now, queue, useCase: new SchedulePeriodicReaderSummariesUseCase(policies, request, jobs) };
};
