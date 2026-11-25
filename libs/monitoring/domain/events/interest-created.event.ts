import type { EventEnvelope, TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type InterestCreatedPayload = {
  readonly interestId: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly name: string;
  readonly query: string;
};

export type InterestCreatedEvent = EventEnvelope<InterestCreatedPayload>;
