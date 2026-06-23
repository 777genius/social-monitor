import { DomainError, FixedClock, type IdGenerator, ok, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { BriefingJob } from '../../domain';
import type {
  BriefingJobQueuePort,
  BriefingJobRepositoryPort,
  EnqueueBriefingJobCommand,
  SummaryQuotaPort,
} from '../../ports';
import { RequestBriefingUseCase } from './request-briefing.use-case';

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `briefing-job-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

describe('RequestBriefingUseCase', () => {
  it('creates workspace briefing jobs idempotently', async () => {
    const briefingJobQueue = new FakeBriefingJobQueue();
    const useCase = new RequestBriefingUseCase(
      new FakeBriefingJobRepository(),
      briefingJobQueue,
      new AllowingSummaryQuota(),
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-23T08:00:00.000Z')),
    );
    const command = {
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      scope: { type: 'workspace' as const },
      idempotencyKey: 'briefing-1',
      correlationId: 'correlation-1',
    };

    const first = await useCase.execute(command);
    const second = await useCase.execute(command);

    expect(first).toEqual({
      ok: true,
      value: {
        briefingJobId: 'briefing-job-1',
        status: 'requested',
        created: true,
      },
    });
    expect(second).toEqual({
      ok: true,
      value: {
        briefingJobId: 'briefing-job-1',
        status: 'requested',
        created: false,
      },
    });
    expect(briefingJobQueue.all()).toEqual([
      {
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        briefingJobId: 'briefing-job-1',
        correlationId: 'correlation-1',
        causationId: 'briefing-1',
      },
    ]);
  });

  it('rejects idempotency key reuse for another scope', async () => {
    const useCase = new RequestBriefingUseCase(
      new FakeBriefingJobRepository(),
      new FakeBriefingJobQueue(),
      new AllowingSummaryQuota(),
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-23T08:00:00.000Z')),
    );
    const baseCommand = {
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      scope: { type: 'workspace' as const },
      idempotencyKey: 'briefing-1',
      correlationId: 'correlation-1',
    };

    await expect(useCase.execute(baseCommand)).resolves.toEqual({
      ok: true,
      value: {
        briefingJobId: 'briefing-job-1',
        status: 'requested',
        created: true,
      },
    });

    const result = await useCase.execute({
      ...baseCommand,
      scope: { type: 'topic' as const, topicId: 'topic-ai' },
      correlationId: 'correlation-2',
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'operation.conflict',
      }),
    });
  });

  it('reserves quota before creating a new briefing job', async () => {
    const quota = new AllowingSummaryQuota();
    const useCase = new RequestBriefingUseCase(
      new FakeBriefingJobRepository(),
      new FakeBriefingJobQueue(),
      quota,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-23T08:00:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      scope: { type: 'workspace' },
      idempotencyKey: 'briefing-1',
      correlationId: 'correlation-1',
    });

    expect(result.ok).toBe(true);
    expect(quota.calls).toEqual([
      expect.objectContaining({
        operation: 'briefing.request',
        scopeKey: 'workspace',
      }),
    ]);
  });

  it('does not enqueue a briefing job when quota is rejected', async () => {
    const queue = new FakeBriefingJobQueue();
    const useCase = new RequestBriefingUseCase(
      new FakeBriefingJobRepository(),
      queue,
      new DenyingSummaryQuota(),
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-23T08:00:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      scope: { type: 'workspace' },
      idempotencyKey: 'briefing-1',
      correlationId: 'correlation-1',
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'operation.quota_exceeded',
      }),
    });
    expect(queue.all()).toEqual([]);
  });
});

class FakeBriefingJobRepository implements BriefingJobRepositoryPort {
  private readonly jobsById = new Map<string, BriefingJob>();
  private readonly jobsByIdempotencyKey = new Map<string, BriefingJob>();

  async save(job: BriefingJob): Promise<void> {
    const snapshot = job.toSnapshot();
    this.jobsById.set(snapshot.id, job);
    this.jobsByIdempotencyKey.set(snapshot.idempotencyKey, job);
  }

  async findById(params: Parameters<BriefingJobRepositoryPort['findById']>[0]): Promise<BriefingJob | null> {
    const job = this.jobsById.get(params.briefingJobId);
    return job?.toSnapshot().tenantId === params.tenantId && job.toSnapshot().workspaceId === params.workspaceId
      ? job
      : null;
  }

  async findByIdempotencyKey(
    params: Parameters<BriefingJobRepositoryPort['findByIdempotencyKey']>[0],
  ): Promise<BriefingJob | null> {
    const job = this.jobsByIdempotencyKey.get(params.idempotencyKey);
    return job?.toSnapshot().tenantId === params.tenantId && job.toSnapshot().workspaceId === params.workspaceId
      ? job
      : null;
  }

  async findRequested(params: Parameters<BriefingJobRepositoryPort['findRequested']>[0]): Promise<readonly BriefingJob[]> {
    return [...this.jobsById.values()]
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

  async claimForExecution(): ReturnType<BriefingJobRepositoryPort['claimForExecution']> {
    return null;
  }
}

class FakeBriefingJobQueue implements BriefingJobQueuePort {
  private readonly commands: EnqueueBriefingJobCommand[] = [];

  async canAccept(): Promise<boolean> {
    return true;
  }

  async enqueue(command: EnqueueBriefingJobCommand): Promise<void> {
    this.commands.push(command);
  }

  all(): readonly EnqueueBriefingJobCommand[] {
    return [...this.commands];
  }
}

class AllowingSummaryQuota implements SummaryQuotaPort {
  readonly calls: Parameters<SummaryQuotaPort['reserveSummaryJob']>[0][] = [];

  async reserveSummaryJob(
    command: Parameters<SummaryQuotaPort['reserveSummaryJob']>[0],
  ): ReturnType<SummaryQuotaPort['reserveSummaryJob']> {
    this.calls.push(command);

    return ok({
      remaining: 59,
      resetAt: '2026-06-23T09:00:00.000Z',
    });
  }
}

class DenyingSummaryQuota implements SummaryQuotaPort {
  async reserveSummaryJob(): ReturnType<SummaryQuotaPort['reserveSummaryJob']> {
    return {
      ok: false,
      error: new DomainError('operation.quota_exceeded', 'Briefing quota exceeded'),
    };
  }
}
