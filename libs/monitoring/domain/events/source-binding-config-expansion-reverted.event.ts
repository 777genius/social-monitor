import type {
  EventEnvelope,
  TenantId,
  WorkspaceId,
} from '@social-monitor/shared-kernel';

export type SourceBindingConfigExpansionRevertedPayload = {
  readonly sourceBindingId: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly interestId: string;
  readonly providerKey: string;
  readonly topicLabel: string;
  readonly recommendationId: string;
  readonly restoredConfigPaths: readonly string[];
};

export type SourceBindingConfigExpansionRevertedEvent =
  EventEnvelope<SourceBindingConfigExpansionRevertedPayload>;
