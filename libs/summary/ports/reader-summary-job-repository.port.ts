import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

import type { ReaderSummaryJob } from "../domain";

export interface ReaderSummaryJobRepositoryPort {
  save(job: ReaderSummaryJob): Promise<void>;
  findById(params: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly readerSummaryJobId: string;
  }): Promise<ReaderSummaryJob | null>;
  findByIdempotencyKey(params: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly idempotencyKey: string;
  }): Promise<ReaderSummaryJob | null>;
  findRequested(params: {
    readonly tenantId?: TenantId;
    readonly workspaceId?: WorkspaceId;
    readonly limit: number;
  }): Promise<readonly ReaderSummaryJob[]>;
  /** Claim REQUESTED/FAILED or RUNNING started strictly before the stale boundary. */
  claimForExecution(params: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly readerSummaryJobId: string;
    readonly requestedAt: Date;
    readonly startedAt: Date;
    readonly staleRunningStartedBefore: Date;
  }): Promise<ReaderSummaryJob | null>;
  /** Persist a terminal result only while the exact execution fence is active. */
  saveExecutionOutcome(params: {
    readonly job: ReaderSummaryJob;
    readonly expectedStartedAt: Date;
  }): Promise<boolean>;
}
