import type {
  GeneratedReaderSummaryDraft,
  ReaderSummaryQualityFlag,
} from "../../domain";
import { buildReaderSummary, readerSummaryHeadline } from "../../domain";
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
    lineage: buildOpenAiReaderSummaryLineage(input, route, evalDatasetVersion),
    usage,
    noSignalReason,
  };
  assertOpenAiReaderSummaryDraftShape(draft);

  return draft;
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

export const assertOpenAiReaderSummaryDraftShape = (
  draft: GeneratedReaderSummaryDraft,
): void => {
  if (
    draft.headline.trim().length === 0 ||
    draft.executiveSummary.trim().length === 0
  ) {
    throw new Error(
      "Reader summary draft must include headline and executive summary",
    );
  }
  if (draft.confidence.score < 0 || draft.confidence.score > 1) {
    throw new Error("Reader summary confidence score must be between 0 and 1");
  }
  if (
    draft.topStories.length === 0 &&
    !draft.qualityFlags.includes("no_signal")
  ) {
    throw new Error(
      "Reader summary draft without top stories must be marked no_signal",
    );
  }
};

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

