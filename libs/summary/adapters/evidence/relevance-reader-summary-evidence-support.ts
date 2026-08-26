import {
  feedProviderMetricsFromMetadata,
  feedProviderMetricStrength,
  formatFeedProviderMetrics,
  summarizeFeedProviderMetrics,
  type FeedItem,
} from "@social-monitor/feed/domain";
import type { RankedFeedItemView } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.result";
import type {
  SourceContentQualityPolicy,
  SourceContentSafetyPolicy,
} from "@social-monitor/relevance/domain";
import type { JsonObject } from "@social-monitor/shared-kernel";

import type { SummaryEvidenceItem } from "../../domain";
import { isReaderSummaryEvidenceEligible } from "../../domain/policies/reader-summary-evidence-eligibility-policy";
import { previewMediaFromProviderMetadata } from "./provider-preview-media";
import { isDefaultReaderSummaryEvidenceProvider } from "./reader-summary-evidence-provider-filter";
import type {
  ReaderSummaryEvidenceSelectorPort,
  ReaderSummaryTimestampPolicy,
} from "../../ports";
import {
  inclusiveObservedBefore,
  isHackerNewsCanonicalUrl,
  isInsidePeriod,
  normalizeProviderKey,
  providerBalancedQuotaForLimit,
  roundScore,
} from "./relevance-reader-summary-evidence-normalization";

export {
  inclusiveObservedAfter,
  inclusiveObservedBefore,
  normalizeProviderKey,
  providerBalancedQuotaForLimit,
  roundScore,
} from "./relevance-reader-summary-evidence-normalization";

export const maxReaderSummaryEvidenceItems = 200;
export const maxReaderSummaryCandidateItems = 200;
export const readerSummaryProviderDiversityOrder = [
  "x-twitter",
  "reddit",
  "hacker-news",
  "rss",
  "github-repo-radar",
];

export const mapRankedItem = (
  item: RankedFeedItemView,
): SummaryEvidenceItem => ({
  feedItemId: item.feedItemId,
  sourceItemId: item.sourceItemId,
  sourceBindingId: item.sourceBindingId,
  interestId: item.interestId,
  providerKey: item.providerKey,
  providerName: providerNameForEvidence({
    providerKey: item.providerKey,
    canonicalUrl: item.canonicalUrl,
  }),
  canonicalUrl: item.canonicalUrl,
  sourceOriginUrl: sourceOriginUrlFromProviderMetadata({
    providerKey: item.providerKey,
    providerMetadata: item.providerMetadata,
  }),
  title: item.title,
  bodyPreview: item.bodyPreview,
  authorHandle: item.authorHandle,
  publishedAt: new Date(item.publishedAt),
  observedAt: new Date(item.observedAt),
  score: item.score,
  whyImportant: item.whyImportant,
  contentQuality: item.contentQuality,
  readerActionKind: readerActionKindForProvider(item.providerKey),
  ...providerMetricFacts({
    providerKey: item.providerKey,
    providerMetadata: item.providerMetadata,
  }),
  previewMedia: previewMediaFromProviderMetadata({
    providerKey: item.providerKey,
    providerMetadata: item.providerMetadata,
    title: item.title,
    canonicalUrl: item.canonicalUrl,
  }),
  storyKeyHint: item.clusterId,
});

export const providerMetricFacts = (params: {
  readonly providerKey: string;
  readonly providerMetadata?: JsonObject;
}): Pick<
  SummaryEvidenceItem,
  "providerMetricLabels" | "providerMetricSummary"
> => {
  const metrics = feedProviderMetricsFromMetadata(params);

  return {
    providerMetricLabels: formatFeedProviderMetrics(metrics),
    providerMetricSummary: summarizeFeedProviderMetrics(metrics),
  };
};

