import type { SummaryEvidenceSelection } from "../domain";

export type StoryRelationVerificationMetric = {
  readonly status: "skipped" | "completed" | "failed_closed";
  readonly candidateCount: number;
  readonly approvedCount: number;
};

export interface StoryRankingMetricsPort {
  recordStoryRanking(selection: SummaryEvidenceSelection): void;
  recordStoryRelationVerification(
    metric: StoryRelationVerificationMetric,
  ): void;
}

export const NOOP_STORY_RANKING_METRICS: StoryRankingMetricsPort = {
  recordStoryRanking: () => undefined,
  recordStoryRelationVerification: () => undefined,
};
