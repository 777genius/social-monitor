import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type ApplyAcceptedTopicRecommendationCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly recommendationId: string;
  readonly topicLabel: string;
  readonly interestIds: readonly string[];
  readonly providerKeys?: readonly string[];
  readonly decidedBy: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
};

export type RevertAcceptedTopicRecommendationCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly recommendationId: string;
  readonly topicLabel: string;
  readonly sourceBindingUpdates: readonly {
    readonly sourceBindingId: string;
    readonly interestId: string;
    readonly providerKey: string;
    readonly changed: boolean;
    readonly changedConfigPaths: readonly string[];
    readonly rollbackToken?: Readonly<Record<string, unknown>>;
  }[];
  readonly decidedBy: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
};
