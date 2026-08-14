import type { ReaderSummaryJob } from "../../domain";
import type { ReaderSummaryJobRepositoryPort } from "../../ports";

export class FakeReaderSummaryJobRepository
  implements ReaderSummaryJobRepositoryPort
{
  private readonly jobs = new Map<string, ReaderSummaryJob>();

  async save(job: ReaderSummaryJob): Promise<void> {
    const snapshot = job.toSnapshot();
    this.jobs.set(key(snapshot), job);
  }

  async findById(
    params: Parameters<ReaderSummaryJobRepositoryPort["findById"]>[0],
  ): Promise<ReaderSummaryJob | null> {
    return this.jobs.get(key(params)) ?? null;
  }

  async findByIdempotencyKey(
    params: Parameters<
      ReaderSummaryJobRepositoryPort["findByIdempotencyKey"]
    >[0],
  ): Promise<ReaderSummaryJob | null> {
    return (
      [...this.jobs.values()].find((job) => {
        const snapshot = job.toSnapshot();
        return (
          snapshot.tenantId === params.tenantId &&
          snapshot.workspaceId === params.workspaceId &&
          snapshot.idempotencyKey === params.idempotencyKey
        );
      }) ?? null
    );
  }

  async findRequested(): Promise<readonly ReaderSummaryJob[]> {
    return [];
  }

  async claimForExecution(
    params: Parameters<ReaderSummaryJobRepositoryPort["claimForExecution"]>[0],
  ): Promise<ReaderSummaryJob | null> {
    const job = await this.findById(params);
    if (job === null) {
      return null;
    }
    const snapshot = job.toSnapshot();
    const staleRunning =
      snapshot.status === "running" &&
      snapshot.startedAt !== undefined &&
      snapshot.startedAt < params.staleRunningStartedBefore;
    if (
      snapshot.status !== "requested" &&
      snapshot.status !== "failed" &&
      !staleRunning
    ) {
      return null;
    }
    const requested =
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
    const running = requested.start({ startedAt: params.startedAt });
    await this.save(running);
    return running;
  }

  async saveExecutionOutcome(
    params: Parameters<
      ReaderSummaryJobRepositoryPort["saveExecutionOutcome"]
    >[0],
  ): Promise<boolean> {
    const snapshot = params.job.toSnapshot();
    const current = await this.findById({
      tenantId: snapshot.tenantId,
      workspaceId: snapshot.workspaceId,
      readerSummaryJobId: snapshot.id,
    });
    if (
      current?.toSnapshot().status !== "running" ||
      current.toSnapshot().startedAt?.getTime() !==
        params.expectedStartedAt.getTime()
    ) {
      return false;
    }
    await this.save(params.job);
    return true;
  }
}

const key = (params: {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly id?: string;
  readonly readerSummaryJobId?: string;
}): string =>
  `${params.tenantId}:${params.workspaceId}:${params.id ?? params.readerSummaryJobId}`;
