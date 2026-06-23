import type { BriefingJob } from '../../domain';
import type { BriefingJobRepositoryPort } from '../../ports';

export class InMemoryBriefingJobRepository implements BriefingJobRepositoryPort {
  private readonly jobsById = new Map<string, BriefingJob>();
  private readonly jobsByIdempotencyKey = new Map<string, BriefingJob>();

  async save(job: BriefingJob): Promise<void> {
    const snapshot = job.toSnapshot();
    this.jobsById.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`, job);
    this.jobsByIdempotencyKey.set(
      `${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.idempotencyKey}`,
      job,
    );
  }

  async findById(params: Parameters<BriefingJobRepositoryPort['findById']>[0]): Promise<BriefingJob | null> {
    return this.jobsById.get(`${params.tenantId}:${params.workspaceId}:${params.briefingJobId}`) ?? null;
  }

  async findByIdempotencyKey(
    params: Parameters<BriefingJobRepositoryPort['findByIdempotencyKey']>[0],
  ): Promise<BriefingJob | null> {
    return this.jobsByIdempotencyKey.get(`${params.tenantId}:${params.workspaceId}:${params.idempotencyKey}`) ?? null;
  }

  async findRequested(
    params: Parameters<BriefingJobRepositoryPort['findRequested']>[0],
  ): Promise<readonly BriefingJob[]> {
    return [...this.jobsById.values()]
      .filter((job) => {
        const snapshot = job.toSnapshot();

        return (
          snapshot.status === 'requested' &&
          (params.tenantId === undefined || snapshot.tenantId === params.tenantId) &&
          (params.workspaceId === undefined || snapshot.workspaceId === params.workspaceId)
        );
      })
      .sort(compareRequestedJobs)
      .slice(0, params.limit);
  }

  async claimForExecution(
    params: Parameters<BriefingJobRepositoryPort['claimForExecution']>[0],
  ): Promise<BriefingJob | null> {
    const key = `${params.tenantId}:${params.workspaceId}:${params.briefingJobId}`;
    const job = this.jobsById.get(key);
    if (job === undefined) {
      return null;
    }

    const snapshot = job.toSnapshot();
    if (snapshot.status !== 'requested' && snapshot.status !== 'failed') {
      return null;
    }

    const executableJob = snapshot.status === 'failed'
      ? job.retry({ requestedAt: params.requestedAt })
      : job;
    const runningJob = executableJob.start({ startedAt: params.startedAt });
    await this.save(runningJob);

    return runningJob;
  }

  all(): readonly BriefingJob[] {
    return [...this.jobsById.values()];
  }
}

const compareRequestedJobs = (left: BriefingJob, right: BriefingJob): number => {
  const leftSnapshot = left.toSnapshot();
  const rightSnapshot = right.toSnapshot();
  const requestedDiff = leftSnapshot.requestedAt.getTime() - rightSnapshot.requestedAt.getTime();

  if (requestedDiff !== 0) {
    return requestedDiff;
  }

  return leftSnapshot.id.localeCompare(rightSnapshot.id);
};
