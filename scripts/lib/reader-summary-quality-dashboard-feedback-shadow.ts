import type { Pool } from "pg";

import type { ReaderSummaryArtifactView } from "@social-monitor/summary/features/shared/reader-summary-artifact-presenter";

import type { FeedbackShadowReport } from "./reader-summary-quality-dashboard-contract";
import {
  type DashboardFeedItemRow,
  readDashboardRatings,
} from "./reader-summary-quality-dashboard-published-window";
import {
  dashboardFeedSourceKey,
  dashboardSourceProduct,
} from "./reader-summary-quality-dashboard-source-attribution";
import {
  asRecord,
  averageMetric,
  readMetadataString,
  type ReaderSummaryQualityScope,
  stringValue,
} from "./reader-summary-quality-eval-support";
import {
  fingerprint,
  roundMetric,
} from "./yesterday-social-replay-support";

type RatingTarget = {
  readonly feedItemId?: string;
  readonly sourceItemId?: string;
  readonly providerKey?: string;
  readonly title?: string;
  readonly canonicalUrl?: string;
  readonly postRatingReason?: string;
};

export async function buildFeedbackShadow(
  pool: Pool,
  params: {
    readonly scope: ReaderSummaryQualityScope;
    readonly collectionDate: string;
    readonly view: ReaderSummaryArtifactView | undefined;
    readonly feedItems: readonly DashboardFeedItemRow[];
  },
): Promise<FeedbackShadowReport> {
  const ratings = await readDashboardRatings(
    pool,
    params.scope,
    params.collectionDate,
  );
  const feedItemIds = new Set(params.feedItems.map((item) => item.id));
  const sourceItemIds = new Set(
    params.feedItems.map((item) => item.sourceItemId),
  );
  const feedItemByFeedId = new Map(
    params.feedItems.map((item) => [item.id, item]),
  );
  const feedItemBySourceId = new Map(
    params.feedItems.map((item) => [item.sourceItemId, item]),
  );
  const dayRatings = ratings.filter((rating) => {
    const target = ratingTarget(rating.target);
    return (
      (target.feedItemId !== undefined && feedItemIds.has(target.feedItemId)) ||
      (target.sourceItemId !== undefined &&
        sourceItemIds.has(target.sourceItemId))
    );
  });
  const providerCounts = new Map<string, { total: number; negative: number }>();
  const queryCounts = new Map<string, { total: number; negative: number }>();
  const sourceCounts = new Map<string, { total: number; negative: number }>();
  const negativeReasonCounts = new Map<string, number>();
  const topReadFingerprints = new Set(
    params.view?.content.topReads.map((item) =>
      fingerprint(`${item.providerKey}:${item.canonicalUrl ?? item.title}`),
    ) ?? [],
  );
  const topReadScoresByTarget = topReadSignalScoresByTarget(params.view);
  const matchedTopReadScores: number[] = [];
  const negativeTopReadScores: number[] = [];
  const positiveTopReadScores: number[] = [];
  let negativeTopReadMatchCount = 0;
  let positiveTopReadMatchCount = 0;
  let negativeHighScoreRatingCount = 0;
  let positiveHighScoreRatingCount = 0;

  for (const rating of dayRatings) {
    if (rating.rating === null) {
      continue;
    }
    const target = ratingTarget(rating.target);
    const matchedFeedItem = feedItemForRatingTarget({
      target,
      feedItemByFeedId,
      feedItemBySourceId,
    });
    const providerKey =
      target.providerKey ?? matchedFeedItem?.providerKey ?? "unknown";
    const current = providerCounts.get(providerKey) ?? {
      total: 0,
      negative: 0,
    };
    const isNegative = rating.rating <= 2;
    current.total += 1;
    current.negative += isNegative ? 1 : 0;
    providerCounts.set(providerKey, current);
    if (matchedFeedItem !== undefined) {
      const queryFingerprint = queryLaneFingerprint(matchedFeedItem);
      if (queryFingerprint !== undefined) {
        incrementNegativeRate(queryCounts, queryFingerprint, isNegative);
      }
      incrementNegativeRate(
        sourceCounts,
        fingerprint(
          `${matchedFeedItem.providerKey}:${dashboardFeedSourceKey(matchedFeedItem)}`,
        ),
        isNegative,
      );
    }

    if (isNegative && target.postRatingReason !== undefined) {
      negativeReasonCounts.set(
        target.postRatingReason,
        (negativeReasonCounts.get(target.postRatingReason) ?? 0) + 1,
      );
    }

    const targetFingerprint = fingerprint(
      `${providerKey}:${target.canonicalUrl ?? target.title ?? target.feedItemId ?? ""}`,
    );
    const matchedScore = topReadScoreForTarget(topReadScoresByTarget, target);
    if (matchedScore !== undefined) {
      matchedTopReadScores.push(matchedScore);
      if (isNegative) {
        negativeTopReadScores.push(matchedScore);
        if (matchedScore >= 0.7) {
          negativeHighScoreRatingCount += 1;
        }
      } else if (rating.rating >= 4) {
        positiveTopReadScores.push(matchedScore);
        if (matchedScore >= 0.7) {
          positiveHighScoreRatingCount += 1;
        }
      }
    }
    if (
      matchedScore !== undefined ||
      topReadFingerprints.has(targetFingerprint)
    ) {
      if (isNegative) {
        negativeTopReadMatchCount += 1;
      } else if (rating.rating >= 4) {
        positiveTopReadMatchCount += 1;
      }
    }
  }

  const providerNegativeRates = [...providerCounts.entries()]
    .map(([providerKey, counts]) => ({
      providerKey,
      ratingCount: counts.total,
      negativeRate:
        counts.total === 0 ? 0 : roundMetric(counts.negative / counts.total),
    }))
    .sort(
      (left, right) =>
        right.negativeRate - left.negativeRate ||
        right.ratingCount - left.ratingCount ||
        left.providerKey.localeCompare(right.providerKey),
    );
  const queryNegativeRates = queryNegativeRateRows(queryCounts);
  const sourceNegativeRates = sourceNegativeRateRows(sourceCounts);
  const ratingCount = dayRatings.filter(
    (rating) => rating.rating !== null,
  ).length;
  const negativeRatingCount = dayRatings.filter(
    (rating) => rating.rating !== null && rating.rating <= 2,
  ).length;
  const positiveRatingCount = dayRatings.filter(
    (rating) => rating.rating !== null && rating.rating >= 4,
  ).length;

  return {
    mode: "shadow_no_ranking_influence",
    ratingCount,
    negativeRatingCount,
    positiveRatingCount,
    negativeReasonCounts: Object.fromEntries(
      [...negativeReasonCounts.entries()].sort((left, right) =>
        left[0].localeCompare(right[0]),
      ),
    ),
    providerNegativeRates,
    queryNegativeRates,
    sourceNegativeRates,
    negativeTopReadMatchCount,
    positiveTopReadMatchCount,
    badProviderFingerprints: providerNegativeRates
      .filter((item) => item.ratingCount >= 3 && item.negativeRate >= 0.5)
      .map((item) => fingerprint(item.providerKey)),
    badQueryFingerprints: queryNegativeRates
      .filter((item) => item.ratingCount >= 3 && item.negativeRate >= 0.5)
      .map((item) => item.queryFingerprint),
    badSourceFingerprints: sourceNegativeRates
      .filter((item) => item.ratingCount >= 3 && item.negativeRate >= 0.5)
      .map((item) => item.sourceFingerprint),
    rankingScoreAlignment: {
      status: rankingScoreAlignmentStatus({
        ratingCount,
        matchedTopReadRatingCount: matchedTopReadScores.length,
        negativeHighScoreRatingCount,
        positiveHighScoreRatingCount,
      }),
      matchedTopReadRatingCount: matchedTopReadScores.length,
      averageMatchedTopReadSignalScore: averageMetric(matchedTopReadScores),
      averageNegativeTopReadSignalScore: averageMetric(negativeTopReadScores),
      averagePositiveTopReadSignalScore: averageMetric(positiveTopReadScores),
      negativeHighScoreRatingCount,
      positiveHighScoreRatingCount,
    },
    gates: {
      noRankingInfluence: true,
      enoughFeedbackForLearning: ratingCount >= 20,
      negativeRatingsHaveReason:
        negativeRatingCount === 0 ||
        [...negativeReasonCounts.values()].reduce(
          (sum, count) => sum + count,
          0,
        ) === negativeRatingCount,
      noHighRankNegativeCluster: negativeTopReadMatchCount <= 2,
    },
  };
}

