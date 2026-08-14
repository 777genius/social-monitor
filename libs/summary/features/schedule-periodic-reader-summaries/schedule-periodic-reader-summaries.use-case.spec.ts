import {
  FixedClock,
  ok,
  tenantId,
  type IdGenerator,
  workspaceId,
} from "@social-monitor/shared-kernel";

import {
  readerSummaryScopeKey,
  type ReaderSummaryJob,
  ReaderSummaryPolicy,
  defaultReaderSummaryGenerationPolicy,
} from "../../domain";
import type {
  EnqueueReaderSummaryJobCommand,
  ReaderSummaryJobRepositoryPort,
  ReaderSummaryJobQueuePort,
  ReaderSummaryPolicyRepositoryPort,
  SummaryQuotaPort,
} from "../../ports";
import { RequestReaderSummaryUseCase } from "../request-reader-summary/request-reader-summary.use-case";
import { SchedulePeriodicReaderSummariesUseCase } from "./schedule-periodic-reader-summaries.use-case";

const tenant = tenantId("tenant-periodic-reader-summary");
const workspace = workspaceId("workspace-periodic-reader-summary");

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `periodic-reader-summary-job-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

class AllowAllSummaryQuota implements SummaryQuotaPort {
  async reserveSummaryJob(): ReturnType<SummaryQuotaPort["reserveSummaryJob"]> {
    return ok({
      remaining: 99,
      resetAt: "2026-06-29T00:00:00.000Z",
    });
  }
}

class FakeReaderSummaryJobQueue implements ReaderSummaryJobQueuePort {
  private readonly commands: EnqueueReaderSummaryJobCommand[] = [];

  async canAccept(): Promise<boolean> {
    return true;
  }

  async enqueue(command: EnqueueReaderSummaryJobCommand): Promise<void> {
    this.commands.push(command);
  }

  all(): readonly EnqueueReaderSummaryJobCommand[] {
    return this.commands;
  }
}

class FakeReaderSummaryPolicyRepository implements ReaderSummaryPolicyRepositoryPort {
  private readonly policiesByScope = new Map<string, ReaderSummaryPolicy>();

  async save(policy: ReaderSummaryPolicy): Promise<void> {
    const snapshot = policy.toSnapshot();
    this.policiesByScope.set(
      `${snapshot.tenantId}:${snapshot.workspaceId}:${readerSummaryScopeKey(snapshot.scope)}`,
      policy,
    );
  }

  async findByScope(
    params: Parameters<ReaderSummaryPolicyRepositoryPort["findByScope"]>[0],
  ): Promise<ReaderSummaryPolicy | null> {
    return (
      this.policiesByScope.get(
        `${params.tenantId}:${params.workspaceId}:${readerSummaryScopeKey(params.scope)}`,
      ) ?? null
    );
  }

  async listScheduled(
    query: Parameters<ReaderSummaryPolicyRepositoryPort["listScheduled"]>[0],
  ): Promise<readonly ReaderSummaryPolicy[]> {
    return [...this.policiesByScope.values()]
      .filter((policy) => {
        const snapshot = policy.toSnapshot();

        return (
          snapshot.schedule.enabled &&
          (query.tenantId === undefined ||
            snapshot.tenantId === query.tenantId) &&
          (query.workspaceId === undefined ||
            snapshot.workspaceId === query.workspaceId)
        );
      })
      .sort((left, right) => {
        const leftSnapshot = left.toSnapshot();
        const rightSnapshot = right.toSnapshot();
        const updatedAtDiff =
          rightSnapshot.updatedAt.getTime() - leftSnapshot.updatedAt.getTime();

        return updatedAtDiff === 0
          ? readerSummaryScopeKey(leftSnapshot.scope).localeCompare(
              readerSummaryScopeKey(rightSnapshot.scope),
            )
          : updatedAtDiff;
      })
      .slice(0, query.limit);
  }
}

class FakeReaderSummaryJobRepository implements ReaderSummaryJobRepositoryPort {
  private readonly jobsById = new Map<string, ReaderSummaryJob>();
  private readonly jobsByIdempotencyKey = new Map<string, ReaderSummaryJob>();

  async save(job: ReaderSummaryJob): Promise<void> {
    const snapshot = job.toSnapshot();
    this.jobsById.set(
      `${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`,
      job,
    );
    this.jobsByIdempotencyKey.set(
      `${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.idempotencyKey}`,
      job,
    );
  }

  async findById(
    params: Parameters<ReaderSummaryJobRepositoryPort["findById"]>[0],
  ): Promise<ReaderSummaryJob | null> {
    return (
      this.jobsById.get(
        `${params.tenantId}:${params.workspaceId}:${params.readerSummaryJobId}`,
      ) ?? null
    );
  }

  async findByIdempotencyKey(
    params: Parameters<
      ReaderSummaryJobRepositoryPort["findByIdempotencyKey"]
    >[0],
  ): Promise<ReaderSummaryJob | null> {
    return (
      this.jobsByIdempotencyKey.get(
        `${params.tenantId}:${params.workspaceId}:${params.idempotencyKey}`,
      ) ?? null
    );
  }

  async findRequested(
    params: Parameters<ReaderSummaryJobRepositoryPort["findRequested"]>[0],
  ): Promise<readonly ReaderSummaryJob[]> {
    return [...this.jobsById.values()]
      .filter((job) => {
        const snapshot = job.toSnapshot();

        return (
          snapshot.status === "requested" &&
          (params.tenantId === undefined ||
            snapshot.tenantId === params.tenantId) &&
          (params.workspaceId === undefined ||
            snapshot.workspaceId === params.workspaceId)
        );
      })
      .slice(0, params.limit);
  }

  async claimForExecution(): Promise<ReaderSummaryJob | null> {
    return null;
  }

  async saveExecutionOutcome(): Promise<boolean> {
    return false;
  }
}

describe("SchedulePeriodicReaderSummariesUseCase", () => {
  it("requests weekly and monthly closed-period reader summaries idempotently", async () => {
    const dependencies = makeDependencies();
    await dependencies.policies.save(
      ReaderSummaryPolicy.create({
        id: "reader-summary-policy-periodic",
        tenantId: tenant,
        workspaceId: workspace,
        scope: { type: "workspace" },
        ...defaultReaderSummaryGenerationPolicy(),
        schedule: {
          enabled: true,
          timezone: "UTC",
          cadences: ["weekly", "monthly"],
        },
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
        updatedAt: new Date("2026-06-01T00:00:00.000Z"),
      }),
    );

    const first = await dependencies.useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      now: new Date("2026-07-15T12:00:00.000Z"),
      limit: 10,
      correlationId: "periodic-reader-summary-test",
    });

    expect(first.ok).toBe(true);
    expect(first.ok ? first.value.evaluated : 0).toBe(2);
    expect(first.ok ? first.value.scheduled : 0).toBe(2);
    expect(first.ok ? first.value.notReady : 0).toBe(0);
    expect(
      first.ok ? first.value.summaries.map((item) => item.cadence) : [],
    ).toEqual(["weekly", "monthly"]);
    expect(
      first.ok
        ? first.value.summaries.map((item) => item.period.periodKey)
        : [],
    ).toEqual([
      "weekly:2026-07-06T00:00:00.000Z:2026-07-13T00:00:00.000Z:UTC",
      "monthly:2026-06-01T00:00:00.000Z:2026-07-01T00:00:00.000Z:UTC",
    ]);
    expect(
      first.ok ? first.value.summaries.map((item) => item.idempotencyKey) : [],
    ).toEqual([
      [
        "reader-summary",
        tenant,
        workspace,
        "workspace",
        "weekly",
        "weekly:2026-07-06T00:00:00.000Z:2026-07-13T00:00:00.000Z:UTC",
        "shared",
        "2026-06-01T00:00:00.000Z",
      ].join(":"),
      [
        "reader-summary",
        tenant,
        workspace,
        "workspace",
        "monthly",
        "monthly:2026-06-01T00:00:00.000Z:2026-07-01T00:00:00.000Z:UTC",
        "shared",
        "2026-06-01T00:00:00.000Z",
      ].join(":"),
    ]);
    expect(dependencies.queue.all()).toHaveLength(2);

    const second = await dependencies.useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      now: new Date("2026-07-15T12:00:00.000Z"),
      limit: 10,
      correlationId: "periodic-reader-summary-test",
    });

    expect(second.ok).toBe(true);
    expect(second.ok ? second.value.scheduled : 0).toBe(0);
    expect(second.ok ? second.value.existing : 0).toBe(2);
    expect(second.ok ? second.value.notReady : 0).toBe(0);
    expect(dependencies.queue.all()).toHaveLength(2);
  });

  it("waits until 06:00 UTC before scheduling the daily reader summary", async () => {
    const dependencies = makeDependencies();
    await dependencies.policies.save(
      ReaderSummaryPolicy.create({
        id: "reader-summary-policy-daily-ready-time",
        tenantId: tenant,
        workspaceId: workspace,
        scope: { type: "workspace" },
        ...defaultReaderSummaryGenerationPolicy(),
        schedule: {
          enabled: true,
          timezone: "UTC",
          cadences: ["daily"],
        },
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
        updatedAt: new Date("2026-07-01T00:00:00.000Z"),
      }),
    );

    const beforeReady = await dependencies.useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      now: new Date("2026-07-15T05:59:59.999Z"),
      limit: 10,
      correlationId: "periodic-reader-summary-before-ready",
    });

    expect(beforeReady.ok).toBe(true);
    expect(beforeReady.ok ? beforeReady.value.evaluated : 0).toBe(1);
    expect(beforeReady.ok ? beforeReady.value.notReady : 0).toBe(1);
    expect(beforeReady.ok ? beforeReady.value.scheduled : 0).toBe(0);
    expect(dependencies.queue.all()).toHaveLength(0);

    const ready = await dependencies.useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      now: new Date("2026-07-15T06:00:00.000Z"),
      limit: 10,
      correlationId: "periodic-reader-summary-ready",
    });

    expect(ready.ok).toBe(true);
    expect(ready.ok ? ready.value.notReady : 0).toBe(0);
    expect(ready.ok ? ready.value.scheduled : 0).toBe(1);
    expect(
      ready.ok ? ready.value.summaries[0]?.period.periodKey : undefined,
    ).toBe("daily:2026-07-14T00:00:00.000Z:2026-07-15T00:00:00.000Z:UTC");
    expect(dependencies.queue.all()).toHaveLength(1);
  });

  it("uses shared UTC periods even when an older policy has a non-UTC timezone", async () => {
    const dependencies = makeDependencies();
    await dependencies.policies.save(
      ReaderSummaryPolicy.create({
        id: "reader-summary-policy-legacy-timezone",
        tenantId: tenant,
        workspaceId: workspace,
        scope: { type: "workspace" },
        ...defaultReaderSummaryGenerationPolicy(),
        schedule: {
          enabled: true,
          timezone: "Europe/Kiev",
          cadences: ["weekly"],
        },
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
        updatedAt: new Date("2026-07-01T00:00:00.000Z"),
      }),
    );

    const result = await dependencies.useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      now: new Date("2026-07-13T06:00:00.000Z"),
      limit: 10,
      correlationId: "periodic-reader-summary-shared-utc",
    });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.value.scheduled : 0).toBe(1);
    expect(result.ok ? result.value.summaries[0]?.period : undefined).toEqual({
      startedAt: "2026-07-06T00:00:00.000Z",
      endedAt: "2026-07-13T00:00:00.000Z",
      timezone: "UTC",
      periodKey: "weekly:2026-07-06T00:00:00.000Z:2026-07-13T00:00:00.000Z:UTC",
    });
  });

  it("skips disabled scheduled policies", async () => {
    const dependencies = makeDependencies();
    await dependencies.policies.save(
      ReaderSummaryPolicy.create({
        id: "reader-summary-policy-disabled",
        tenantId: tenant,
        workspaceId: workspace,
        scope: { type: "workspace" },
        ...defaultReaderSummaryGenerationPolicy(),
        schedule: {
          enabled: false,
          timezone: "UTC",
          cadences: ["daily"],
        },
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
        updatedAt: new Date("2026-06-01T00:00:00.000Z"),
      }),
    );

    const result = await dependencies.useCase.execute({
      now: new Date("2026-07-15T12:00:00.000Z"),
      limit: 10,
      correlationId: "periodic-reader-summary-test",
    });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.value.evaluated : 0).toBe(0);
  });
});

const makeDependencies = () => {
  const policies = new FakeReaderSummaryPolicyRepository();
  const jobs = new FakeReaderSummaryJobRepository();
  const queue = new FakeReaderSummaryJobQueue();
  const requestReaderSummary = new RequestReaderSummaryUseCase(
    jobs,
    queue,
    new AllowAllSummaryQuota(),
    new SequenceIdGenerator(),
    new FixedClock(new Date("2026-07-15T12:00:00.000Z")),
  );

  return {
    policies,
    queue,
    useCase: new SchedulePeriodicReaderSummariesUseCase(
      policies,
      requestReaderSummary,
    ),
  };
};
