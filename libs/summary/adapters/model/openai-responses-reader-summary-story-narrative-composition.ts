import type { ReaderSummaryCitation } from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";
import { normalizeRecordArray } from "./openai-responses-reader-summary-raw-values";
import { normalizeTopStories } from "./openai-responses-reader-summary-story-normalizer";
import { normalizeOpenAiReaderSummaryNarrative } from "./openai-responses-reader-summary-narrative";
import { buildReaderSummaryStoryNarrativeIndex } from "./openai-responses-reader-summary-story-narrative-index";

/**
 * Bind a model's proposed stories to cited evidence before building narrative
 * sections. The caller still owns publication copy, optional sections and
 * the final domain draft contract.
 */
export const normalizeCitedReaderSummaryStoriesAndNarrative = (
  raw: Record<string, unknown>,
  input: ReaderSummaryModelInput,
  citationMap: readonly ReaderSummaryCitation[],
  legacyExecutiveSummary: string,
) => {
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
  return { normalizedTopStories, narrativeSections };
};
