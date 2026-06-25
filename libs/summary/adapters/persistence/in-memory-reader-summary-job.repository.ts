import type { ReaderSummaryJob } from "../../domain";
import type { ReaderSummaryJobRepositoryPort } from "../../ports";

export class InMemoryReaderSummaryJobRepository implements ReaderSummaryJobRepositoryPort {
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
      .sort(compareRequestedJobs)
      .slice(0, params.limit);
  }

  async claimForExecution(
    params: Parameters<ReaderSummaryJobRepositoryPort["claimForExecution"]>[0],
  ): Promise<ReaderSummaryJob | null> {
    const key = `${params.tenantId}:${params.workspaceId}:${params.readerSummaryJobId}`;
    const job = this.jobsById.get(key);
    if (job === undefined) {
      return null;
    }

    const snapshot = job.toSnapshot();
    if (snapshot.status !== "requested" && snapshot.status !== "failed") {
      return null;
    }

    const executableJob =
      snapshot.status === "failed"
        ? job.retry({ requestedAt: params.requestedAt })
        : job;
    const runningJob = executableJob.start({ startedAt: params.startedAt });
    await this.save(runningJob);

    return runningJob;
  }

  all(): readonly ReaderSummaryJob[] {
    return [...this.jobsById.values()];
  }
}

const compareRequestedJobs = (
  left: ReaderSummaryJob,
  right: ReaderSummaryJob,
): number => {
  const leftSnapshot = left.toSnapshot();
  const rightSnapshot = right.toSnapshot();
  const requestedDiff =
    leftSnapshot.requestedAt.getTime() - rightSnapshot.requestedAt.getTime();

  if (requestedDiff !== 0) {
    return requestedDiff;
  }

  return leftSnapshot.id.localeCompare(rightSnapshot.id);
};
