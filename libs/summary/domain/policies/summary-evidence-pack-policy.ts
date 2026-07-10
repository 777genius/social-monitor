import type {
  SummaryEvidenceItem,
  SummaryEvidenceSelection,
  StoryCluster,
} from "../value-objects/summary-evidence-item";
import { readerSummaryProviderIdentity } from "../value-objects/reader-summary-provider-identity";
import { hasFirstPartyOfficialEvidence } from "./reader-summary-source-authority-policy";

export type SummaryEvidencePackSignal = {
  readonly feedItemId: string;
  readonly sourceItemId: string;
  readonly providerKey: string;
  readonly title: string;
  readonly score: number;
  readonly reasonCodes: readonly string[];
};

export type SummaryEvidencePackConfidence = {
  readonly level: "none" | "low" | "medium" | "high";
  readonly score: number;
  readonly rationale: string;
};

export type SummaryEvidencePack = {
  readonly officialSignals: readonly SummaryEvidencePackSignal[];
  readonly topCommunitySignals: readonly SummaryEvidencePackSignal[];
  readonly emergingSignals: readonly SummaryEvidencePackSignal[];
  readonly dissentingViews: readonly SummaryEvidencePackSignal[];
  readonly highEngagementLowConfidence: readonly SummaryEvidencePackSignal[];
  readonly duplicatesCollapsed: readonly {
    readonly clusterId: string;
    readonly representativeFeedItemId: string;
    readonly duplicateFeedItemIds: readonly string[];
    readonly providerKeys: readonly string[];
  }[];
  readonly sourceCoverage: {
    readonly selectedEvidenceCount: number;
    readonly providerCount: number;
    readonly providerCounts: readonly {
      readonly providerKey: string;
      readonly count: number;
    }[];
    readonly crossProviderClusterCount: number;
  };
  readonly confidence: SummaryEvidencePackConfidence;
};

const communityProviderKeys = new Set([
  "reddit",
  "x-twitter",
  "hacker-news",
  "bluesky",
]);

const dissentFragments = [
  "debunk",
  "not true",
  "false",
  "disagree",
  "counterpoint",
  "correction",
  "contradict",
];

const highEngagementLabels = new Set([
  "score",
  "upvotes",
  "likes",
  "reposts",
  "comments",
  "numComments",
  "replyCount",
]);

export const buildSummaryEvidencePack = (
  selection: SummaryEvidenceSelection,
): SummaryEvidencePack => {
  const providerCounts = providerEvidenceCounts(selection.selectedEvidence);
  const sourceCoverage = {
    selectedEvidenceCount: selection.selectedEvidence.length,
    providerCount: providerCounts.length,
    providerCounts,
    crossProviderClusterCount: countIndependentCrossProviderClusters(selection),
  };

  return {
    officialSignals: topSignals(
      selection.selectedEvidence.filter(
        (item) => isOfficialSignal(item) && isQualityLeadSignal(item),
      ),
      5,
    ),
    topCommunitySignals: topSignals(
      selection.selectedEvidence.filter(
        (item) => isCommunitySignal(item) && isQualityLeadSignal(item),
      ),
      8,
    ),
    emergingSignals: orderedSignals(
      selection.selectedEvidence
        .filter(isQualityLeadSignal)
        .sort(
          (left, right) =>
            right.observedAt.getTime() - left.observedAt.getTime(),
        ),
      5,
    ),
    dissentingViews: topSignals(
      selection.selectedEvidence.filter(hasDissentSignal),
      5,
    ),
    highEngagementLowConfidence: topSignals(
      selection.selectedEvidence.filter(isHighEngagementLowConfidence),
      5,
    ),
    duplicatesCollapsed: duplicateClusters(selection.clusters),
    sourceCoverage,
    confidence: confidenceFor(sourceCoverage),
  };
};

const countIndependentCrossProviderClusters = (
  selection: SummaryEvidenceSelection,
): number => {
  const evidenceByFeedItemId = new Map(
    selection.selectedEvidence.map((item) => [item.feedItemId, item] as const),
  );

  return selection.clusters.filter((cluster) => {
    const clusterEvidence = [
      cluster.representativeFeedItemId,
      ...cluster.duplicateFeedItemIds,
    ]
      .map((feedItemId) => evidenceByFeedItemId.get(feedItemId))
      .filter((item): item is SummaryEvidenceItem => item !== undefined);
    const providerKeys =
      clusterEvidence.length >= 2
        ? clusterEvidence.map(
            (item) => readerSummaryProviderIdentity(item).providerKey,
          )
        : cluster.providerKeys;

    return new Set(providerKeys).size > 1;
  }).length;
};

const topSignals = (
  items: readonly SummaryEvidenceItem[],
  limit: number,
): readonly SummaryEvidencePackSignal[] =>
  [...items]
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.providerKey.localeCompare(right.providerKey) ||
        left.feedItemId.localeCompare(right.feedItemId),
    )
    .slice(0, limit)
    .map(toPackSignal);