function topReadSignalScoresByTarget(
  view: ReaderSummaryArtifactView | undefined,
): ReadonlyMap<string, number> {
  const scores = new Map<string, number>();
  if (view === undefined) {
    return scores;
  }

  const citationById = new Map(
    view.citations.map((citation) => [citation.citationId, citation]),
  );
  for (const read of view.content.topReads) {
    for (const citationId of read.citationIds) {
      const citation = citationById.get(citationId);
      if (citation === undefined) {
        continue;
      }
      scores.set(`feed:${citation.feedItemId}`, read.signalScore);
      scores.set(`source:${citation.sourceItemId}`, read.signalScore);
    }
  }

  return scores;
}

function feedItemForRatingTarget(params: {
  readonly target: RatingTarget;
  readonly feedItemByFeedId: ReadonlyMap<string, DashboardFeedItemRow>;
  readonly feedItemBySourceId: ReadonlyMap<string, DashboardFeedItemRow>;
}): DashboardFeedItemRow | undefined {
  if (params.target.feedItemId !== undefined) {
    const item = params.feedItemByFeedId.get(params.target.feedItemId);
    if (item !== undefined) {
      return item;
    }
  }
  if (params.target.sourceItemId !== undefined) {
    return params.feedItemBySourceId.get(params.target.sourceItemId);
  }

  return undefined;
}