export const sourceOriginUrlFromProviderMetadata = (params: {
  readonly providerKey: string;
  readonly providerMetadata?: JsonObject;
}): string | undefined => {
  const providerKey = normalizeProviderKey(params.providerKey);
  if (providerKey !== "hacker-news" && providerKey !== "hn") {
    return undefined;
  }
  const externalUrl = params.providerMetadata?.externalUrl;
  if (typeof externalUrl !== "string") {
    return undefined;
  }

  try {
    const url = new URL(externalUrl);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
};

export const readerActionKindForProvider = (
  providerKey: string,
): SummaryEvidenceItem["readerActionKind"] =>
  providerKey === "github-repo-radar" || providerKey === "github-trending-page"
    ? "watch_repository"
    : "read_source";

export const providerNameForProvider = (providerKey: string): string => {
  switch (providerKey.toLowerCase()) {
    case "github-trending-page":
      return "GitHub Trending";
    case "github-repo-radar":
      return "Repo Radar";
    case "github-issues":
    case "github":
      return "GitHub";
    case "hacker-news":
    case "hn":
      return "Hacker News";
    case "reddit":
      return "Reddit";
    case "x-twitter":
    case "twitter":
      return "X/Twitter";
    case "rss":
      return "RSS";
    default:
      return providerKey;
  }
};

export const providerNameForEvidence = (params: {
  readonly providerKey: string;
  readonly canonicalUrl?: string;
}): string =>
  params.providerKey.toLowerCase() === "rss" &&
  isHackerNewsCanonicalUrl(params.canonicalUrl)
    ? "Hacker News via RSS"
    : providerNameForProvider(params.providerKey);

export const expandedCandidateLimit = (limit: number): number => {
  if (!Number.isInteger(limit) || limit < 1) {
    return 1;
  }

  return maxReaderSummaryCandidateItems;
};

export const selectRankedEvidence = (
  items: readonly SummaryEvidenceItem[],
  limit: number,
  priorityFeedItemIds: ReadonlySet<string> = new Set(),
): readonly SummaryEvidenceItem[] => {
  const normalizedLimit = normalizeSelectionLimit(limit);
  const eligibleItems = items.filter(isEligibleForEvidence);

  return selectProviderDiverseEvidence(
    eligibleItems,
    normalizedLimit,
    priorityFeedItemIds,
  );
};

export const selectProviderDiverseEvidence = (
  items: readonly SummaryEvidenceItem[],
  limit: number,
  priorityFeedItemIds: ReadonlySet<string> = new Set(),
): readonly SummaryEvidenceItem[] => {
  const selectedIds = new Set<string>();
  const activeProviders = readerSummaryProviderDiversityOrder.filter(
    (providerKey) =>
      isDefaultReaderSummaryEvidenceProvider(providerKey) &&
      items.some(
        (item) => normalizeProviderKey(item.providerKey) === providerKey,
      ),
  );
  const providerQuota = providerBalancedQuotaForLimit({
    limit,
    activeProviderCount: activeProviders.length,
  });

  for (const providerKey of activeProviders) {
    let providerCount = 0;

    for (const item of prioritizeProviderItems(items, priorityFeedItemIds)) {
      if (
        providerCount >= providerQuota ||
        normalizeProviderKey(item.providerKey) !== providerKey ||
        selectedIds.has(item.feedItemId)
      ) {
        continue;
      }

      selectedIds.add(item.feedItemId);
      providerCount += 1;
    }
  }

  const selected = items.filter((item) => selectedIds.has(item.feedItemId));
  const backfill = items.filter((item) => !selectedIds.has(item.feedItemId));

  return [...selected, ...backfill].slice(0, limit);
};

const prioritizeProviderItems = (
  items: readonly SummaryEvidenceItem[],
  priorityFeedItemIds: ReadonlySet<string>,
): readonly SummaryEvidenceItem[] => {
  if (priorityFeedItemIds.size === 0) {
    return items;
  }

  return [
    ...items.filter((item) => priorityFeedItemIds.has(item.feedItemId)),
    ...items.filter((item) => !priorityFeedItemIds.has(item.feedItemId)),
  ];
};

export const isEligibleForEvidence = (item: SummaryEvidenceItem): boolean =>
  isReaderSummaryEvidenceEligible(item);

export const filterItemsByDefaultReaderSummaryProviders = (
  items: readonly SummaryEvidenceItem[],
): readonly SummaryEvidenceItem[] =>
  items.filter((item) =>
    isDefaultReaderSummaryEvidenceProvider(item.providerKey),
  );

export const filterItemsByReaderSummaryPeriod = (
  items: readonly SummaryEvidenceItem[],
  period: Parameters<ReaderSummaryEvidenceSelectorPort["select"]>[0]["period"],
  timestampPolicy: ReaderSummaryTimestampPolicy = "published_at",
): readonly SummaryEvidenceItem[] =>
  items.filter((item) =>
    isInsidePeriod(
      timestampPolicy === "observed_at" ? item.observedAt : item.publishedAt,
      period,
    ),
  );

export const readerSummaryPeriodQuery = (
  params: Parameters<ReaderSummaryEvidenceSelectorPort["select"]>[0],
): {
  readonly observedAtOrAfter?: Date;
  readonly observedBefore?: Date;
  readonly publishedAtOrAfter?: Date;
  readonly publishedBefore?: Date;
} => {
  if ((params.timestampPolicy ?? "published_at") === "observed_at") {
    return {
      observedAtOrAfter: params.period.startedAt,
      observedBefore: params.period.endedAt,
    };
  }

  return {
    publishedAtOrAfter: params.period.startedAt,
    publishedBefore: params.period.endedAt,
    observedBefore:
      params.observedThrough === undefined
        ? undefined
        : inclusiveObservedBefore(params.observedThrough),
  };
};

export const normalizeSelectionLimit = (limit: number): number => {
  if (!Number.isInteger(limit) || limit < 1) {
    return 1;
  }

  return Math.min(limit, maxReaderSummaryEvidenceItems);
};

export const providerReserveForLimit = (limit: number): number => {
  const normalizedLimit = normalizeSelectionLimit(limit);

  if (normalizedLimit >= 120) {
    return 12;
  }

  if (normalizedLimit >= 40) {
    return 6;
  }

  if (normalizedLimit >= 8) {
    return 2;
  }

  return 1;
};

export const providerSupplementTargetForLimit = (limit: number): number => {
  const normalizedLimit = normalizeSelectionLimit(limit);

  if (normalizedLimit >= 120) {
    return 40;
  }

  if (normalizedLimit >= 80) {
    return 20;
  }

  if (normalizedLimit >= 40) {
    return 10;
  }

  if (normalizedLimit >= 20) {
    return 5;
  }

  return providerReserveForLimit(normalizedLimit);
};

export const countItemsForProvider = (
  items: Iterable<SummaryEvidenceItem>,
  providerKey: string,
): number => {
  let count = 0;
  const normalizedProviderKey = normalizeProviderKey(providerKey);

  for (const item of items) {
    if (normalizeProviderKey(item.providerKey) === normalizedProviderKey) {
      count += 1;
    }
  }

  return count;
};

export const mapSupplementFeedItem = (params: {
  readonly snapshot: ReturnType<FeedItem["toSnapshot"]>;
  readonly qualityPolicy: SourceContentQualityPolicy;
  readonly safetyPolicy: SourceContentSafetyPolicy;
  readonly now: Date;
}): SummaryEvidenceItem => {
  const safety = params.safetyPolicy.evaluate({
    providerKey: params.snapshot.providerKey,
    title: params.snapshot.title,
    bodyPreview: params.snapshot.bodyPreview,
    canonicalUrl: params.snapshot.canonicalUrl,
  });
  const quality = params.qualityPolicy.evaluate({
    providerKey: params.snapshot.providerKey,
    title: safety.sanitizedTitle,
    bodyPreview: safety.sanitizedBodyPreview,
    canonicalUrl: safety.sanitizedCanonicalUrl,
    authorHandle: params.snapshot.authorHandle,
    providerMetadata: params.snapshot.providerMetadata,
  });
  const score = supplementEvidenceScore({
    snapshot: params.snapshot,
    contentQuality: quality,
    now: params.now,
  });

  return {
    feedItemId: params.snapshot.id,
    sourceItemId: params.snapshot.sourceItemId,
    sourceBindingId: params.snapshot.sourceBindingId,
    interestId: params.snapshot.interestId,
    providerKey: params.snapshot.providerKey,
    providerName: providerNameForEvidence({
      providerKey: params.snapshot.providerKey,
      canonicalUrl:
        safety.sanitizedCanonicalUrl ?? params.snapshot.canonicalUrl,
    }),
    canonicalUrl: safety.sanitizedCanonicalUrl ?? params.snapshot.canonicalUrl,
    sourceOriginUrl: sourceOriginUrlFromProviderMetadata({
      providerKey: params.snapshot.providerKey,
      providerMetadata: params.snapshot.providerMetadata,
    }),
    title: safety.sanitizedTitle,
    bodyPreview: safety.sanitizedBodyPreview,
    authorHandle: params.snapshot.authorHandle,
    publishedAt: params.snapshot.publishedAt,
    observedAt: params.snapshot.observedAt,
    score,
    whyImportant: supplementWhyImportant({
      score,
      quality,
      safetyStatus: safety.status,
    }),
    contentQuality: quality,
    readerActionKind: readerActionKindForProvider(params.snapshot.providerKey),
    ...providerMetricFacts({
      providerKey: params.snapshot.providerKey,
      providerMetadata: params.snapshot.providerMetadata,
    }),
    previewMedia: previewMediaFromProviderMetadata({
      providerKey: params.snapshot.providerKey,
      providerMetadata: params.snapshot.providerMetadata,
      title: safety.sanitizedTitle,
      canonicalUrl:
        safety.sanitizedCanonicalUrl ?? params.snapshot.canonicalUrl,
    }),
  };
};

export const supplementEvidenceScore = (params: {
  readonly snapshot: ReturnType<FeedItem["toSnapshot"]>;
  readonly contentQuality: SummaryEvidenceItem["contentQuality"];
  readonly now: Date;
}): number => {
  const metrics = feedProviderMetricsFromMetadata({
    providerKey: params.snapshot.providerKey,
    providerMetadata: params.snapshot.providerMetadata,
  });
  const sourceSignalScore =
    metrics === undefined
      ? 0
      : Math.min(0.85, feedProviderMetricStrength(metrics) / 10);
  const qualityAdjustedSourceSignalScore =
    sourceSignalScore *
    (params.contentQuality?.qualityScore ?? 1) *
    (params.contentQuality?.interestRelevanceScore ?? 1) *
    (params.contentQuality?.engagementIntegrityScore ?? 1);
  const ageHours = Math.max(
    0,
    (params.now.getTime() - params.snapshot.publishedAt.getTime()) / 3_600_000,
  );
  const recencyScore = Math.max(0, 0.5 - ageHours / 336);

  return roundScore(1 + qualityAdjustedSourceSignalScore + recencyScore);
};

export const supplementWhyImportant = (params: {
  readonly score: number;
  readonly quality: SummaryEvidenceItem["contentQuality"];
  readonly safetyStatus: "allowed" | "sanitized" | "blocked";
}): readonly string[] => {
  const reasons = [
    "Selected to preserve provider coverage in the reader summary window",
  ];

  if (params.score >= 1.35) {
    reasons.push("Strong source engagement signal");
  }

  if (params.quality?.eligibleForTopRead === true) {
    reasons.push("Passes source quality and interest relevance gate");
  }

  if (params.quality?.decision === "downrank") {
    reasons.push(
      `Down-ranked by source quality gate: ${params.quality.reason}`,
    );
  }

  if (params.safetyStatus === "sanitized") {
    reasons.push(
      "Unsafe source instructions were sandboxed before summarization",
    );
  }

  return reasons;
};
