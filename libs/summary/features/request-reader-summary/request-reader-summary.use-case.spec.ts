import {
  DomainError,
  FixedClock,
  type IdGenerator,
  ok,
  tenantId,
  workspaceId,
} from "@social-monitor/shared-kernel";

import type { ReaderSummaryJob } from "../../domain";
import type {
  EnqueueReaderSummaryJobCommand,
  ReaderSummaryJobQueuePort,
  ReaderSummaryJobRepositoryPort,
  SummaryQuotaPort,
} from "../../ports";
import { RequestReaderSummaryUseCase } from "./request-reader-summary.use-case";

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `reader-summary-job-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

describe("RequestReaderSummaryUseCase", () => {
  it("creates workspace reader summary jobs idempotently", async () => {
    const readerSummaryJobQueue = new FakeReaderSummaryJobQueue();
    const useCase = new RequestReaderSummaryUseCase(
      new FakeReaderSummaryJobRepository(),
      readerSummaryJobQueue,
      new AllowingSummaryQuota(),
      new SequenceIdGenerator(),
      new FixedClock(new Date("2026-06-23T08:00:00.000Z")),
    );
    const command = {
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      scope: { type: "workspace" as const },
      idempotencyKey: "reader-summary-1",
      correlationId: "correlation-1",
    };

    const first = await useCase.execute(command);
    const second = await useCase.execute(command);

    expect(first).toEqual({
      ok: true,
      value: {
        readerSummaryJobId: "reader-summary-job-1",
        period: expectedDailyPeriodResult,
        status: "requested",
        created: true,
      },
    });
    expect(second).toEqual({
      ok: true,
      value: {
        readerSummaryJobId: "reader-summary-job-1",
        period: expectedDailyPeriodResult,
        status: "requested",
        created: false,
      },
    });
    expect(readerSummaryJobQueue.all()).toEqual([
      {
        tenantId: tenantId("tenant-1"),
        workspaceId: workspaceId("workspace-1"),
        readerSummaryJobId: "reader-summary-job-1",
        correlationId: "correlation-1",
        causationId: "reader-summary-1",
      },
    ]);
    await expect(
      useCase.execute({
        ...command,
        idempotencyKey: "reader-summary-weekly",
        cadence: "weekly",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        ok: true,
      }),
    );
  });

  it("rejects idempotency key reuse for another scope", async () => {
    const useCase = new RequestReaderSummaryUseCase(
      new FakeReaderSummaryJobRepository(),
      new FakeReaderSummaryJobQueue(),
      new AllowingSummaryQuota(),
      new SequenceIdGenerator(),
      new FixedClock(new Date("2026-06-23T08:00:00.000Z")),
    );
    const baseCommand = {
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      scope: { type: "workspace" as const },
      idempotencyKey: "reader-summary-1",
      correlationId: "correlation-1",
    };

    await expect(useCase.execute(baseCommand)).resolves.toEqual({
      ok: true,
      value: {
        readerSummaryJobId: "reader-summary-job-1",
        period: expectedDailyPeriodResult,
        status: "requested",
        created: true,
      },
    });

    const result = await useCase.execute({
      ...baseCommand,
      scope: { type: "topic" as const, topicId: "topic-ai" },
      correlationId: "correlation-2",
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: "operation.conflict",
      }),
    });
  });

  it("reserves reader summary quota before creating a new job", async () => {
    const quota = new AllowingSummaryQuota();
    const useCase = new RequestReaderSummaryUseCase(
      new FakeReaderSummaryJobRepository(),
      new FakeReaderSummaryJobQueue(),
      quota,
      new SequenceIdGenerator(),
      new FixedClock(new Date("2026-06-23T08:00:00.000Z")),
    );

    const result = await useCase.execute({
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      scope: { type: "workspace" },
      idempotencyKey: "reader-summary-1",
      correlationId: "correlation-1",
    });

    expect(result.ok).toBe(true);
    expect(quota.calls).toEqual([
      expect.objectContaining({
        operation: "reader_summary.request",
        scopeKey: "workspace",
      }),
    ]);
  });

  it("rejects idempotency key reuse for another period", async () => {
    const useCase = new RequestReaderSummaryUseCase(
      new FakeReaderSummaryJobRepository(),
      new FakeReaderSummaryJobQueue(),
      new AllowingSummaryQuota(),
      new SequenceIdGenerator(),
      new FixedClock(new Date("2026-06-23T08:00:00.000Z")),
    );
    const command = {
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      scope: { type: "workspace" as const },
      idempotencyKey: "reader-summary-period-key",
      correlationId: "correlation-1",
    };

    await expect(useCase.execute(command)).resolves.toEqual(
      expect.objectContaining({ ok: true }),
    );

    const result = await useCase.execute({
      ...command,
      cadence: "weekly",
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: "operation.conflict",
      }),
    });
  });

  it("does not enqueue a reader summary job when quota is rejected", async () => {
    const queue = new FakeReaderSummaryJobQueue();
    const useCase = new RequestReaderSummaryUseCase(
      new FakeReaderSummaryJobRepository(),
      queue,
      new DenyingSummaryQuota(),
      new SequenceIdGenerator(),
      new FixedClock(new Date("2026-06-23T08:00:00.000Z")),
    );

    const result = await useCase.execute({
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      scope: { type: "workspace" },
      idempotencyKey: "reader-summary-1",
      correlationId: "correlation-1",
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: "operation.quota_exceeded",
      }),
    });
    expect(queue.all()).toEqual([]);
  });
});

const expectedDailyPeriodResult = {
  cadence: "daily",
  startedAt: "2026-06-23T00:00:00.000Z",
  endedAt: "2026-06-24T00:00:00.000Z",
  timezone: "UTC",
  periodKey:
    "daily:2026-06-23T00:00:00.000Z:2026-06-24T00:00:00.000Z:UTC",
};

class FakeReaderSummaryJobRepository implements ReaderSummaryJobRepositoryPort {
  private readonly jobsById = new Map<string, ReaderSummaryJob>();
  private readonly jobsByIdempotencyKey = new Map<string, ReaderSummaryJob>();

  async save(job: ReaderSummaryJob): Promise<void> {
    const snapshot = job.toSnapshot();
    this.jobsById.set(snapshot.id, job);
    this.jobsByIdempotencyKey.set(snapshot.idempotencyKey, job);
  }

  async findById(
    params: Parameters<ReaderSummaryJobRepositoryPort["findById"]>[0],
  ): Promise<ReaderSummaryJob | null> {
    const job = this.jobsById.get(params.readerSummaryJobId);
    return job?.toSnapshot().tenantId === params.tenantId &&
      job.toSnapshot().workspaceId === params.workspaceId
      ? job
      : null;
  }

  async findByIdempotencyKey(
    params: Parameters<
      ReaderSummaryJobRepositoryPort["findByIdempotencyKey"]
    >[0],
  ): Promise<ReaderSummaryJob | null> {
    const job = this.jobsByIdempotencyKey.get(params.idempotencyKey);
    return job?.toSnapshot().tenantId === params.tenantId &&
      job.toSnapshot().workspaceId === params.workspaceId
      ? job
      : null;
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

  async claimForExecution(): ReturnType<
    ReaderSummaryJobRepositoryPort["claimForExecution"]
  > {
    return null;
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
    return [...this.commands];
  }
}

class AllowingSummaryQuota implements SummaryQuotaPort {
  readonly calls: Parameters<SummaryQuotaPort["reserveSummaryJob"]>[0][] = [];

  async reserveSummaryJob(
    command: Parameters<SummaryQuotaPort["reserveSummaryJob"]>[0],
  ): ReturnType<SummaryQuotaPort["reserveSummaryJob"]> {
    this.calls.push(command);

    return ok({
      remaining: 59,
      resetAt: "2026-06-23T09:00:00.000Z",
    });
  }
}

class DenyingSummaryQuota implements SummaryQuotaPort {
  async reserveSummaryJob(): ReturnType<SummaryQuotaPort["reserveSummaryJob"]> {
    return {
      ok: false,
      error: new DomainError(
        "operation.quota_exceeded",
        "Reader summary quota exceeded",
      ),
    };
  }
}
