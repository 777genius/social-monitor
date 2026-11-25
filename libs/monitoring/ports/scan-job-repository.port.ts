import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { ScanJob } from '../domain';

export interface ScanJobRepositoryPort {
  save(job: ScanJob): Promise<void>;
  findById(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    scanJobId: string;
  }): Promise<ScanJob | null>;
  findActiveBySourceBinding(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    sourceBindingId: string;
  }): Promise<ScanJob | null>;
  findLatestBySourceBinding(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    sourceBindingId: string;
  }): Promise<ScanJob | null>;
  findByIdempotencyKey(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    idempotencyKey: string;
  }): Promise<ScanJob | null>;
}
