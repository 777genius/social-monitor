import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { ScanPolicy } from '../domain';

export interface ScanPolicyRepositoryPort {
  save(policy: ScanPolicy): Promise<void>;
  findBySourceBinding(params: {
    tenantId: TenantId;
    workspaceId: WorkspaceId;
    sourceBindingId: string;
  }): Promise<ScanPolicy | null>;
}
