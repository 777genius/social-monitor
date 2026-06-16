import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type PublicApiAuditMetadataValue = string | number | boolean | readonly string[] | undefined;
export type PublicApiAuditOutcome = 'succeeded' | 'failed' | 'denied';

export type PublicApiAuditRecord = {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly actorType: 'api_key' | 'system';
  readonly actorId: string;
  readonly action: string;
  readonly outcome: PublicApiAuditOutcome;
  readonly reasonCode?: string;
  readonly resourceType: string;
  readonly resourceId?: string;
  readonly metadata: Readonly<Record<string, PublicApiAuditMetadataValue>>;
  readonly occurredAt: Date;
};

export type ListPublicApiAuditRecordsQuery = {
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

export type ListPublicApiAuditRecordsResult = {
  readonly records: readonly PublicApiAuditRecord[];
  readonly nextCursor?: string;
};

export interface PublicApiAuditLogPort {
  append(record: PublicApiAuditRecord): Promise<void>;
  list(query: ListPublicApiAuditRecordsQuery): Promise<ListPublicApiAuditRecordsResult>;
}
