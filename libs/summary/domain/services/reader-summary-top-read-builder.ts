import type { ReaderSummaryCitation } from "../entities/citation";
import type { TopRead, TopReadCandidate } from "../entities/top-read";
import type {
  StoryCluster,
  SummaryEvidenceItem,
} from "../value-objects/summary-evidence-item";
import {
  independentEvidenceItems,
  readerSummaryProviderIdentity,
} from "../value-objects/reader-summary-provider-identity";
import { normalizeSignalScore } from "../value-objects/signal-score";
import { compactUnique, uniqueNonEmpty } from "../value-objects/summary-text";
import {
  readerItemConfidence,
  storyProviderMetricLabels,
} from "./reader-summary-support";
import {
  groundedTopReadTitle,
  isUnverifiedLegalTopRead,
} from "./reader-summary-headline-policy";
import {
  buildMatchedRules,
  buildWhyNow,
  confirmedProviderKeys,
} from "./reader-summary-source-lineage";
import { isTopReadEligibleEvidence } from "../policies/top-read-eligibility-policy";
import { hasFirstPartyOfficialEvidence } from "../policies/reader-summary-source-authority-policy";
import { compareRepresentativeEvidenceItems } from "../policies/representative-evidence-selection-policy";
import {
  readerSummaryEditorialCurationRules,
  readerSummaryUnverifiedLegalSafetyDemotionRules,
  withoutReaderSummaryUnverifiedLegalSafetyDemotionRule,
} from "../policies/reader-summary-editorial-curation-policy";
import {
  isFallbackReaderReason,
  isReaderTitleReasonDuplicate,
  mentionsUnsupportedReaderProvider,
  readerFacingEvidenceExcerpt,
} from "../policies/reader-summary-reader-facing-text-policy";
import {
  buildTopReadTitle,
  evidenceReaderTitle,
  isReaderFacingTopReadTitle,
  isSourceCoverageFramingText,
  isUnverifiedBreakingSourceTitle,
} from "./reader-summary-top-read-title";

