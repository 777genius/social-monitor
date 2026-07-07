import type { ReaderSummaryCitation } from "../entities/citation";
import type { TopRead, TopReadCandidate } from "../entities/top-read";
import type {
  StoryCluster,
  SummaryEvidenceItem,
} from "../value-objects/summary-evidence-item";
import { normalizeSignalScore } from "../value-objects/signal-score";
import { compactUnique, uniqueNonEmpty } from "../value-objects/summary-text";
import {
  buildMatchedRules,
  buildWhyNow,
  confirmedProviderKeys,
  readerItemConfidence,
  storyProviderMetricLabels,
} from "./reader-summary-support";
import { isTopReadEligibleEvidence } from "../policies/top-read-eligibility-policy";

const maxTopReadCitationIds = 4;

export const evidenceClusterMap = (
  clusters: readonly StoryCluster[],
  evidenceByFeedItemId: ReadonlyMap<string, SummaryEvidenceItem>,
): ReadonlyMap<string, readonly SummaryEvidenceItem[]> => {
  const result = new Map<string, readonly SummaryEvidenceItem[]>();

  for (const cluster of clusters) {
    const evidence = [
      cluster.representativeFeedItemId,
      ...cluster.duplicateFeedItemIds,
    ]
      .map((feedItemId) => evidenceByFeedItemId.get(feedItemId))
      .filter((item): item is SummaryEvidenceItem => item !== undefined);

    result.set(cluster.id, evidence);
  }

  return result;
};

export const storyToTopRead = (
  story: TopReadCandidate,
  citationById: ReadonlyMap<string, ReaderSummaryCitation>,
  evidenceByFeedItemId: ReadonlyMap<string, SummaryEvidenceItem>,
  clusterById: ReadonlyMap<string, StoryCluster>,
  evidenceByClusterId: ReadonlyMap<string, readonly SummaryEvidenceItem[]>,
): TopRead => {
  const modelCitations = story.citationIds
    .map((citationId) => citationById.get(citationId))
    .filter(
      (citation): citation is ReaderSummaryCitation => citation !== undefined,
    );
  const modelCitedEvidence = modelCitations
    .map((citation) => evidenceByFeedItemId.get(citation.feedItemId))
    .filter((item): item is SummaryEvidenceItem => item !== undefined);
  const eligibleModelCitationIds = modelCitations
    .filter((citation) =>
      isTopReadEligibleEvidence(evidenceByFeedItemId.get(citation.feedItemId)),
    )
    .map((citation) => citation.citationId);
  const cluster = clusterById.get(story.storyClusterId);
  const clusterEvidence =
    cluster === undefined
      ? modelCitedEvidence
      : (evidenceByClusterId.get(cluster.id) ?? modelCitedEvidence);
  const topReadEvidence = clusterEvidence.filter(isTopReadEligibleEvidence);
  const citationIdByFeedItemId = new Map(
    [...citationById.values()].map(
      (citation) => [citation.feedItemId, citation.citationId] as const,
    ),
  );
  const citationIds = compactUnique([
    ...eligibleModelCitationIds,
    ...topReadEvidence.map((item) =>
      citationIdByFeedItemId.get(item.feedItemId),
    ),
  ]).slice(0, maxTopReadCitationIds);
  const citations = citationIds
    .map((citationId) => citationById.get(citationId))
    .filter(
      (citation): citation is ReaderSummaryCitation => citation !== undefined,
    );
  const citedEvidence = citations
    .map((citation) => evidenceByFeedItemId.get(citation.feedItemId))
    .filter(
      (item): item is SummaryEvidenceItem =>
        item !== undefined && isTopReadEligibleEvidence(item),
    );
  const citation = citations[0];
  const evidence = citedEvidence[0] ?? topReadEvidence[0] ?? clusterEvidence[0];
  const providerKey =
    citation?.providerKey ??
    evidence?.providerKey ??
    story.providerKeys[0] ??
    cluster?.providerKeys[0] ??
    "unknown";
  const providerName = evidence?.providerName ?? providerKey;
  const matchedInterestIds = uniqueNonEmpty([
    ...story.interestIds,
    ...(cluster?.interestIds ?? []),
    ...topReadEvidence.map((item) => item.interestId),
  ]);
  const whyImportant = buildTopReadUserFacingReasons({
    story,
    cluster,
    evidence: topReadEvidence,
  });
  const signalScore = normalizeSignalScore(
    cluster?.score ?? evidence?.score ?? 0,
  );
  const confirmedProviders = confirmedProviderKeys({
    cluster,
    evidence: topReadEvidence,
    providerKey,
  });

  return {
    title: story.title,
    providerKey,
    providerName,
    primaryActionKind: evidence?.readerActionKind ?? "read_source",
    reason: whyImportant[0] ?? story.summary,
    matchedInterestIds:
      matchedInterestIds.length > 0 ? matchedInterestIds : ["unknown-interest"],
    matchedRules: buildMatchedRules(
      citedEvidence,
      matchedInterestIds,
      providerKey,
    ),
    signalScore,
    confidence: readerItemConfidence({
      cluster,
      evidenceCount: Math.max(topReadEvidence.length, citedEvidence.length),
      confirmedProviderCount: confirmedProviders.length,
      signalScore,
    }),
    confirmedProviderKeys: confirmedProviders,
    providerMetrics: storyProviderMetricLabels({
      evidence: topReadEvidence,
      representativeMetricLabels: evidence?.providerMetricLabels,
    }),
    whyImportant,
    whyNow: buildWhyNow(cluster, story.providerKeys, topReadEvidence),
    publishedAt: evidence?.publishedAt,
    canonicalUrl: citation?.canonicalUrl ?? evidence?.canonicalUrl,
    previewMedia: selectTopReadPreviewMedia(evidence, topReadEvidence),
    citationIds,
  };
};

const selectTopReadPreviewMedia = (
  representative: SummaryEvidenceItem | undefined,
  evidence: readonly SummaryEvidenceItem[],
): TopRead["previewMedia"] =>
  representative?.previewMedia ??
  evidence.find((item) => item.previewMedia !== undefined)?.previewMedia;

const buildTopReadUserFacingReasons = (params: {
  readonly story: TopReadCandidate;
  readonly cluster: StoryCluster | undefined;
  readonly evidence: readonly SummaryEvidenceItem[];
}): readonly string[] => {
  const candidates = compactUnique([
    ...(params.cluster?.whyImportant ?? []),
    ...params.evidence.flatMap((item) => item.whyImportant),
    params.story.summary,
  ]).filter(isUserFacingTopReadReason);

  if (candidates.length > 0) {
    return candidates.slice(0, 4);
  }

  return [`Source-reported: ${params.story.title}`];
};

const isUserFacingTopReadReason = (value: string): boolean => {
  const lower = value.trim().toLowerCase();

  return (
    lower.length > 0 &&
    !lower.startsWith("story signal score") &&
    !lower.startsWith("current summary window has") &&
    lower !== "strong source engagement signal" &&
    lower !== "passes source quality and interest relevance gate" &&
    lower !== "fresh item in the current monitoring window" &&
    !/^clustered \d+ (?:similar|related) items?$/u.test(lower) &&
    !lower.includes("citation references bodypreview evidence") &&
    !lower.includes("source item source-binding") &&
    !lower.includes("bodypreview evidence from source item")
  );
};
