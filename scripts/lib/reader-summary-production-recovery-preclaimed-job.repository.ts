import type { ReaderSummaryJob } from "@social-monitor/summary/domain";
import type { ReaderSummaryJobRepositoryPort } from "@social-monitor/summary/ports";

export class PreclaimedRecoveryJobRepository
  implements ReaderSummaryJobRepositoryPort
{
  private claimAccepted = false;

  constructor(
    private readonly expectedJob: ReaderSummaryJob,
    private readonly durableJobs: ReaderSummaryJobRepositoryPort,
  ) {}

  async save(job: ReaderSummaryJob): Promise<void> {
    await this.durableJobs.save(job);
  }

  async findById(
    params: Parameters<ReaderSummaryJobRepositoryPort["findById"]>[0],
  ): Promise<ReaderSummaryJob | null> {
    if (!this.claimAccepted && this.matches(params)) {
      return this.expectedJob;
    }
    return this.durableJobs.findById(params);
  }

  async findByIdempotencyKey(
    params: Parameters<
      ReaderSummaryJobRepositoryPort["findByIdempotencyKey"]
    >[0],
  ): Promise<ReaderSummaryJob | null> {
    return this.durableJobs.findByIdempotencyKey(params);
  }

  async findRequested(
    params: Parameters<ReaderSummaryJobRepositoryPort["findRequested"]>[0],
  ): Promise<readonly ReaderSummaryJob[]> {
    return this.durableJobs.findRequested(params);
  }

  async claimForExecution(
    params: Parameters<
      ReaderSummaryJobRepositoryPort["claimForExecution"]
    >[0],
  ): Promise<ReaderSummaryJob | null> {
    if (this.claimAccepted || !this.matches(params)) {
      return null;
    }
    const durable = await this.durableJobs.findById(params);
    if (
      durable === null ||
      !isExactPreclaimedRecoveryJob(durable, this.expectedJob)
    ) {
      throw new Error(
        "Reader summary production recovery durable pre-model lease is invalid",
      );
    }
    this.claimAccepted = true;
    return durable;
  }

  async saveExecutionOutcome(
    params: Parameters<
      ReaderSummaryJobRepositoryPort["saveExecutionOutcome"]
    >[0],
  ): Promise<boolean> {
    return this.durableJobs.saveExecutionOutcome(params);
  }

  private matches(params: {
    tenantId: string;
    workspaceId: string;
    readerSummaryJobId: string;
  }): boolean {
    const expected = this.expectedJob.toSnapshot();
    return (
      params.tenantId === expected.tenantId &&
      params.workspaceId === expected.workspaceId &&
      params.readerSummaryJobId === expected.id
    );
  }
}

const isExactPreclaimedRecoveryJob = (
  durableJob: ReaderSummaryJob,
  expectedJob: ReaderSummaryJob,
): boolean => {
  const durable = durableJob.toSnapshot();
  const expected = expectedJob.toSnapshot();
  return (
    durable.id === expected.id &&
    durable.tenantId === expected.tenantId &&
    durable.workspaceId === expected.workspaceId &&
    durable.scope.type === "workspace" &&
    durable.period.periodKey === expected.period.periodKey &&
    durable.idempotencyKey === expected.idempotencyKey &&
    durable.status === "running" &&
    durable.startedAt !== undefined &&
    durable.completedAt === undefined &&
    durable.failedAt === undefined &&
    durable.readerSummaryId === undefined &&
    durable.failureReason === undefined
  );
};