const orderedSignals = (
  items: readonly SummaryEvidenceItem[],
  limit: number,
): readonly SummaryEvidencePackSignal[] => items.slice(0, limit).map(toPackSignal);

const toPackSignal = (item: SummaryEvidenceItem): SummaryEvidencePackSignal => ({
  feedItemId: item.feedItemId,
  sourceItemId: item.sourceItemId,
  providerKey: item.providerKey,
  title: item.title,
  score: item.score,
  reasonCodes: signalReasonCodes(item),
});

const signalReasonCodes = (
  item: SummaryEvidenceItem,
): readonly string[] => {
  const reasonCodes = [`provider:${item.providerKey}`];

  if (isOfficialSignal(item)) {
    reasonCodes.push("official_or_primary_source");
  }
  if (isCommunitySignal(item)) {
    reasonCodes.push("community_source");
  }
  if (hasDissentSignal(item)) {
    reasonCodes.push("dissent_or_correction");
  }
  if (isHighEngagementLowConfidence(item)) {
    reasonCodes.push("high_engagement_low_confidence");
  }
  if (item.conversationContext !== undefined) {
    reasonCodes.push("discussion_context_available");
  }

  return [...new Set(reasonCodes)].sort();
};

const isOfficialSignal = (item: SummaryEvidenceItem): boolean =>
  hasFirstPartyOfficialEvidence([item]) ||
  (item.matchedRules ?? []).some((rule) => /official|trusted/i.test(rule));

const isCommunitySignal = (item: SummaryEvidenceItem): boolean =>
  communityProviderKeys.has(item.providerKey);

const hasDissentSignal = (item: SummaryEvidenceItem): boolean => {
  const text = `${item.title} ${item.bodyPreview ?? ""}`.toLowerCase();

  return (
    dissentFragments.some((fragment) => text.includes(fragment)) ||
    (item.contentQuality?.flags ?? []).some((flag) =>
      /dissent|contradict|correction|disagree/i.test(flag),
    )
  );
};

const isHighEngagementLowConfidence = (item: SummaryEvidenceItem): boolean =>
  hasHighEngagementMetric(item) && !isQualityLeadSignal(item);

const isQualityLeadSignal = (item: SummaryEvidenceItem): boolean =>
  item.contentQuality?.eligibleForSummary !== false &&
  item.contentQuality?.needsLlmReview !== true &&
  item.contentQuality?.decision !== "downrank" &&
  (item.contentQuality?.interestRelevanceScore ?? 1) >= 0.5 &&
  (item.contentQuality?.engagementIntegrityScore ?? 1) >= 0.5;

const hasHighEngagementMetric = (item: SummaryEvidenceItem): boolean =>
  (item.providerMetricLabels ?? []).some((metric) => {
    if (!highEngagementLabels.has(metric.label)) {
      return false;
    }

    return numericMetricValue(metric.value) >= 50;
  });

const numericMetricValue = (value: string): number => {
  const parsed = Number(value.replaceAll(",", ""));

  return Number.isFinite(parsed) ? parsed : 0;
};

const duplicateClusters = (
  clusters: readonly StoryCluster[],
): SummaryEvidencePack["duplicatesCollapsed"] =>
  clusters
    .filter((cluster) => cluster.duplicateFeedItemIds.length > 0)
    .map((cluster) => ({
      clusterId: cluster.id,
      representativeFeedItemId: cluster.representativeFeedItemId,
      duplicateFeedItemIds: cluster.duplicateFeedItemIds,
      providerKeys: cluster.providerKeys,
    }));

const providerEvidenceCounts = (
  items: readonly SummaryEvidenceItem[],
): SummaryEvidencePack["sourceCoverage"]["providerCounts"] => {
  const counts = new Map<string, number>();

  for (const item of items) {
    counts.set(item.providerKey, (counts.get(item.providerKey) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([providerKey, count]) => ({ providerKey, count }))
    .sort(
      (left, right) =>
        right.count - left.count ||
        left.providerKey.localeCompare(right.providerKey),
    );
};

const confidenceFor = (
  coverage: SummaryEvidencePack["sourceCoverage"],
): SummaryEvidencePackConfidence => {
  if (coverage.selectedEvidenceCount === 0) {
    return {
      level: "none",
      score: 0,
      rationale: "No selected evidence is available.",
    };
  }

  if (coverage.providerCount >= 3 && coverage.crossProviderClusterCount > 0) {
    return {
      level: "high",
      score: 0.82,
      rationale:
        "Evidence spans at least three providers and includes cross-provider support.",
    };
  }

  if (coverage.providerCount >= 2 && coverage.crossProviderClusterCount > 0) {
    return {
      level: "medium",
      score: 0.68,
      rationale:
        "Evidence includes cross-provider repetition, but that does not independently verify every claim.",
    };
  }

  if (coverage.providerCount >= 2) {
    return {
      level: "medium",
      score: 0.65,
      rationale:
        "Evidence includes multiple providers, but no cross-provider cluster.",
    };
  }

  return {
    level: "low",
    score: 0.35,
    rationale: "Evidence comes from a single provider.",
  };
};
