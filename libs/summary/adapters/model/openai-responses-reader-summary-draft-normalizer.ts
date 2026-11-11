import type {
  GeneratedReaderSummaryDraft,
} from "../../domain";
import { readerSummaryHeadline } from "../../domain";
import { assembleOpenAiReaderSummaryDraft } from "./openai-responses-reader-summary-draft-assembly";
export { assertOpenAiReaderSummaryDraftShape } from "./reader-summary-draft-shape-contract";
import type {
  ReaderSummaryModelInput,
  ReaderSummaryModelRoute,
} from "../../ports";
import { normalizeRecordArray, optionalString, requiredString } from "./openai-responses-reader-summary-raw-values";
import { normalizeTopStories } from "./openai-responses-reader-summary-story-normalizer";
import {
  normalizeOpenAiReaderSummaryNarrative,
  readerSummaryNarrativeMarkdown,
} from "./openai-responses-reader-summary-narrative";
import { buildReaderSummaryEvidenceCitationMap,
  readerSummaryCitableEvidence } from "./reader-summary-evidence-citation-map";
import { buildReaderSummaryStoryNarrativeIndex } from "./openai-responses-reader-summary-story-narrative-index";
import { normalizeOpenAiReaderSummaryOptionalContent } from "./openai-responses-reader-summary-draft-policy-projection";

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
  const headline = readerSummaryHeadline(
    requiredString(raw.headline, "reader summary headline"),
  );
  const legacyExecutiveSummary =
    typeof raw.executiveSummary === "string" &&
      raw.executiveSummary.trim().length === 0
      ? ""
      : requiredString(
          raw.executiveSummary,
          "reader summary executive summary",
        );
  const topStories = normalizeRecordArray(raw.topStories);
  const normalizedTopStories = normalizeTopStories(
    topStories,
    input,
    citationMap,
  );
  const storyIndex = buildReaderSummaryStoryNarrativeIndex(normalizedTopStories);
  const narrativeSections = normalizeOpenAiReaderSummaryNarrative({
    rawSections: raw.narrativeSections,
    legacyExecutiveSummary,
    input,
    citationMap,
    storyTitlesByClusterId: storyIndex.storyTitlesByClusterId,
    storySummariesByClusterId: storyIndex.storySummariesByClusterId,
    storySummariesByCitationId: storyIndex.storySummariesByCitationId,
  });
  const noSignalReason =
    normalizedTopStories.length === 0
      ? (optionalString(raw.noSignalReason) ??
        "OpenAI reader summary returned no domain-safe cited stories.")
      : undefined;
  const executiveSummary =
    narrativeSections.length === 0
      ? (optionalString(legacyExecutiveSummary) ??
        optionalString(normalizedTopStories[0]?.summary) ??
        noSignalReason ??
        "")
      : readerSummaryNarrativeMarkdown(narrativeSections);
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

export const buildOpenAiReaderSummaryLineage = (
  input: ReaderSummaryModelInput,
  route: ReaderSummaryModelRoute,
  evalDatasetVersion: string,
): GeneratedReaderSummaryDraft["lineage"] => ({
  promptVersion: route.promptVersion,
  schemaVersion: route.schemaVersion,
  modelVersion: route.model,
  providerVersion: route.provider,
  rulesVersion: input.policy.rulesVersion,
  evalDatasetVersion,
  rankingPolicyVersion: input.evidence.rankingPolicyVersion,
});
