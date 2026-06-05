import type { EventEnvelope, TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type SourceBindingEnabledPayload = {
  readonly sourceBindingId: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly topicId: string;
  readonly providerKey: string;
  readonly capabilityProfileVersion: number;
};

export type SourceBindingEnabledEvent = EventEnvelope<SourceBindingEnabledPayload>;
