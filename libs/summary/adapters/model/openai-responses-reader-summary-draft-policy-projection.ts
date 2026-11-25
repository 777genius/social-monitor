import type { GeneratedReaderSummaryDraft, ReaderSummaryCitation } from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";
import { normalizeOpenAiReaderSummaryEnabledSections } from "./openai-responses-reader-summary-draft-enabled-sections";
import { normalizeOpenAiReaderSummaryMandatoryQuality } from "./openai-responses-reader-summary-draft-mandatory-quality";

type OptionalDraftContent = Pick<
  GeneratedReaderSummaryDraft,
  "interestHighlights" | "repeatedSignals" | "risksAndUnknowns" | "confidence"
> & {
  readonly normalizedQualityFlags: GeneratedReaderSummaryDraft["qualityFlags"];
};

/** Compose optional publication and required quality policies in original evaluation order. */
export const normalizeOpenAiReaderSummaryOptionalContent = (params: {
  readonly raw: Record<string, unknown>;
  readonly input: ReaderSummaryModelInput;
  readonly citationMap: readonly ReaderSummaryCitation[];
  readonly topStoryCount: number;
}): OptionalDraftContent => ({
  ...normalizeOpenAiReaderSummaryEnabledSections({
    raw: params.raw,
    input: params.input,
    citationMap: params.citationMap,
  }),
  ...normalizeOpenAiReaderSummaryMandatoryQuality(params.raw, params.topStoryCount),
});
