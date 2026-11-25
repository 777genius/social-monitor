import type { ReaderSummaryTopicRecommendation } from "../../domain";

export type ListReaderSummaryTopicRecommendationsResult = {
  readonly windowStartedAt: Date;
  readonly windowEndedAt: Date;
  readonly items: readonly ReaderSummaryTopicRecommendation[];
};
