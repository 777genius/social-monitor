import type {
  GeneratedReaderSummaryDraft,
  ReaderSummaryQualityFlag,
} from "../../domain";
import { readerSummaryHeadline } from "../../domain";
import { assembleOpenAiReaderSummaryDraft } from "./openai-responses-reader-summary-draft-assembly";
export { assertOpenAiReaderSummaryDraftShape } from "./reader-summary-draft-shape-contract";
import type {
  ReaderSummaryModelInput,
  ReaderSummaryModelRoute,
} from "../../ports";
import {
  asRecord,
  optionalString,
  requiredString,
  uniqueNonEmptyStrings,
} from "./openai-responses-reader-summary-json";
import { normalizeTopStories } from "./openai-responses-reader-summary-story-normalizer";
import {
  normalizeRisks,
  normalizeConfidence,
  normalizeQualityFlags,
} from "./openai-responses-reader-summary-quality";
import {
  normalizeInterestHighlights,
  normalizeRepeatedSignals,
} from "./openai-responses-reader-summary-evidence-relations";
import {
  normalizeOpenAiReaderSummaryNarrative,
  readerSummaryNarrativeMarkdown,
} from "./openai-responses-reader-summary-narrative";
import { buildReaderSummaryEvidenceCitationMap,
  readerSummaryCitableEvidence } from "./reader-summary-evidence-citation-map";

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
  const narrativeSections = normalizeOpenAiReaderSummaryNarrative({
    rawSections: raw.narrativeSections,
    legacyExecutiveSummary,
    input,
    citationMap,
    storyTitlesByClusterId: new Map(
      normalizedTopStories.map((story) => [story.storyClusterId, story.title]),
    ),
    storySummariesByClusterId: new Map(
      normalizedTopStories.map((story) => [
        story.storyClusterId,
        story.summary,
      ]),
    ),
    storySummariesByCitationId: new Map(
      normalizedTopStories.flatMap((story) =>
        story.citationIds.map(
          (citationId) => [citationId, story.summary] as const,
        ),
      ),
    ),
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
    normalizedTopStories.length === 0
      ? (uniqueNonEmptyStrings([
          ...rawQualityFlags,
          "no_signal",
          "limited_sources",
        ]) as readonly ReaderSummaryQualityFlag[])
      : rawQualityFlags.filter((flag) => flag !== "no_signal");
  const confidence = normalizeConfidence(
    asRecord(raw.confidence) ?? {},
    normalizedTopStories.length,
  );
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



const normalizeRecordArray = (
  value: unknown,
): readonly Record<string, unknown>[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(asRecord)
    .filter((record): record is Record<string, unknown> => record !== null);
};

