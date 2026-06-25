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
  claimForExecution(params: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly readerSummaryJobId: string;
    readonly requestedAt: Date;
    readonly startedAt: Date;
  }): Promise<ReaderSummaryJob | null>;
}
