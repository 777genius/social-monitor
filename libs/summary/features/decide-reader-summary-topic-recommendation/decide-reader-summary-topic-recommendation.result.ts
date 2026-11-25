import type { ReaderSummaryTopicRecommendationDecision } from "../../domain";
import type {
  ReaderSummaryAcceptedTopicApplication,
  ReaderSummaryAcceptedTopicReversion,
} from "../../ports";

export type DecideReaderSummaryTopicRecommendationResult = {
  readonly decision?: ReaderSummaryTopicRecommendationDecision;
  readonly decisionStatus: "pending" | "accepted" | "rejected";
  readonly application: ReaderSummaryAcceptedTopicApplication;
  readonly reversion: ReaderSummaryAcceptedTopicReversion;
};
