import { DomainError, FixedClock, type IdGenerator, ok, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { SummaryJob } from '../../domain';
import type { SummaryJobRepositoryPort, SummaryQuotaPort } from '../../ports';
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
}

class AllowingSummaryQuota implements SummaryQuotaPort {
  async reserveSummaryJob(): ReturnType<SummaryQuotaPort['reserveSummaryJob']> {
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

describe('RequestSummaryUseCase', () => {
  it('creates summary job idempotently', async () => {
    const useCase = new RequestSummaryUseCase(
      new FakeSummaryJobs(),
      new AllowingSummaryQuota(),
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-06T00:00:00.000Z')),
    );
    const command = {
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      topicId: 'topic-1',
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
  });

  it('rejects empty topic id', async () => {
    const useCase = new RequestSummaryUseCase(
      new FakeSummaryJobs(),
      new AllowingSummaryQuota(),
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-06T00:00:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      topicId: ' ',
      idempotencyKey: 'summary-1',
      correlationId: 'correlation-1',
    });

    expect(result.ok).toBe(false);
  });

  it('checks quota before creating a new summary job', async () => {
    const summaryJobs = new FakeSummaryJobs();
    const useCase = new RequestSummaryUseCase(
      summaryJobs,
      new DenyingSummaryQuota(),
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-06T00:00:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      topicId: 'topic-1',
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
});
