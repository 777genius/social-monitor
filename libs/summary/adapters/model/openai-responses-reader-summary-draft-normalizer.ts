import type {
  GeneratedReaderSummaryDraft,
  ReaderSummaryCitation,
  ReaderSummaryConfidence,
  ReaderSummaryQualityFlag,
  ReaderSummaryRepeatedSignal,
  ReaderSummaryRisk,
  ReaderSummaryTopicHighlight,
} from "../../domain";
import { buildReaderSummary } from "../../domain";
import type { ReaderSummaryModelInput, ReaderSummaryModelRoute } from "../../ports";
import {
  openAiReaderSummaryCitationFields,
  openAiReaderSummaryConfidenceLevels,
  openAiReaderSummaryQualityFlags,
  openAiReaderSummaryRiskReasons,
} from "./openai-responses-reader-summary-contract";
import {
  knownStringSubset,
  normalizeSetValue,
  optionalString,
  requiredArray,
  requiredNumber,
  requiredOptionalStringArray,
  requiredRecord,
  requiredString,
  requiredStringArray,
  uniqueNonEmptyStrings,
} from "./openai-responses-reader-summary-json";
import {
  clusterIdFromCitations,
  normalizeTopStories,
} from "./openai-responses-reader-summary-story-normalizer";

const qualityFlags = new Set<ReaderSummaryQualityFlag>(
  openAiReaderSummaryQualityFlags,
);
const confidenceLevels = new Set<ReaderSummaryConfidence["level"]>(
  openAiReaderSummaryConfidenceLevels,
);
const citationFields = new Set<ReaderSummaryCitation["field"]>(
  openAiReaderSummaryCitationFields,
);
const riskReasons = new Set<NonNullable<ReaderSummaryRisk["reason"]>>(
  openAiReaderSummaryRiskReasons,
);

