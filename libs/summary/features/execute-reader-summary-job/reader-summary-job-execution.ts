import {
  type Clock,
  DomainError,
  err,
  type Result,
  type TenantId,
  type WorkspaceId,
} from "@social-monitor/shared-kernel";

import type { ReaderSummaryJob } from "../../domain";
import type { ReaderSummaryJobRepositoryPort } from "../../ports";
import type { ReaderSummaryExecutionLeasePolicy } from "./reader-summary-execution-lease.policy";

export const claimReaderSummaryJobExecution = async (params: {
  readonly jobs: ReaderSummaryJobRepositoryPort;
  readonly clock: Clock;
  readonly lease: ReaderSummaryExecutionLeasePolicy;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly readerSummaryJobId: string;
}): Promise<ReaderSummaryJob | null> => {
  const startedAt = params.clock.now();
  return params.jobs.claimForExecution({
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    readerSummaryJobId: params.readerSummaryJobId,
    requestedAt: startedAt,
    startedAt,
    staleRunningStartedBefore: params.lease.staleRunningStartedBefore(startedAt),
  });
};

export const saveReaderSummaryExecutionOutcome = (
  jobs: ReaderSummaryJobRepositoryPort,
  job: ReaderSummaryJob,
  expectedStartedAt: Date,
): Promise<boolean> => jobs.saveExecutionOutcome({ job, expectedStartedAt });

export const readerSummaryExecutionClaimLost = (): Result<never, DomainError> =>
  err(
    new DomainError(
      "operation.conflict",
      "Reader summary execution claim is no longer active",
    ),
  );
