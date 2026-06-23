import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { BriefingScope } from '../../domain';

export type ListBriefingsQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scope?: BriefingScope;
  readonly limit: number;
  readonly cursor?: string;
};
