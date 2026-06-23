import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { BriefingJob } from '../../domain';
import type { BriefingJobRepositoryPort } from '../../ports';
import { GetBriefingJobStatusUseCase } from './get-briefing-job-status.use-case';

describe('GetBriefingJobStatusUseCase', () => {
  it('returns current briefing job status with timeline', async () => {
    const job = BriefingJob.request({
      id: 'briefing-job-1',
      tenantId: tenant,
      workspaceId: workspace,
      scope: { type: 'workspace' },
      idempotencyKey: 'briefing-1',
      requestedAt: new Date('2026-06-23T08:00:00.000Z'),
    })
      .start({ startedAt: new Date('2026-06-23T08:01:00.000Z') })
      .complete({
        completedAt: new Date('2026-06-23T08:02:00.000Z'),
        briefingId: 'briefing-1',
      });
    const useCase = new GetBriefingJobStatusUseCase(new FakeBriefingJobRepository([job]));

    const result = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      briefingJobId: 'briefing-job-1',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        briefingJobId: 'briefing-job-1',
        scope: { type: 'workspace' },
        status: 'completed',
        requestedAt: '2026-06-23T08:00:00.000Z',
        startedAt: '2026-06-23T08:01:00.000Z',
        completedAt: '2026-06-23T08:02:00.000Z',
        failedAt: undefined,
        briefingId: 'briefing-1',
        failureReason: undefined,
        timeline: [
          {
            status: 'requested',
            occurredAt: '2026-06-23T08:00:00.000Z',
            message: 'Briefing requested',
          },
          {
            status: 'running',
            occurredAt: '2026-06-23T08:01:00.000Z',
            message: 'Briefing generation started',
          },
          {
            status: 'completed',
            occurredAt: '2026-06-23T08:02:00.000Z',
            message: 'Briefing completed',
          },
        ],
      },
    });
  });

  it('returns not found for missing briefing jobs', async () => {
    const useCase = new GetBriefingJobStatusUseCase(new FakeBriefingJobRepository([]));

    const result = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      briefingJobId: 'missing',
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'resource.not_found' }),
    });
  });
});

const tenant = tenantId('tenant-briefing-job-status');
const workspace = workspaceId('workspace-briefing-job-status');

class FakeBriefingJobRepository implements BriefingJobRepositoryPort {
  constructor(private readonly jobs: readonly BriefingJob[]) {}

  async save(_job: BriefingJob): Promise<void> {
    return undefined;
  }

  async findById(params: Parameters<BriefingJobRepositoryPort['findById']>[0]): Promise<BriefingJob | null> {
    return this.jobs.find((job) => {
      const snapshot = job.toSnapshot();
      return (
        snapshot.tenantId === params.tenantId &&
        snapshot.workspaceId === params.workspaceId &&
        snapshot.id === params.briefingJobId
      );
    }) ?? null;
  }

  async findByIdempotencyKey(): Promise<BriefingJob | null> {
    return null;
  }

  async findRequested(params: Parameters<BriefingJobRepositoryPort['findRequested']>[0]): Promise<readonly BriefingJob[]> {
    return this.jobs
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
