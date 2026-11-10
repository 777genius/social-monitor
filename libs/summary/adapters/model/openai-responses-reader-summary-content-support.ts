import {
  emptyReaderSummaryReliabilityReport,
  type ReaderSummaryCitation,
  type ReaderSummaryContent,
} from "../../domain";
import { requiredArray, requiredRecord, requiredString, requiredStringArray } from "./openai-responses-reader-summary-parsers";
import {
  normalizeReaderInterestSection,
  normalizeReaderItem,
  normalizeNextAction,
} from "./openai-responses-reader-summary-content-items";
import {
  normalizeQualityState,
  normalizeSourceMixEntry,
  normalizeTrendDelta,
} from "./openai-responses-reader-summary-content-quality";

export { openAiReaderSummaryContentJsonSchemaDefs } from "./openai-responses-reader-summary-json-schema";

export const normalizeOpenAiReaderBrief = (
  value: Record<string, unknown>,
  citationMap: readonly ReaderSummaryCitation[],
): ReaderSummaryContent => {
  const citationById = new Map(
    citationMap.map((citation) => [citation.citationId, citation] as const),
  );
  const sourceMix = requiredArray<Record<string, unknown>>(
    value.sourceMix,
    "reader summary content source mix",
  ).map(normalizeSourceMixEntry);

  return {
    headline: requiredString(value.headline, "reader summary content headline"),
    oneLineTakeaway: requiredString(
      value.oneLineTakeaway,
      "reader summary content takeaway",
    ),
    bullets: requiredStringArray(
      value.bullets,
      "reader summary content bullets",
    ),
    qualityState: normalizeQualityState(value.qualityState, sourceMix),
    interestSections: requiredArray<Record<string, unknown>>(
      value.interestSections,
      "reader summary content interest sections",
    ).map((section) => normalizeReaderInterestSection(section, citationById)),
    sourceMix,
    topReads: requiredArray<Record<string, unknown>>(
      value.topReads,
      "reader summary content top reads",
    ).map((item) => normalizeReaderItem(item, citationById)),
    claimBoard: [],
    reliabilityReport: emptyReaderSummaryReliabilityReport(),
    trendDelta: normalizeTrendDelta(
      requiredRecord(value.trendDelta, "reader summary content trend delta"),
    ),
    openQuestions: requiredStringArray(
      value.openQuestions,
      "reader summary content open questions",
    ),
    risks: requiredStringArray(value.risks, "reader summary content risks"),
    nextActions: requiredArray<Record<string, unknown>>(
      value.nextActions,
      "reader summary content next actions",
    ).map((action) => normalizeNextAction(action, citationById)),
  };
};
