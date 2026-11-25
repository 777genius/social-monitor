import type { GeneratedReaderSummaryDraft, ReaderSummaryCitation } from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";
import { normalizeRecordArray } from "./openai-responses-reader-summary-raw-values";
import { normalizeRisks } from "./openai-responses-reader-summary-quality";
import {
  normalizeInterestHighlights,
  normalizeRepeatedSignals,
} from "./openai-responses-reader-summary-evidence-relations";

/** Decode only enabled optional sections; disabled untrusted sections are ignored. */
export const normalizeOpenAiReaderSummaryEnabledSections = (params: {
  readonly raw: Record<string, unknown>;
  readonly input: ReaderSummaryModelInput;
  readonly citationMap: readonly ReaderSummaryCitation[];
}): Pick<GeneratedReaderSummaryDraft, "interestHighlights" | "repeatedSignals" | "risksAndUnknowns"> => {
  const { raw, input, citationMap } = params;
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
  return { interestHighlights, repeatedSignals, risksAndUnknowns };
};
