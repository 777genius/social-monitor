import type { CausationId, CorrelationId, EventId, TenantId, WorkspaceId } from './ids';

export type EventEnvelope<TPayload extends Readonly<Record<string, unknown>>> = {
  readonly eventId: EventId;
  readonly eventType: string;
  readonly schemaVersion: number;
  readonly occurredAt: Date;
  readonly tenantId?: TenantId;
  readonly workspaceId?: WorkspaceId;
  readonly correlationId: CorrelationId;
  readonly causationId?: CausationId;
  readonly payload: TPayload;
};
