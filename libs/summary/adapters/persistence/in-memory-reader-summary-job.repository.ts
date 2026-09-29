import type { ReaderSummaryJob } from "../../domain";
import type { ReaderSummaryJobRepositoryPort,
  ReaderSummaryJobPollingRepositoryPort } from "../../ports";

export class InMemoryReaderSummaryJobRepository implements ReaderSummaryJobPollingRepositoryPort {
  private readonly jobsById = new Map<string, ReaderSummaryJob>();
  private readonly jobsByIdempotencyKey = new Map<string, ReaderSummaryJob>();
  private mutationTail = Promise.resolve();

  async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.mutationTail;
    let release = (): void => undefined;
    this.mutationTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try { return await operation(); } finally { release(); }
  }

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
            snapshot.workspaceId === params.workspaceId) &&
          (params.now === undefined ||
            snapshot.preparationNextCheckAt === undefined ||
            snapshot.preparationNextCheckAt.getTime() <= params.now.getTime())
        );
      })
      .sort(compareRequestedJobs)
      .slice(0, params.limit);
  }

  async findDueForPolling(
    params: Parameters<ReaderSummaryJobPollingRepositoryPort["findDueForPolling"]>[0],
  ): Promise<readonly ReaderSummaryJob[]> {
    assertOptionalScopeIsComplete(params);
    return [...this.jobsById.values()]
      .filter((job) => {
        const snapshot = job.toSnapshot();
        if (params.tenantId !== undefined && snapshot.tenantId !== params.tenantId ||
            params.workspaceId !== undefined && snapshot.workspaceId !== params.workspaceId) {
          return false;
        }
        if (snapshot.status === "requested") {
          return snapshot.preparationNextCheckAt === undefined ||
            snapshot.preparationNextCheckAt <= params.now;
        }
        return snapshot.selectionStrategy === "jev_primary_v3" &&
          snapshot.status === "running" && snapshot.startedAt !== undefined &&
          snapshot.startedAt < params.staleRunningStartedBefore;
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
    if (snapshot.selectionStrategy === "jev_primary_v3") return null;
    const staleRunning =
      snapshot.status === "running" &&
      snapshot.startedAt !== undefined &&
      snapshot.startedAt < params.staleRunningStartedBefore;
    if (
      (snapshot.status === "failed" && snapshot.terminalFailureCode !== undefined) ||
      snapshot.status !== "requested" &&
      snapshot.status !== "failed" &&
      !staleRunning
    ) {
      return null;
    }

    const executableJob =
      snapshot.status === "failed"
        ? job.retry({ requestedAt: params.requestedAt })
        : staleRunning
          ? job
              .fail({
                failedAt: params.requestedAt,
                failureReason: "Reader summary execution lease expired",
              })
              .retry({ requestedAt: params.requestedAt })
        : job;
    const runningJob = executableJob.start({ startedAt: params.startedAt });
    await this.save(runningJob);

    return runningJob;
  }

  async saveExecutionOutcome(
    params: Parameters<
      ReaderSummaryJobRepositoryPort["saveExecutionOutcome"]
    >[0],
  ): Promise<boolean> {
    const outcome = params.job.toSnapshot();
    const key = `${outcome.tenantId}:${outcome.workspaceId}:${outcome.id}`;
    const current = this.jobsById.get(key)?.toSnapshot();
    if (
      current?.status !== "running" ||
      current.startedAt?.getTime() !== params.expectedStartedAt.getTime() ||
      outcome.startedAt?.getTime() !== params.expectedStartedAt.getTime() ||
      outcome.status === "running" ||
      outcome.status === "requested"
    ) {
      return false;
    }

    await this.save(params.job);
    return true;
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

const assertOptionalScopeIsComplete = (scope: {
  readonly tenantId?: string;
  readonly workspaceId?: string;
}): void => {
  if ((scope.tenantId === undefined) !== (scope.workspaceId === undefined)) {
    throw new Error("Reader summary job polling scope must include tenant and workspace");
  }
};
