import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { PublicApiAuditActorType, PublicApiAuditMetadataValue, PublicApiAuditOutcome } from '../../ports';

export type RecordPublicApiAuditEventCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly actorType: PublicApiAuditActorType;
  readonly actorId: string;
  readonly action: string;
  readonly outcome: PublicApiAuditOutcome;
  readonly reasonCode?: string;
  readonly resourceType: string;
  readonly resourceId?: string;
  readonly metadata?: Readonly<Record<string, PublicApiAuditMetadataValue>>;
};