export const normalizeOpenAiReaderSummaryDraft = (
  raw: Record<string, unknown>,
  input: ReaderSummaryModelInput,
  route: ReaderSummaryModelRoute,
  usage: GeneratedReaderSummaryDraft["usage"],
  evalDatasetVersion: string,
): GeneratedReaderSummaryDraft => {
  requiredArray<Record<string, unknown>>(
    raw.citationMap,
    "reader summary citation map",
  ).map(normalizeCitation);
  const citationMap = canonicalCitationMapFromEvidence(
    input.evidence.selectedEvidence,
  );
  const headline = requiredString(raw.headline, "reader summary headline");
  const executiveSummary = requiredString(
    raw.executiveSummary,
    "reader summary executive summary",
  );
  const topStories = requiredArray<Record<string, unknown>>(
    raw.topStories,
    "reader summary top reads",
  );
  const normalizedTopStories = normalizeTopStories(
    topStories,
    input,
    citationMap,
  );
  const topicHighlights = input.policy.includeTopicHighlights
    ? normalizeTopicHighlights(
        requiredArray<Record<string, unknown>>(
          raw.topicHighlights,
          "reader summary topic highlights",
        ),
        citationMap,
      )
    : [];
  const repeatedSignals = input.policy.includeRepeatedSignals
    ? normalizeRepeatedSignals(
        requiredArray<Record<string, unknown>>(
          raw.repeatedSignals,
          "reader summary repeated signals",
        ),
        input,
        citationMap,
      )
    : [];
  const risksAndUnknowns = input.policy.includeRisks
    ? normalizeRisks(
        requiredArray<Record<string, unknown>>(
          raw.risksAndUnknowns,
          "reader summary risks",
        ),
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
  const noSignalReason =
    normalizedTopStories.length === 0
      ? optionalString(raw.noSignalReason) ??
        "OpenAI reader summary returned no domain-safe cited stories."
      : undefined;
  const confidence = normalizeConfidence(
    requiredRecord(raw.confidence, "reader summary confidence"),
    normalizedTopStories.length,
  );
  const content = buildReaderSummary({
    headline,
    executiveSummary,
    topStories: normalizedTopStories,
    topicHighlights,
    repeatedSignals,
    risksAndUnknowns,
    citationMap,
    storyClusters: input.evidence.clusters,
    selectedEvidence: input.evidence.selectedEvidence,
    qualityFlags: normalizedQualityFlags,
    noSignalReason,
  });
  const draft: GeneratedReaderSummaryDraft = {
    headline,
    executiveSummary,
    content,
    topStories: normalizedTopStories,
    topicHighlights,
    repeatedSignals,
    risksAndUnknowns,
    citationMap,
    qualityFlags: normalizedQualityFlags,
    confidence,
    lineage: buildOpenAiReaderSummaryLineage(
      input,
      route,
      evalDatasetVersion,
    ),
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

const normalizeTopicHighlight = (value: Record<string, unknown>): ReaderSummaryTopicHighlight => ({
  topicId: requiredString(value.topicId, "topic highlight topic id"),
  title: requiredString(value.title, "topic highlight title"),
  summary: requiredString(value.summary, "topic highlight summary"),
  citationIds: requiredStringArray(
    value.citationIds,
    "topic highlight citations",
  ),
});

const normalizeTopicHighlights = (
  values: readonly Record<string, unknown>[],
  citationMap: readonly ReaderSummaryCitation[],
): readonly ReaderSummaryTopicHighlight[] => {
  const knownCitationIds = new Set(
    citationMap.map((citation) => citation.citationId),
  );

  return values
    .map(normalizeTopicHighlight)
    .map((highlight) => ({
      ...highlight,
      citationIds: knownStringSubset(highlight.citationIds, knownCitationIds),
    }))
    .filter((highlight) => highlight.citationIds.length > 0);
};

const normalizeRepeatedSignal = (value: Record<string, unknown>): ReaderSummaryRepeatedSignal => ({
  storyClusterId: requiredString(
    value.storyClusterId,
    "repeated signal cluster id",
  ),
  title: requiredString(value.title, "repeated signal title"),
  topicIds: requiredStringArray(value.topicIds, "repeated signal topics"),
  citationIds: requiredStringArray(
    value.citationIds,
    "repeated signal citations",
  ),
});

const normalizeRepeatedSignals = (
  values: readonly Record<string, unknown>[],
  input: ReaderSummaryModelInput,
  citationMap: readonly ReaderSummaryCitation[],
): readonly ReaderSummaryRepeatedSignal[] => {
  const knownClusterIds = new Set(
    input.evidence.clusters.map((cluster) => cluster.id),
  );
  const citationById = new Map(
    citationMap.map((citation) => [citation.citationId, citation] as const),
  );
  const knownCitationIds = new Set(citationById.keys());

  return values
    .map(normalizeRepeatedSignal)
    .flatMap((signal): readonly ReaderSummaryRepeatedSignal[] => {
      const storyClusterId = knownClusterIds.has(signal.storyClusterId)
        ? signal.storyClusterId
        : clusterIdFromCitations(signal.citationIds, citationById, input);
      if (storyClusterId === undefined) {
        return [];
      }

      const citationIds = knownStringSubset(signal.citationIds, knownCitationIds);
      const topicIds = uniqueNonEmptyStrings(signal.topicIds);
      if (citationIds.length === 0 || topicIds.length < 2) {
        return [];
      }

      return [
        {
          ...signal,
          storyClusterId,
          topicIds,
          citationIds,
        },
      ];
    });
};

const normalizeRisk = (value: Record<string, unknown>): ReaderSummaryRisk => ({
  description: requiredString(value.description, "risk description"),
  citationIds: requiredOptionalStringArray(value.citationIds, "risk citations"),
  reason: normalizeSetValue(value.reason, riskReasons, "risk reason"),
});

const normalizeRisks = (
  values: readonly Record<string, unknown>[],
  citationMap: readonly ReaderSummaryCitation[],
): readonly ReaderSummaryRisk[] => {
  const knownCitationIds = new Set(
    citationMap.map((citation) => citation.citationId),
  );

  return values.map((value) => {
    const risk = normalizeRisk(value);
    return {
      ...risk,
      citationIds:
        risk.citationIds === undefined
          ? undefined
          : knownStringSubset(risk.citationIds, knownCitationIds),
    };
  });
};

const normalizeCitation = (
  value: Record<string, unknown>,
): ReaderSummaryCitation => ({
  citationId: requiredString(value.citationId, "citation id"),
  feedItemId: requiredString(value.feedItemId, "citation feed item id"),
  sourceItemId: requiredString(value.sourceItemId, "citation source item id"),
  providerKey: requiredString(value.providerKey, "citation provider key"),
  field:
    normalizeSetValue(value.field, citationFields, "citation field") ?? "title",
});

const canonicalCitationMapFromEvidence = (
  evidenceItems: ReaderSummaryModelInput["evidence"]["selectedEvidence"],
): readonly ReaderSummaryCitation[] => {
  return evidenceItems.map((item, index) => ({
    citationId: `c${index + 1}`,
    feedItemId: item.feedItemId,
    sourceItemId: item.sourceItemId,
    providerKey: item.providerKey,
    field: item.canonicalUrl === undefined ? "title" : "canonicalUrl",
    canonicalUrl: item.canonicalUrl,
  }));
};

const normalizeConfidence = (
  value: Record<string, unknown>,
  topStoryCount: number,
): ReaderSummaryConfidence => {
  const level =
    normalizeSetValue(value.level, confidenceLevels, "confidence level") ??
    "low";

  return {
    level: topStoryCount > 0 && level === "none" ? "low" : level,
    score: requiredNumber(value.score, "confidence score"),
    rationale: requiredString(value.rationale, "confidence rationale"),
  };
};

const normalizeQualityFlags = (
  value: unknown,
): readonly ReaderSummaryQualityFlag[] =>
  requiredOptionalStringArray(value, "quality flags")
    .map((flag) => normalizeSetValue(flag, qualityFlags, "quality flag"))
    .filter((flag): flag is ReaderSummaryQualityFlag => flag !== undefined);
