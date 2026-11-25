import type { SummaryJob } from '../../domain';
import type { SummaryJobRepositoryPort } from '../../ports';

export class InMemorySummaryJobRepository implements SummaryJobRepositoryPort {
  private readonly jobsById = new Map<string, SummaryJob>();
  private readonly jobsByIdempotencyKey = new Map<string, SummaryJob>();

  async save(job: SummaryJob): Promise<void> {
    const snapshot = job.toSnapshot();
    this.jobsById.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`, job);
    this.jobsByIdempotencyKey.set(
      `${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.idempotencyKey}`,
      job,
    );
  }

  async findById(params: Parameters<SummaryJobRepositoryPort['findById']>[0]): Promise<SummaryJob | null> {
    return this.jobsById.get(`${params.tenantId}:${params.workspaceId}:${params.summaryJobId}`) ?? null;
  }

  async findByIdempotencyKey(
    params: Parameters<SummaryJobRepositoryPort['findByIdempotencyKey']>[0],
  ): Promise<SummaryJob | null> {
    return this.jobsByIdempotencyKey.get(`${params.tenantId}:${params.workspaceId}:${params.idempotencyKey}`) ?? null;
  }

  async findRequested(params: Parameters<SummaryJobRepositoryPort['findRequested']>[0]): Promise<readonly SummaryJob[]> {
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

  all(): readonly SummaryJob[] {
    return [...this.jobsById.values()];
  }
}

const compareRequestedJobs = (left: SummaryJob, right: SummaryJob): number => {
  const leftSnapshot = left.toSnapshot();
  const rightSnapshot = right.toSnapshot();
  const requestedDiff = leftSnapshot.requestedAt.getTime() - rightSnapshot.requestedAt.getTime();

  if (requestedDiff !== 0) {
    return requestedDiff;
  }

  return leftSnapshot.id.localeCompare(rightSnapshot.id);
};
