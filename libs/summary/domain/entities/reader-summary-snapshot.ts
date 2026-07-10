import type { ReaderAction } from "./reader-action";
import type { ReaderSummaryClaim } from "./reader-summary-claim";
import type { ReaderSummaryNarrativeSection } from "./reader-summary-narrative-section";
import type { ReaderSummaryReliabilityReport } from "./reader-summary-reliability";
import type { ReaderSummaryTopicMap } from "./reader-summary-topic-map";
import type { SourceMixEntry } from "./source-mix-entry";
import type {
  ReaderInterestSection,
  ReaderTrendDelta,
  TopRead,
} from "./top-read";
import type { ReaderSummaryQualityState } from "../value-objects/summary-quality";

export type ReaderSummarySnapshot = {
  readonly headline: string;
  readonly oneLineTakeaway: string;
  readonly bullets: readonly string[];
  readonly narrativeSections?: readonly ReaderSummaryNarrativeSection[];
  readonly mainTopics?: readonly string[];
  readonly topicMap?: ReaderSummaryTopicMap;
  readonly qualityState: ReaderSummaryQualityState;
  readonly interestSections: readonly ReaderInterestSection[];
  readonly sourceMix: readonly SourceMixEntry[];
  readonly topReads: readonly TopRead[];
  readonly selectedPosts?: readonly TopRead[];
  readonly claimBoard: readonly ReaderSummaryClaim[];
  readonly reliabilityReport: ReaderSummaryReliabilityReport;
  readonly trendDelta: ReaderTrendDelta;
  readonly openQuestions: readonly string[];
  readonly risks: readonly string[];
  readonly nextActions: readonly ReaderAction[];
};
