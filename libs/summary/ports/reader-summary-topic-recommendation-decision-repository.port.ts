import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

import type { ReaderSummaryTopicRecommendationDecision } from "../domain";

export const READER_SUMMARY_TOPIC_RECOMMENDATION_DECISION_REPOSITORY = Symbol(
  "READER_SUMMARY_TOPIC_RECOMMENDATION_DECISION_REPOSITORY",
);

export type ListReaderSummaryTopicRecommendationDecisionsQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly recommendationIds: readonly string[];
};

export type ReaderSummaryTopicRecommendationDecisionLookup = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly recommendationId: string;
};

export interface ReaderSummaryTopicRecommendationDecisionRepositoryPort {
  save(decision: ReaderSummaryTopicRecommendationDecision): Promise<void>;

  findByRecommendationId(
    lookup: ReaderSummaryTopicRecommendationDecisionLookup,
  ): Promise<ReaderSummaryTopicRecommendationDecision | null>;

  deleteByRecommendationId(
    lookup: ReaderSummaryTopicRecommendationDecisionLookup,
  ): Promise<void>;

  listByRecommendationIds(
    query: ListReaderSummaryTopicRecommendationDecisionsQuery,
  ): Promise<readonly ReaderSummaryTopicRecommendationDecision[]>;
}
