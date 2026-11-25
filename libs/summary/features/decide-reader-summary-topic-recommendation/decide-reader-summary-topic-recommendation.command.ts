import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

export type DecideReaderSummaryTopicRecommendationAction =
  | "accept"
  | "reject"
  | "undo";

export type DecideReaderSummaryTopicRecommendationCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly recommendationId: string;
  readonly topicLabel: string;
  readonly action: DecideReaderSummaryTopicRecommendationAction;
  readonly interestIds?: readonly string[];
  readonly providerKeys?: readonly string[];
  readonly decidedBy: string;
  readonly note?: string;
  readonly idempotencyKey?: string;
  readonly correlationId?: string;
};
