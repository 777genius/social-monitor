import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { BriefingScope } from '../../domain';

export type RequestBriefingCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scope: BriefingScope;
  readonly userId?: string;
  readonly subscriptionId?: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
};
