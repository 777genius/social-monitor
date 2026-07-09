import type { ReaderSummaryCitation } from "../entities/citation";
import type { TopRead, TopReadCandidate } from "../entities/top-read";
import type {
  StoryCluster,
  SummaryEvidenceItem,
} from "../value-objects/summary-evidence-item";
import { readerSummaryProviderIdentity } from "../value-objects/reader-summary-provider-identity";
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
  const providerIdentity = readerSummaryProviderIdentity({
    providerKey,
    providerName: evidence?.providerName,
    canonicalUrl: citation?.canonicalUrl ?? evidence?.canonicalUrl,
  });
  const readerProviderKey = providerIdentity.providerKey;
  const providerName = providerIdentity.providerName;
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
    providerKey: readerProviderKey,
  });
  const title = buildTopReadTitle({
    storyTitle: story.title,
    evidence:
      topReadEvidence.length > 0 ? topReadEvidence : clusterEvidence,
  });

  return {
    title,
    providerKey: readerProviderKey,
    providerName,
    primaryActionKind: evidence?.readerActionKind ?? "read_source",
    reason: whyImportant[0] ?? story.summary,
    matchedInterestIds:
      matchedInterestIds.length > 0 ? matchedInterestIds : ["unknown-interest"],
    matchedRules: buildMatchedRules(
      citedEvidence,
      matchedInterestIds,
      readerProviderKey,
    ),
    signalScore,
    confidence: readerItemConfidence({
      cluster,
      evidenceCount:
        cluster === undefined
          ? Math.max(topReadEvidence.length, citedEvidence.length)
          : topReadEvidence.length,
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

const buildTopReadTitle = (params: {
  readonly storyTitle: string;
  readonly evidence: readonly SummaryEvidenceItem[];
}): string => {
  const storyTitle = cleanTopReadTitle(params.storyTitle);
  if (isReaderFacingTopReadTitle(storyTitle)) {
    return storyTitle;
  }

  const evidenceTitle = params.evidence
    .map((item) => cleanTopReadTitle(item.title))
    .find(isReaderFacingTopReadTitle);

  return evidenceTitle ?? (storyTitle.length > 0 ? storyTitle : "Cited story");
};

const cleanTopReadTitle = (value: string): string =>
  value.trim().replace(/^X post by @[^:]+:\s*/iu, "").trim();

const isReaderFacingTopReadTitle = (value: string): boolean => {
  const lower = value.trim().toLowerCase();

  return (
    lower.length > 0 &&
    lower !== "cited story" &&
    lower !== "selected evidence" &&
    !isSourceCoverageFramingText(lower)
  );
};

const isUserFacingTopReadReason = (value: string): boolean => {
  const lower = value.trim().toLowerCase();

  return (
    lower.length > 0 &&
    !isSourceCoverageFramingText(lower) &&
    !lower.startsWith("story signal score") &&
    !lower.startsWith("current summary window has") &&
    !lower.startsWith("selected evidence supports this story") &&
    !lower.startsWith("unsafe source instructions were sandboxed") &&
    lower !== "strong source engagement signal" &&
    lower !== "passes source quality and interest relevance gate" &&
    lower !== "fresh item in the current monitoring window" &&
    !/^clustered \d+ (?:similar|related) (?:source )?items?$/u.test(lower) &&
    !lower.includes("citation references bodypreview evidence") &&
    !lower.includes("source item source-binding") &&
    !lower.includes("bodypreview evidence from source item")
  );
};

const isSourceCoverageFramingText = (lower: string): boolean =>
  lower.startsWith("confirmed by ") ||
  lower.startsWith("cross-source") ||
  lower.startsWith("cross-provider") ||
  lower.startsWith("selected to preserve ") ||
  lower.startsWith("source coverage") ||
  lower.startsWith("provider coverage") ||
  lower.includes("cross-source attention") ||
  lower.includes("cross-provider attention") ||
  lower.includes("cross-source coverage") ||
  lower.includes("cross-provider coverage") ||
  lower.includes("cross-source confirmation") ||
  lower.includes("cross-provider confirmation") ||
  /\b(?:both|multi-source|multi-provider)\b.*\b(?:attention|coverage|support|confirmation)\b/iu.test(
    lower,
  ) ||
  /\b(?:hn|hacker news|rss|reddit|x\/twitter|x-twitter|twitter|x)\b.*\band\b.*\b(?:hn|hacker news|rss|reddit|x\/twitter|x-twitter|twitter|x)\b.*\b(?:attention|coverage|support|confirmation)\b/iu.test(
    lower,
  ) ||
  lower.includes("source groups support this story") ||
  lower.includes("monitored source groups support this story");
