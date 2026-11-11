import type {
  GeneratedReaderSummaryDraft,
  ReaderSummaryCitation,
  ReaderSummaryQualityFlag,
} from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";
import { asRecord, normalizeRecordArray } from "./openai-responses-reader-summary-raw-values";
import { uniqueNonEmptyStrings } from "./openai-responses-reader-summary-text-values";
import {
  normalizeRisks,
  normalizeConfidence,
  normalizeQualityFlags,
} from "./openai-responses-reader-summary-quality";
import {
  normalizeInterestHighlights,
  normalizeRepeatedSignals,
} from "./openai-responses-reader-summary-evidence-relations";

type OptionalDraftContent = Pick<
  GeneratedReaderSummaryDraft,
  "interestHighlights" | "repeatedSignals" | "risksAndUnknowns" | "confidence"
> & {
  readonly normalizedQualityFlags: GeneratedReaderSummaryDraft["qualityFlags"];
};

/**
 * Apply the selected publication policy to optional, untrusted provider fields.
 * Disabled sections are not decoded; mandatory quality/confidence constraints
 * are evaluated regardless of optional-section policy flags.
 */
export const normalizeOpenAiReaderSummaryOptionalContent = (params: {
  readonly raw: Record<string, unknown>;
  readonly input: ReaderSummaryModelInput;
  readonly citationMap: readonly ReaderSummaryCitation[];
  readonly topStoryCount: number;
}): OptionalDraftContent => {
  const { raw, input, citationMap, topStoryCount } = params;
  const interestHighlights = input.policy.includeInterestHighlights
    ? normalizeInterestHighlights(
        normalizeRecordArray(raw.interestHighlights),
        input,
        citationMap,
      )
    : [];
  const repeatedSignals = input.policy.includeRepeatedSignals
    ? normalizeRepeatedSignals(
        normalizeRecordArray(raw.repeatedSignals),
        input,
        citationMap,
      )
    : [];
  const risksAndUnknowns = input.policy.includeRisks
    ? normalizeRisks(
        normalizeRecordArray(raw.risksAndUnknowns ?? raw.risks),
        citationMap,
      )
    : [];
  const rawQualityFlags = normalizeQualityFlags(raw.qualityFlags);
  const normalizedQualityFlags =
    topStoryCount === 0
      ? (uniqueNonEmptyStrings([
          ...rawQualityFlags,
          "no_signal",
          "limited_sources",
        ]) as readonly ReaderSummaryQualityFlag[])
      : rawQualityFlags.filter((flag) => flag !== "no_signal");
  const confidence = normalizeConfidence(
    asRecord(raw.confidence) ?? {},
    topStoryCount,
  );
  return {
    interestHighlights,
    repeatedSignals,
    risksAndUnknowns,
    normalizedQualityFlags,
    confidence,
  };
};
