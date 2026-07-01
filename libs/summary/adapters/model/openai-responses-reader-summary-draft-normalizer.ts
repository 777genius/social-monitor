import type {
  GeneratedReaderSummaryDraft,
  ReaderSummaryCitation,
  ReaderSummaryConfidence,
  ReaderSummaryQualityFlag,
  ReaderSummaryRepeatedSignal,
  ReaderSummaryRisk,
  ReaderSummaryInterestHighlight,
} from "../../domain";
import { buildReaderSummary } from "../../domain";
import type { ReaderSummaryModelInput, ReaderSummaryModelRoute } from "../../ports";
import {
  openAiReaderSummaryConfidenceLevels,
  openAiReaderSummaryQualityFlags,
  openAiReaderSummaryRiskReasons,
} from "./openai-responses-reader-summary-contract";
import {
  asRecord,
  knownStringSubset,
  normalizeSetValue,
  optionalString,
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
  const citationMap = canonicalCitationMapFromEvidence(
    input.evidence.selectedEvidence,
  );
  const headline = requiredString(raw.headline, "reader summary headline");
  const executiveSummary = requiredString(
    raw.executiveSummary,
    "reader summary executive summary",
  );
  const topStories = normalizeRecordArray(raw.topStories);
  const normalizedTopStories = normalizeTopStories(
    topStories,
    input,
    citationMap,
  );
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
  const noSignalReason =
    normalizedTopStories.length === 0
      ? optionalString(raw.noSignalReason) ??
        "OpenAI reader summary returned no domain-safe cited stories."
      : undefined;
  const confidence = normalizeConfidence(
    asRecord(raw.confidence) ?? {},
    normalizedTopStories.length,
  );
  const content = buildReaderSummary({
    headline,
    executiveSummary,
    topStories: normalizedTopStories,
    interestHighlights,
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
    interestHighlights,
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

const normalizeInterestHighlight = (value: Record<string, unknown>): ReaderSummaryInterestHighlight => ({
  interestId: optionalString(value.interestId) ?? "",
  title: optionalString(value.title) ?? "Interest signal",
  summary:
    optionalString(value.summary) ??
    optionalString(value.description) ??
    "Selected evidence mentions this interest.",
  citationIds: normalizeStringArrayLike(
    value.citationIds,
    "interest highlight citations",
  ),
});

const normalizeInterestHighlights = (
  values: readonly Record<string, unknown>[],
  input: ReaderSummaryModelInput,
  citationMap: readonly ReaderSummaryCitation[],
): readonly ReaderSummaryInterestHighlight[] => {
  const knownCitationIds = new Set(
    citationMap.map((citation) => citation.citationId),
  );
  const citationById = new Map(
    citationMap.map((citation) => [citation.citationId, citation] as const),
  );
  const evidenceByFeedItemId = new Map(
    input.evidence.selectedEvidence.map(
      (item) => [item.feedItemId, item] as const,
    ),
  );

  return values
    .map(normalizeInterestHighlight)
    .flatMap((highlight): readonly ReaderSummaryInterestHighlight[] => {
      const citationIds = knownStringSubset(highlight.citationIds, knownCitationIds);
      if (citationIds.length === 0) {
        return [];
      }

      const interestId =
        optionalString(highlight.interestId) ??
        citationIds
          .map((citationId) => citationById.get(citationId)?.feedItemId)
          .map((feedItemId) =>
            feedItemId === undefined
              ? undefined
              : evidenceByFeedItemId.get(feedItemId)?.interestId,
          )
          .find((value): value is string => value !== undefined);
      if (interestId === undefined) {
        return [];
      }

      return [
        {
          ...highlight,
          interestId,
          citationIds,
        },
      ];
    });
};

const normalizeRepeatedSignal = (value: Record<string, unknown>): ReaderSummaryRepeatedSignal => ({
  storyClusterId: optionalString(value.storyClusterId) ?? "",
  title: optionalString(value.title) ?? "Repeated signal",
  interestIds: normalizeStringArrayLike(value.interestIds, "repeated signal interests"),
  citationIds: normalizeStringArrayLike(
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
      const interestIds = uniqueNonEmptyStrings(signal.interestIds);
      if (citationIds.length === 0 || interestIds.length < 2) {
        return [];
      }

      return [
        {
          ...signal,
          storyClusterId,
          interestIds,
          citationIds,
        },
      ];
    });
};

const normalizeRisk = (value: Record<string, unknown>): ReaderSummaryRisk => ({
  description:
    optionalString(value.description ?? value.risk) ??
    "Selected evidence has unresolved uncertainty.",
  citationIds: normalizeStringArrayLike(value.citationIds ?? value.citations, "risk citations"),
  reason: normalizeSetValue(value.reason, riskReasons, "risk reason"),
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

const normalizeStringArrayLike = (
  value: unknown,
  label: string,
): readonly string[] => {
  if (Array.isArray(value)) {
    return requiredStringArray(value, label);
  }

  const scalar = optionalString(value);
  if (scalar === undefined) {
    return [];
  }

  return uniqueNonEmptyStrings(scalar.split(","));
};

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
    (topStoryCount > 0 ? "low" : "none");
  const score =
    typeof value.score === "number" && Number.isFinite(value.score)
      ? value.score
      : topStoryCount > 0
        ? 0.55
        : 0;

  return {
    level: topStoryCount > 0 && level === "none" ? "low" : level,
    score,
    rationale:
      optionalString(value.rationale) ??
      "Confidence inferred from cited reader summary evidence.",
  };
};

const normalizeQualityFlags = (
  value: unknown,
): readonly ReaderSummaryQualityFlag[] =>
  requiredOptionalStringArray(value, "quality flags")
    .map((flag) => normalizeSetValue(flag, qualityFlags, "quality flag"))
    .filter((flag): flag is ReaderSummaryQualityFlag => flag !== undefined);
