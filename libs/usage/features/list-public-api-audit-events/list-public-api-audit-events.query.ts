import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { PublicApiAuditOutcome, PublicApiAuditRecord } from '../../ports';

export type ListPublicApiAuditEventsQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly actorType?: PublicApiAuditRecord['actorType'];
  readonly actorId?: string;
  readonly action?: string;
  readonly outcome?: PublicApiAuditOutcome;
  readonly resourceType?: string;
  readonly limit: number;
  readonly cursor?: string;
};
