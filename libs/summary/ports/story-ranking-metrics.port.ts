import type {
  GuardedRecallGenerationAggregate,
  StoryRelationDecisionAggregate,
  SummaryEvidenceSelection,
} from "../domain";

export type StoryRelationVerificationMetric = {
  readonly lane: "semantic_primary" | "guarded_recall_primary";
  readonly status: "skipped" | "completed" | "failed_closed";
  readonly candidateCount: number;
  readonly approvedCount: number;
  readonly rejectedCount: number;
  readonly latencyMs: number;
  readonly attested: boolean;
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
  /** Aggregate-only telemetry with no pair ids or source text. */
  recordGuardedRecallGeneration?(
    aggregates: readonly GuardedRecallGenerationAggregate[],
  ): void;
}

export const NOOP_STORY_RANKING_METRICS: StoryRankingMetricsPort = {
  recordStoryRanking: () => undefined,
  recordStoryRelationVerification: () => undefined,
  recordRelatedTopicVerification: () => undefined,
  recordStoryRelationDecisionAggregates: () => undefined,
  recordGuardedRecallGeneration: () => undefined,
};
