import { DomainError, FixedClock, type IdGenerator, ok, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { SummaryJob } from '../../domain';
import type { EnqueueSummaryJobCommand, SummaryJobQueuePort, SummaryJobRepositoryPort, SummaryQuotaPort } from '../../ports';
import { RequestSummaryUseCase } from './request-summary.use-case';

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `summary-job-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

class FakeSummaryJobs implements SummaryJobRepositoryPort {
  private readonly jobs = new Map<string, SummaryJob>();

  async save(job: SummaryJob): Promise<void> {
    const snapshot = job.toSnapshot();
    this.jobs.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`, job);
    this.jobs.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.idempotencyKey}`, job);
  }

  async findById(params: Parameters<SummaryJobRepositoryPort['findById']>[0]): Promise<SummaryJob | null> {
    return this.jobs.get(`${params.tenantId}:${params.workspaceId}:${params.summaryJobId}`) ?? null;
  }

  async findByIdempotencyKey(
    params: Parameters<SummaryJobRepositoryPort['findByIdempotencyKey']>[0],
  ): Promise<SummaryJob | null> {
    return this.jobs.get(`${params.tenantId}:${params.workspaceId}:${params.idempotencyKey}`) ?? null;
  }

  async findRequested(params: Parameters<SummaryJobRepositoryPort['findRequested']>[0]): Promise<readonly SummaryJob[]> {
    return [...this.jobs.values()]
      .filter((job, index, all) => all.indexOf(job) === index)
      .filter((job) => {
        const snapshot = job.toSnapshot();

        return (
          snapshot.status === 'requested' &&
          (params.tenantId === undefined || snapshot.tenantId === params.tenantId) &&
          (params.workspaceId === undefined || snapshot.workspaceId === params.workspaceId)
        );
      })
      .slice(0, params.limit);
  }
}

class AllowingSummaryQuota implements SummaryQuotaPort {
  calls = 0;

  async reserveSummaryJob(): ReturnType<SummaryQuotaPort['reserveSummaryJob']> {
    this.calls += 1;

    return ok({
      remaining: 59,
      resetAt: '2026-06-06T01:00:00.000Z',
    });
  }
}

class DenyingSummaryQuota implements SummaryQuotaPort {
  async reserveSummaryJob(): ReturnType<SummaryQuotaPort['reserveSummaryJob']> {
    return {
      ok: false,
      error: new DomainError('operation.quota_exceeded', 'Usage quota exceeded'),
    };
  }
}

class FakeSummaryJobQueue implements SummaryJobQueuePort {
  readonly commands: EnqueueSummaryJobCommand[] = [];

  constructor(private readonly accepting = true) {}

  async canAccept(): Promise<boolean> {
    return this.accepting;
  }

  async enqueue(command: EnqueueSummaryJobCommand): Promise<void> {
    this.commands.push(command);
  }
}

describe('RequestSummaryUseCase', () => {
  it('creates summary job idempotently', async () => {
    const summaryJobQueue = new FakeSummaryJobQueue();
    const useCase = new RequestSummaryUseCase(
      new FakeSummaryJobs(),
      summaryJobQueue,
      new AllowingSummaryQuota(),
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-06T00:00:00.000Z')),
    );
    const command = {
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      interestId: 'interest-1',
      idempotencyKey: 'summary-1',
      correlationId: 'correlation-1',
    };

    const first = await useCase.execute(command);
    const second = await useCase.execute(command);

    expect(first).toEqual({
      ok: true,
      value: {
        summaryJobId: 'summary-job-1',
        status: 'requested',
        created: true,
      },
    });
    expect(second).toEqual({
      ok: true,
      value: {
        summaryJobId: 'summary-job-1',
        status: 'requested',
        created: false,
      },
    });
    expect(summaryJobQueue.commands).toEqual([
      {
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        summaryJobId: 'summary-job-1',
        correlationId: 'correlation-1',
        causationId: 'summary-1',
      },
    ]);
  });

  it('rejects empty interest id', async () => {
    const useCase = new RequestSummaryUseCase(
      new FakeSummaryJobs(),
      new FakeSummaryJobQueue(),
      new AllowingSummaryQuota(),
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-06T00:00:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      interestId: ' ',
      idempotencyKey: 'summary-1',
      correlationId: 'correlation-1',
    });

    expect(result.ok).toBe(false);
  });

  it('rejects empty idempotency key', async () => {
    const useCase = new RequestSummaryUseCase(
      new FakeSummaryJobs(),
      new FakeSummaryJobQueue(),
      new AllowingSummaryQuota(),
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-06T00:00:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      interestId: 'interest-1',
      idempotencyKey: ' ',
      correlationId: 'correlation-1',
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'validation.failed',
      }),
    });
  });

  it('rejects idempotency key reuse for a different personalized request scope', async () => {
    const useCase = new RequestSummaryUseCase(
      new FakeSummaryJobs(),
      new FakeSummaryJobQueue(),
      new AllowingSummaryQuota(),
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-06T00:00:00.000Z')),
    );
    const baseCommand = {
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      interestId: 'interest-1',
      userId: 'user-1',
      subscriptionId: 'subscription-1',
      idempotencyKey: 'personalized-summary-1',
      correlationId: 'correlation-1',
    };

    await expect(useCase.execute(baseCommand)).resolves.toEqual({
      ok: true,
      value: {
        summaryJobId: 'summary-job-1',
        status: 'requested',
        created: true,
      },
    });

    const result = await useCase.execute({
      ...baseCommand,
      userId: 'user-2',
      correlationId: 'correlation-2',
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'operation.conflict',
      }),
    });
  });

  it('checks quota before creating a new summary job', async () => {
    const summaryJobs = new FakeSummaryJobs();
    const useCase = new RequestSummaryUseCase(
      summaryJobs,
      new FakeSummaryJobQueue(),
      new DenyingSummaryQuota(),
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-06T00:00:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      interestId: 'interest-1',
      idempotencyKey: 'summary-1',
      correlationId: 'correlation-1',
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'operation.quota_exceeded',
      }),
    });
    await expect(summaryJobs.findByIdempotencyKey({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      idempotencyKey: 'summary-1',
    })).resolves.toBeNull();
  });

  it('rejects queue backpressure before reserving quota or creating a job', async () => {
    const summaryJobs = new FakeSummaryJobs();
    const summaryQuota = new AllowingSummaryQuota();
    const useCase = new RequestSummaryUseCase(
      summaryJobs,
      new FakeSummaryJobQueue(false),
      summaryQuota,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-06T00:00:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      interestId: 'interest-1',
      idempotencyKey: 'summary-1',
      correlationId: 'correlation-1',
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'operation.backpressure',
      }),
    });
    expect(summaryQuota.calls).toBe(0);
    await expect(summaryJobs.findByIdempotencyKey({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      idempotencyKey: 'summary-1',
    })).resolves.toBeNull();
  });
});