const maxTopReadCitationIds = 4;
const minimumDetailedStorySummaryLength = 240;
const minimumSalvagedStorySummaryLength = 80;

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
  const cluster = clusterById.get(story.storyClusterId);
  const clusterFeedItemIds = new Set(
    cluster === undefined
      ? []
      : [cluster.representativeFeedItemId, ...cluster.duplicateFeedItemIds],
  );
  const eligibleModelCitations = modelCitations.filter((citation) =>
    isTopReadEligibleEvidence(evidenceByFeedItemId.get(citation.feedItemId)),
  );
  const eligibleModelCitationIds = eligibleModelCitations
    .filter(
      (citation) =>
        cluster === undefined || clusterFeedItemIds.has(citation.feedItemId),
    )
    .map((citation) => citation.citationId);
  const modelCitationsWereFiltered =
    eligibleModelCitationIds.length < eligibleModelCitations.length;
  const clusterEvidence =
    cluster === undefined
      ? modelCitedEvidence
      : (evidenceByClusterId.get(cluster.id) ?? modelCitedEvidence);
  const topReadEvidence = clusterEvidence
    .filter(isTopReadEligibleEvidence)
    .sort(compareRepresentativeEvidenceItems);
  const citationIdByFeedItemId = new Map(
    [...citationById.values()].map(
      (citation) => [citation.feedItemId, citation.citationId] as const,
    ),
  );
  const citationIds = compactUnique([
    ...topReadEvidence.map((item) =>
      citationIdByFeedItemId.get(item.feedItemId),
    ),
    ...eligibleModelCitationIds,
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
  const supportEvidence = [
    ...(citedEvidence.length > 0 ? citedEvidence : topReadEvidence),
  ].sort(compareRepresentativeEvidenceItems);
  const citation = citations[0];
  const evidence = supportEvidence[0] ?? clusterEvidence[0];
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
    ...supportEvidence.map((item) => item.interestId),
  ]);
  const signalScore = normalizeSignalScore(
    cluster?.score ?? evidence?.score ?? 0,
  );
  const confirmedProviders = confirmedProviderKeys({
    cluster: undefined,
    evidence: supportEvidence,
    providerKey: readerProviderKey,
  });
  const whyImportant = buildTopReadUserFacingReasons({
    story,
    cluster,
    evidence: supportEvidence,
    includeStorySummary: !modelCitationsWereFiltered,
    supportedProviderKeys: confirmedProviders,
  });
  const rawTitle = buildTopReadTitle({
    storyTitle: story.title,
    storySummary: story.summary,
    primaryEvidence: evidence,
    evidence: supportEvidence.length > 0 ? supportEvidence : clusterEvidence,
  });
  const reason = whyImportant[0] ?? story.summary;
  const confidence = readerItemConfidence({
    cluster,
    independentEvidenceCount: independentEvidenceItems(supportEvidence).length,
    confirmedProviderCount: confirmedProviders.length,
    signalScore,
    firstPartyOfficial: hasFirstPartyOfficialEvidence(supportEvidence),
  });
  const title = groundedTopReadTitle({
    title: rawTitle,
    reason,
    whyImportant,
    confidence,
  });
  const builderConfirmedUnverifiedLegalSafetyDemotion =
    isUnverifiedLegalTopRead({
      title,
      reason,
      whyImportant,
      confidence,
    });

  return {
    title,
    providerKey: readerProviderKey,
    providerName,
    primaryActionKind: evidence?.readerActionKind ?? "read_source",
    reason,
    matchedInterestIds:
      matchedInterestIds.length > 0 ? matchedInterestIds : ["unknown-interest"],
    matchedRules: compactUnique([
      ...withoutReaderSummaryUnverifiedLegalSafetyDemotionRule(
        buildMatchedRules(
          supportEvidence,
          matchedInterestIds,
          readerProviderKey,
        ),
      ),
      ...readerSummaryEditorialCurationRules(story),
      ...readerSummaryUnverifiedLegalSafetyDemotionRules(
        builderConfirmedUnverifiedLegalSafetyDemotion,
      ),
    ]),
    signalScore,
    confidence,
    confirmedProviderKeys: confirmedProviders,
    providerMetrics: storyProviderMetricLabels({
      evidence: supportEvidence,
      representativeMetricLabels: evidence?.providerMetricLabels,
    }),
    whyImportant,
    whyNow: buildWhyNow(undefined, confirmedProviders, supportEvidence),
    publishedAt: evidence?.publishedAt,
    canonicalUrl: citation?.canonicalUrl ?? evidence?.canonicalUrl,
    previewMedia: selectTopReadPreviewMedia(evidence, supportEvidence),
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
  readonly includeStorySummary: boolean;
  readonly supportedProviderKeys: readonly string[];
}): readonly string[] => {
  const candidates = compactUnique([
    ...(params.includeStorySummary
      ? [readerFacingStorySummary(params.story, params.supportedProviderKeys)]
      : []),
    ...(params.cluster?.whyImportant ?? []),
    ...params.evidence.flatMap((item) => item.whyImportant),
    ...(params.includeStorySummary ? [params.story.summary] : []),
  ]).filter(
    (reason) =>
      isUserFacingTopReadReason(reason) &&
      !mentionsUnsupportedReaderProvider(
        reason,
        params.supportedProviderKeys,
      ) &&
      !isReaderTitleReasonDuplicate(params.story.title, reason),
  );

  if (candidates.length > 0) {
    return candidates.slice(0, 4);
  }

  const representative = params.evidence[0];
  const officialReason = firstPartyOfficialReason(representative);
  if (officialReason !== undefined) {
    return [officialReason];
  }
  const evidenceReason = readerFacingEvidenceReason(representative);
  if (evidenceReason !== undefined) {
    return [evidenceReason];
  }
  const metricSummary = representative?.providerMetricSummary?.trim();
  const engagement =
    metricSummary === undefined || metricSummary.length === 0
      ? ""
      : ` with ${metricSummary}`;

  return [readerFacingFallbackReason(representative, engagement)];
};

