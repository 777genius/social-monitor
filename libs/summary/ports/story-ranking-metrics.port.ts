import type { SummaryEvidenceSelection } from "../domain";

export interface StoryRankingMetricsPort {
  recordStoryRanking(selection: SummaryEvidenceSelection): void;
}

export const NOOP_STORY_RANKING_METRICS: StoryRankingMetricsPort = {
  recordStoryRanking: () => undefined,
};