function queryLaneFingerprint(
  item: DashboardFeedItemRow,
): string | undefined {
  const query =
    readMetadataString(item.providerMetadata, "searchQuery") ??
    dashboardSourceProduct(item.providerMetadata);

  return query === undefined
    ? undefined
    : fingerprint(`${item.providerKey}:${query.toLowerCase()}`);
}

function incrementNegativeRate(
  counts: Map<string, { total: number; negative: number }>,
  key: string,
  isNegative: boolean,
): void {
  const current = counts.get(key) ?? { total: 0, negative: 0 };
  counts.set(key, {
    total: current.total + 1,
    negative: current.negative + (isNegative ? 1 : 0),
  });
}

function queryNegativeRateRows(
  counts: ReadonlyMap<string, { total: number; negative: number }>,
): readonly {
  readonly queryFingerprint: string;
  readonly ratingCount: number;
  readonly negativeRate: number;
}[] {
  return [...counts.entries()]
    .map(([queryFingerprint, value]) => ({
      queryFingerprint,
      ratingCount: value.total,
      negativeRate:
        value.total === 0 ? 0 : roundMetric(value.negative / value.total),
    }))
    .sort(
      (left, right) =>
        right.negativeRate - left.negativeRate ||
        right.ratingCount - left.ratingCount ||
        left.queryFingerprint.localeCompare(right.queryFingerprint),
    );
}

function sourceNegativeRateRows(
  counts: ReadonlyMap<string, { total: number; negative: number }>,
): readonly {
  readonly sourceFingerprint: string;
  readonly ratingCount: number;
  readonly negativeRate: number;
}[] {
  return [...counts.entries()]
    .map(([sourceFingerprint, value]) => ({
      sourceFingerprint,
      ratingCount: value.total,
      negativeRate:
        value.total === 0 ? 0 : roundMetric(value.negative / value.total),
    }))
    .sort(
      (left, right) =>
        right.negativeRate - left.negativeRate ||
        right.ratingCount - left.ratingCount ||
        left.sourceFingerprint.localeCompare(right.sourceFingerprint),
    );
}

function topReadScoreForTarget(
  scores: ReadonlyMap<string, number>,
  target: RatingTarget,
): number | undefined {
  if (target.feedItemId !== undefined) {
    const score = scores.get(`feed:${target.feedItemId}`);
    if (score !== undefined) {
      return score;
    }
  }
  if (target.sourceItemId !== undefined) {
    return scores.get(`source:${target.sourceItemId}`);
  }

  return undefined;
}

export function rankingScoreAlignmentStatus(params: {
  readonly ratingCount: number;
  readonly matchedTopReadRatingCount: number;
  readonly negativeHighScoreRatingCount: number;
  readonly positiveHighScoreRatingCount: number;
}): FeedbackShadowReport["rankingScoreAlignment"]["status"] {
  if (params.ratingCount === 0) {
    return "no_feedback";
  }
  if (params.matchedTopReadRatingCount < 5) {
    return "insufficient_matched_feedback";
  }
  if (
    params.negativeHighScoreRatingCount > params.positiveHighScoreRatingCount
  ) {
    return "attention_needed";
  }

  return "aligned";
}

function ratingTarget(value: unknown): RatingTarget {
  const target = asRecord(value);

  return {
    feedItemId: stringValue(target.feedItemId),
    sourceItemId: stringValue(target.sourceItemId),
    providerKey: stringValue(target.providerKey)?.toLowerCase(),
    title: stringValue(target.title),
    canonicalUrl: stringValue(target.canonicalUrl),
    postRatingReason: stringValue(target.postRatingReason),
  };
}
