import type { SummaryJob } from '../../domain';
import type { SummaryExecutionClaim, SummaryExecutionVersion, SummaryJobRepositoryPort } from '../../ports';

export class InMemorySummaryJobRepository implements SummaryJobRepositoryPort {
  private readonly jobsById = new Map<string, SummaryJob>();
  private readonly jobsByIdempotencyKey = new Map<string, SummaryJob>();
  private readonly versions = new Map<string, SummaryExecutionVersion>();
  private nextVersion = 0;

  async save(job: SummaryJob): Promise<void> {
    this.store(job);
  }

  /** Synchronous adapter write used by the atomic in-memory execution workflow. */
  store(job: SummaryJob): void {
    const snapshot = job.toSnapshot();
    const key = `${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`;
    this.jobsById.set(key, job);
    this.versions.set(key, String(++this.nextVersion) as SummaryExecutionVersion);
    this.jobsByIdempotencyKey.set(
      `${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.idempotencyKey}`,
      job,
    );
  }

  readForExecution(params: Parameters<SummaryJobRepositoryPort['findById']>[0]): SummaryExecutionClaim | null {
    const key = `${params.tenantId}:${params.workspaceId}:${params.summaryJobId}`;
    const job = this.jobsById.get(key);
    const version = this.versions.get(key);
    return job === undefined || version === undefined ? null : { job, version };
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
