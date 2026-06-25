import type { BriefingEvidenceSelection } from '../domain';

export interface StoryRankingMetricsPort {
  recordStoryRanking(selection: BriefingEvidenceSelection): void;
}

export const NOOP_STORY_RANKING_METRICS: StoryRankingMetricsPort = {
  recordStoryRanking: () => undefined,
};
