import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { SummaryJob } from '../../domain';
import type { SummaryJobRepositoryPort } from '../../ports';
import { GetSummaryJobStatusUseCase } from './get-summary-job-status.use-case';

class FakeSummaryJobs implements SummaryJobRepositoryPort {
  private readonly jobs = new Map<string, SummaryJob>();

  async save(job: SummaryJob): Promise<void> {
    const snapshot = job.toSnapshot();
    this.jobs.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`, job);
  }

  async findById(params: Parameters<SummaryJobRepositoryPort['findById']>[0]): Promise<SummaryJob | null> {
    return this.jobs.get(`${params.tenantId}:${params.workspaceId}:${params.summaryJobId}`) ?? null;
  }

  async findByIdempotencyKey(): Promise<SummaryJob | null> {
    return null;
  }

  async findRequested(): Promise<readonly SummaryJob[]> {
    return [];
  }
}

describe('GetSummaryJobStatusUseCase', () => {
  it('returns safe timeline for a completed no-signal summary job', async () => {
    const tenant = tenantId('tenant-1');
    const workspace = workspaceId('workspace-1');
    const jobs = new FakeSummaryJobs();
    const job = SummaryJob.request({
      id: 'summary-job-1',
      tenantId: tenant,
      workspaceId: workspace,
      topicId: 'topic-1',
      idempotencyKey: 'summary-1',
      requestedAt: new Date('2026-06-06T00:00:00.000Z'),
    })
      .start({ startedAt: new Date('2026-06-06T00:00:01.000Z') })
      .markNoSignal({
        completedAt: new Date('2026-06-06T00:00:02.000Z'),
        summaryId: 'summary-1',
      });
    await jobs.save(job);

    const result = await new GetSummaryJobStatusUseCase(jobs).execute({
      tenantId: tenant,
      workspaceId: workspace,
      summaryJobId: 'summary-job-1',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        summaryJobId: 'summary-job-1',
        topicId: 'topic-1',
        status: 'no_signal',
        requestedAt: '2026-06-06T00:00:00.000Z',
        startedAt: '2026-06-06T00:00:01.000Z',
        completedAt: '2026-06-06T00:00:02.000Z',
        failedAt: undefined,
        summaryId: 'summary-1',
        failureReason: undefined,
        timeline: [
          {
            status: 'requested',
            occurredAt: '2026-06-06T00:00:00.000Z',
            message: 'Summary requested',
          },
          {
            status: 'running',
            occurredAt: '2026-06-06T00:00:01.000Z',
            message: 'Summary generation started',
          },
          {
            status: 'no_signal',
            occurredAt: '2026-06-06T00:00:02.000Z',
            message: 'Summary completed with no reliable signal',
          },
        ],
      },
    });
  });
});
