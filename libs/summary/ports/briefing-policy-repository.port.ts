import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { BriefingPolicy, BriefingScope } from '../domain';

export type FindBriefingPolicyByScopeQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scope: BriefingScope;
};

export interface BriefingPolicyRepositoryPort {
  save(policy: BriefingPolicy): Promise<void>;
  findByScope(query: FindBriefingPolicyByScopeQuery): Promise<BriefingPolicy | null>;
}
