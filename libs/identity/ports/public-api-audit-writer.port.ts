import type {
  DomainError,
  Result,
  TenantId,
  WorkspaceId,
} from '@social-monitor/shared-kernel';

export type IdentityPublicApiAuditMetadataValue =
  | string
  | number
  | boolean
  | readonly string[]
  | undefined;
export type IdentityPublicApiAuditOutcome =
  | 'succeeded'
  | 'failed'
  | 'denied';
export type IdentityPublicApiAuditActorType =
  | 'api_key'
  | 'system'
  | 'user';

export type RecordIdentityPublicApiAuditCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly actorType: IdentityPublicApiAuditActorType;
  readonly actorId: string;
  readonly action: string;
  readonly outcome: IdentityPublicApiAuditOutcome;
  readonly reasonCode?: string;
  readonly resourceType: string;
  readonly resourceId?: string;
  readonly metadata?: Readonly<
    Record<string, IdentityPublicApiAuditMetadataValue>
  >;
};

export type RecordIdentityPublicApiAuditResult = {
  readonly auditEventId: string;
  readonly occurredAt: string;
};

export interface PublicApiAuditWriterPort {
  record(
    command: RecordIdentityPublicApiAuditCommand,
  ): Promise<Result<RecordIdentityPublicApiAuditResult, DomainError>>;
}
