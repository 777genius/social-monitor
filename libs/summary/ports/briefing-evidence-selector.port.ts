import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { BriefingEvidenceSelection, BriefingScope } from '../domain';

export interface BriefingEvidenceSelectorPort {
  select(params: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly scope: BriefingScope;
    readonly userId?: string;
    readonly subscriptionId?: string;
    readonly maxItems: number;
  }): Promise<BriefingEvidenceSelection>;
}
