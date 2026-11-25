import type {
  GeneratedReaderSummaryDraft,
} from "../../domain";
import { normalizeCitedReaderSummaryStoriesAndNarrative } from "./openai-responses-reader-summary-story-narrative-composition";
import { assembleOpenAiReaderSummaryDraft } from "./openai-responses-reader-summary-draft-assembly";
import { buildOpenAiReaderSummaryLineage } from "./openai-responses-reader-summary-lineage";
export { buildOpenAiReaderSummaryLineage } from "./openai-responses-reader-summary-lineage";
export { assertOpenAiReaderSummaryDraftShape } from "./reader-summary-draft-shape-contract";
import type {
  ReaderSummaryModelInput,
  ReaderSummaryModelRoute,
} from "../../ports";
import { buildReaderSummaryEvidenceCitationMap,
  readerSummaryCitableEvidence } from "./reader-summary-evidence-citation-map";
import { normalizeOpenAiReaderSummaryOptionalContent } from "./openai-responses-reader-summary-draft-policy-projection";
import {
  normalizeOpenAiReaderSummaryLeadCopy,
  resolveOpenAiReaderSummaryPublicationCopy,
} from "./openai-responses-reader-summary-draft-copy-policy";

export const normalizeOpenAiReaderSummaryDraft = (
  raw: Record<string, unknown>,
  input: ReaderSummaryModelInput,
  route: ReaderSummaryModelRoute,
  usage: GeneratedReaderSummaryDraft["usage"],
  evalDatasetVersion: string,
): GeneratedReaderSummaryDraft => {
  const citationMap = buildReaderSummaryEvidenceCitationMap(
    readerSummaryCitableEvidence(input.evidence),
  );
  const { headline, legacyExecutiveSummary } = normalizeOpenAiReaderSummaryLeadCopy(raw);
  const { normalizedTopStories, narrativeSections } =
    normalizeCitedReaderSummaryStoriesAndNarrative(
      raw,
      input,
      citationMap,
      legacyExecutiveSummary,
    );
  const { noSignalReason, executiveSummary } = resolveOpenAiReaderSummaryPublicationCopy({
    raw,
    legacyExecutiveSummary,
    normalizedTopStories,
    narrativeSections,
  });
  const {
    interestHighlights,
    repeatedSignals,
    risksAndUnknowns,
    normalizedQualityFlags,
    confidence,
  } = normalizeOpenAiReaderSummaryOptionalContent({
    raw,
    input,
    citationMap,
    topStoryCount: normalizedTopStories.length,
  });
  return assembleOpenAiReaderSummaryDraft({
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
    lineage: buildOpenAiReaderSummaryLineage(input, route, evalDatasetVersion),
    usage,
    noSignalReason,
  });
};


