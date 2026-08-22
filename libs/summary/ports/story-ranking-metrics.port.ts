import type {
  StoryRelationSafeRecallShadowDecisionAggregate,
  StoryRelationSafeRecallShadowGenerationAggregate,
  StoryRelationDecisionAggregate,
  SummaryEvidenceSelection,
} from "../domain";

export type StoryRelationVerificationMetric = {
  readonly status: "skipped" | "completed" | "failed_closed";
  readonly candidateCount: number;
  readonly approvedCount: number;
};

export type RelatedTopicVerificationMetric = Readonly<{
  status: "skipped" | "completed" | "failed_closed" | "timed_out";
  candidateCount: number;
  approvedCount: number;
  latencyMs: number;
}>;

export interface StoryRankingMetricsPort {
  recordStoryRanking(selection: SummaryEvidenceSelection): void;
  recordStoryRelationVerification(
    metric: StoryRelationVerificationMetric,
  ): void;
  recordRelatedTopicVerification?(
    metric: RelatedTopicVerificationMetric,
  ): void;
  /** Optional for backwards compatibility with existing metrics fakes. */
  recordStoryRelationDecisionAggregates?(
    aggregates: readonly StoryRelationDecisionAggregate[],
  ): void;
  /** Shadow-only, aggregate-only telemetry with no pair ids or source text. */
  recordStoryRelationSafeRecallShadowGeneration?(
    aggregates: readonly StoryRelationSafeRecallShadowGenerationAggregate[],
  ): void;
  /** Shadow-only decision telemetry isolated from production verification. */
  recordStoryRelationSafeRecallShadowDecisions?(
    aggregates: readonly StoryRelationSafeRecallShadowDecisionAggregate[],
  ): void;
}

export const NOOP_STORY_RANKING_METRICS: StoryRankingMetricsPort = {
  recordStoryRanking: () => undefined,
  recordStoryRelationVerification: () => undefined,
  recordRelatedTopicVerification: () => undefined,
  recordStoryRelationDecisionAggregates: () => undefined,
  recordStoryRelationSafeRecallShadowGeneration: () => undefined,
  recordStoryRelationSafeRecallShadowDecisions: () => undefined,
};
