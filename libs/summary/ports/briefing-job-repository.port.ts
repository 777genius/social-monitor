import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { BriefingJob } from '../domain';

export interface BriefingJobRepositoryPort {
  save(job: BriefingJob): Promise<void>;
  findById(params: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly briefingJobId: string;
  }): Promise<BriefingJob | null>;
  findByIdempotencyKey(params: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly idempotencyKey: string;
  }): Promise<BriefingJob | null>;
  findRequested(params: {
    readonly tenantId?: TenantId;
    readonly workspaceId?: WorkspaceId;
    readonly limit: number;
  }): Promise<readonly BriefingJob[]>;
  claimForExecution(params: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly briefingJobId: string;
    readonly requestedAt: Date;
    readonly startedAt: Date;
  }): Promise<BriefingJob | null>;
}
