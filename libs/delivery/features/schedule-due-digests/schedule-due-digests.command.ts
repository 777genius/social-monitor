import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { DigestSchedulePageCursor } from '../../ports';

export type DueDigestContinuation = DigestSchedulePageCursor & {
  readonly tenantId?: TenantId;
  readonly workspaceId?: WorkspaceId;
  readonly dueBefore: Date;
};

export type ScheduleDueDigestsCommand = {
  readonly tenantId?: TenantId;
  readonly workspaceId?: WorkspaceId;
  readonly limit: number;
  readonly continuation?: DueDigestContinuation;
};
