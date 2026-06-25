import type { ReaderAction } from "./reader-action";
import type { SourceMixEntry } from "./source-mix-entry";
import type { ReaderTopicSection, ReaderTrendDelta, TopRead } from "./top-read";
import type { ReaderSummaryQualityState } from "../value-objects/summary-quality";

export type ReaderSummarySnapshot = {
  readonly headline: string;
  readonly oneLineTakeaway: string;
  readonly bullets: readonly string[];
  readonly qualityState: ReaderSummaryQualityState;
  readonly topicSections: readonly ReaderTopicSection[];
  readonly sourceMix: readonly SourceMixEntry[];
  readonly topReads: readonly TopRead[];
  readonly trendDelta: ReaderTrendDelta;
  readonly openQuestions: readonly string[];
  readonly risks: readonly string[];
  readonly nextActions: readonly ReaderAction[];
};
