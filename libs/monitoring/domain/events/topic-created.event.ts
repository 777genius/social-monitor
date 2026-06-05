import type { EventEnvelope, TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type TopicCreatedPayload = {
  readonly topicId: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly name: string;
  readonly query: string;
};

export type TopicCreatedEvent = EventEnvelope<TopicCreatedPayload>;