const readerFacingStorySummary = (
  story: TopReadCandidate,
  supportedProviderKeys: readonly string[],
): string | undefined => {
  const summary = story.summary.trim();
  if (
    summary.length >= minimumDetailedStorySummaryLength &&
    isUserFacingTopReadReason(summary) &&
    !isReaderTitleReasonDuplicate(story.title, summary) &&
    !mentionsUnsupportedReaderProvider(summary, supportedProviderKeys)
  ) {
    return summary;
  }

  const readerSentences = summary
    .split(/(?<=[.!?])\s+/u)
    .filter(
      (sentence) =>
        isUserFacingTopReadReason(sentence) &&
        !isReaderTitleReasonDuplicate(story.title, sentence) &&
        !mentionsUnsupportedReaderProvider(sentence, supportedProviderKeys),
    );
  const cleaned = readerSentences.join(" ").trim();

  return cleaned.length >= minimumSalvagedStorySummaryLength
    ? cleaned
    : undefined;
};

const readerFacingEvidenceReason = (
  evidence: SummaryEvidenceItem | undefined,
): string | undefined => {
  if (
    evidence?.providerKey === "x-twitter" &&
    isUnverifiedBreakingSourceTitle(evidence.title)
  ) {
    return undefined;
  }
  const excerpt = readerFacingEvidenceExcerpt(
    evidence?.bodyPreview,
    evidence?.title,
  );
  if (excerpt === undefined) {
    return undefined;
  }

  switch (evidence?.providerKey) {
    case "reddit":
      return `The Reddit post reports: ${excerpt}`;
    case "x-twitter":
      return `The X post reports: ${excerpt}`;
    case "rss":
      return `The report states: ${excerpt}`;
    case "hacker-news":
      return `The Hacker News source states: ${excerpt}`;
    default:
      return `The source states: ${excerpt}`;
  }
};

const firstPartyOfficialReason = (
  evidence: SummaryEvidenceItem | undefined,
): string | undefined => {
  if (evidence === undefined || !hasFirstPartyOfficialEvidence([evidence])) {
    return undefined;
  }

  const title = evidenceReaderTitle(evidence);
  if (!isReaderFacingTopReadTitle(title)) {
    return undefined;
  }

  const sourceName =
    evidence.authorHandle?.trim() || evidence.providerName?.trim();

  if (sourceName === undefined || sourceName.length === 0) {
    return `The first-party post provides direct evidence for this update: ${title}.`;
  }

  return `${sourceName}'s first-party post provides direct evidence for this update: ${title}.`;
};

const readerFacingFallbackReason = (
  evidence: SummaryEvidenceItem | undefined,
  engagement: string,
): string => {
  if (
    evidence?.providerKey === "x-twitter" &&
    isUnverifiedBreakingSourceTitle(evidence.title)
  ) {
    return `The high-engagement post${engagement} is an unverified rollout report; it is useful for tracking product chatter but should not be treated as confirmation.`;
  }

  switch (evidence?.providerKey) {
    case "hacker-news":
      return `The discussion${engagement} surfaces practical trade-offs that may affect current AI engineering decisions.`;
    case "reddit":
      return `The discussion${engagement} adds user-experience and operational context that may not appear in the original announcement.`;
    case "x-twitter":
      return `The post${engagement} is drawing enough attention to shape current discussion around monitored AI products and developer workflows.`;
    case "rss":
      return `The report${engagement} adds timely context for evaluating monitored AI products and developer workflows.`;
    default:
      return `The source${engagement} adds timely context for current AI product and engineering decisions.`;
  }
};

const isUserFacingTopReadReason = (value: string): boolean => {
  const lower = value.trim().toLowerCase();

  return (
    lower.length > 0 &&
    !isFallbackReaderReason(value) &&
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
