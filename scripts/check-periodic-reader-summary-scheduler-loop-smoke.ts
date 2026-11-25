import { InMemoryReaderSummaryJobQueueAdapter } from "@social-monitor/summary/adapters/messaging/reader-summary-job-queue.adapter";
import { InMemoryReaderSummaryJobRepository } from "@social-monitor/summary/adapters/persistence/in-memory-reader-summary-job.repository";
import { InMemoryReaderSummaryPolicyRepository } from "@social-monitor/summary/adapters/persistence/in-memory-reader-summary-policy.repository";
import {
  ReaderSummaryPolicy,
  defaultReaderSummaryGenerationPolicy,
} from "@social-monitor/summary/domain";
import { RequestReaderSummaryUseCase } from "@social-monitor/summary/features/request-reader-summary/request-reader-summary.use-case";
import { SchedulePeriodicReaderSummariesUseCase } from "@social-monitor/summary/features/schedule-periodic-reader-summaries/schedule-periodic-reader-summaries.use-case";
import type { SummaryQuotaPort } from "@social-monitor/summary/ports";
import {
  FixedClock,
  type IdGenerator,
  ok,
  tenantId,
  workspaceId,
} from "@social-monitor/shared-kernel";

import { PeriodicReaderSummarySchedulerLoop } from "../apps/intelligence-worker/src/periodic-reader-summary-scheduler-loop";

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `periodic-reader-summary-scheduler-smoke-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

class AllowAllSummaryQuota implements SummaryQuotaPort {
  async reserveSummaryJob(): ReturnType<SummaryQuotaPort["reserveSummaryJob"]> {
    return ok({
      remaining: 99,
      resetAt: "2026-07-15T12:00:00.000Z",
    });
  }
}

const assert: (condition: unknown, message: string) => asserts condition = (
  condition,
  message,
) => {
  if (!condition) {
    throw new Error(message);
  }
};

async function main(): Promise<void> {
  const tenant = tenantId("tenant-periodic-reader-summary-scheduler-smoke");
  const workspace = workspaceId(
    "workspace-periodic-reader-summary-scheduler-smoke",
  );
  const jobs = new InMemoryReaderSummaryJobRepository();
  const policies = new InMemoryReaderSummaryPolicyRepository();
  const queue = new InMemoryReaderSummaryJobQueueAdapter();
  const fixedNow = new Date("2026-07-15T12:00:00.000Z");
  const requestReaderSummary = new RequestReaderSummaryUseCase(
    jobs,
    queue,
    new AllowAllSummaryQuota(),
    new SequenceIdGenerator(),
    new FixedClock(fixedNow),
  );
  const schedulePeriodicReaderSummaries =
    new SchedulePeriodicReaderSummariesUseCase(policies, requestReaderSummary);

  await policies.save(
    ReaderSummaryPolicy.create({
      id: "policy-periodic-reader-summary-scheduler-smoke",
      tenantId: tenant,
      workspaceId: workspace,
      scope: { type: "workspace" },
      ...defaultReaderSummaryGenerationPolicy(),
      schedule: {
        enabled: true,
        timezone: "UTC",
        cadences: ["weekly", "monthly"],
      },
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    }),
  );

  const loop = new PeriodicReaderSummarySchedulerLoop(
    schedulePeriodicReaderSummaries,
    {
      enabled: true,
      intervalMs: 60_000,
      limit: 10,
      runOnStart: true,
      readyAtUtc: { hour: 6, minute: 0 },
      tenantId: tenant,
      workspaceId: workspace,
    },
    new FixedClock(fixedNow),
  );

  await loop.onModuleInit();
  await loop.onApplicationShutdown(
    "periodic-reader-summary-scheduler-smoke-complete",
  );

  assert(
    queue.all().length === 2,
    `expected weekly and monthly reader summary jobs, got ${queue.all().length}`,
  );

  const repeat = await schedulePeriodicReaderSummaries.execute({
    tenantId: tenant,
    workspaceId: workspace,
    now: fixedNow,
    limit: 10,
    correlationId: "periodic-reader-summary-scheduler-smoke-repeat",
  });
  assert(repeat.ok, "repeat periodic reader summary schedule must succeed");
  assert(
    repeat.value.existing === 2,
    `repeat schedule must reuse two jobs, got ${repeat.value.existing}`,
  );
  assert(
    queue.all().length === 2,
    "repeat schedule must not enqueue duplicate periodic reader summary jobs",
  );

  console.log("Periodic reader summary scheduler loop smoke OK");
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
