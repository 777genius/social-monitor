import { buildReaderSummary, type GeneratedReaderSummaryDraft, type ReaderSummaryNarrativeSection } from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";
import { assertOpenAiReaderSummaryDraftShape } from "./reader-summary-draft-shape-contract";

/**
 * Assemble an already-normalized, source-bound draft into the domain document.
 * Provider JSON coercion and citation trust belong to the upstream normalizer;
 * this boundary owns publication content, lineage and final draft validation.
 */
export type NormalizedOpenAiReaderSummaryDraftParts = {
  readonly input: ReaderSummaryModelInput;
  readonly headline: string;
  readonly executiveSummary: string;
  readonly narrativeSections: readonly ReaderSummaryNarrativeSection[];
  readonly normalizedTopStories: GeneratedReaderSummaryDraft["topStories"];
  readonly interestHighlights: GeneratedReaderSummaryDraft["interestHighlights"];
  readonly repeatedSignals: GeneratedReaderSummaryDraft["repeatedSignals"];
  readonly risksAndUnknowns: GeneratedReaderSummaryDraft["risksAndUnknowns"];
  readonly citationMap: GeneratedReaderSummaryDraft["citationMap"];
  readonly normalizedQualityFlags: GeneratedReaderSummaryDraft["qualityFlags"];
  readonly confidence: GeneratedReaderSummaryDraft["confidence"];
  readonly lineage: GeneratedReaderSummaryDraft["lineage"];
  readonly usage: GeneratedReaderSummaryDraft["usage"];
  readonly noSignalReason: GeneratedReaderSummaryDraft["noSignalReason"];
};

export const assembleOpenAiReaderSummaryDraft = (
  params: NormalizedOpenAiReaderSummaryDraftParts,
): GeneratedReaderSummaryDraft => {
  const {
    input,
    headline,
    executiveSummary,
    narrativeSections,
    normalizedTopStories,
    interestHighlights,
    repeatedSignals,
    risksAndUnknowns,
    citationMap,
    normalizedQualityFlags,
    confidence,
    lineage,
    usage,
    noSignalReason,
  } = params;
  const content = buildReaderSummary({
    headline,
    executiveSummary,
    narrativeSections,
    topStories: normalizedTopStories,
    interestHighlights,
    repeatedSignals,
    risksAndUnknowns,
    citationMap,
    storyClusters: input.evidence.clusters,
    sourceWindow: input.evidence.sourceWindow,
    selectedEvidence: input.evidence.selectedEvidence,
    editorialSlate: input.evidence.editorialSlate,
    promotionV3: input.evidence.promotionV3,
    dailyGenerationInput: input.evidence.dailyGenerationInput,
    dailyGenerationEvidence: input.evidence.dailyGenerationEvidence,
    qualityFlags: normalizedQualityFlags,
    noSignalReason,
  });
  const draft: GeneratedReaderSummaryDraft = {
    headline: content.headline,
    executiveSummary,
    content,
    topStories: normalizedTopStories,
    interestHighlights,
    repeatedSignals,
    risksAndUnknowns,
    citationMap,
    qualityFlags: normalizedQualityFlags,
    confidence,
    lineage,
    usage,
    noSignalReason,
  };
  assertOpenAiReaderSummaryDraftShape(draft);

  return draft;
};
