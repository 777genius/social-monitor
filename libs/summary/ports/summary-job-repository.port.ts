import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { SummaryJob } from '../domain';

export interface SummaryJobRepositoryPort {
  save(job: SummaryJob): Promise<void>;
  findById(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    summaryJobId: string;
  }): Promise<SummaryJob | null>;
  findByIdempotencyKey(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    idempotencyKey: string;
  }): Promise<SummaryJob | null>;
  findRequested(params: {
    tenantId?: TenantId;
    workspaceId?: WorkspaceId;
    limit: number;
  }): Promise<readonly SummaryJob[]>;
}
