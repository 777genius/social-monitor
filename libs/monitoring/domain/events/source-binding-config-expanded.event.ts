import type {
  EventEnvelope,
  TenantId,
  WorkspaceId,
} from '@social-monitor/shared-kernel';

export type SourceBindingConfigExpandedPayload = {
  readonly sourceBindingId: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly interestId: string;
  readonly providerKey: string;
  readonly topicLabel: string;
  readonly recommendationId: string;
  readonly changedConfigPaths: readonly string[];
};

export type SourceBindingConfigExpandedEvent =
  EventEnvelope<SourceBindingConfigExpandedPayload>;
