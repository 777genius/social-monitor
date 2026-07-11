import type { ReaderSummaryNarrativeSectionKind } from "../entities/reader-summary-narrative-section";
import {
  matchesReaderSummaryMultiDayGenerationProfile,
  readerSummaryMultiDayGenerationProfileMismatch,
  type ReaderSummaryMultiDayGenerationProfile,
} from "./reader-summary-multi-day-generation-profile";

export type ReaderSummaryMultiDayGoldDay = {
  readonly collectionDate: string;
  readonly storyExpectations: readonly {
    readonly feedItemId: string;
    readonly expectedStoryKey: string;
    readonly providerKey: string;
  }[];
  readonly crossSourceExpectations: readonly {
    readonly expectedStoryKey: string;
    readonly expected: boolean;
  }[];
  readonly rankingExpectations: readonly {
    readonly feedItemId: string;
    readonly expected: "top_read" | "exclude";
  }[];
  readonly narrativeExpectations: readonly {
    readonly expectedStoryKey: string;
    readonly expectedKind: "lead" | "secondary_signal";
  }[];
};

export type ReaderSummaryMultiDayActualDay = {
  readonly collectionDate: string;
  readonly modelVersion: string;
  readonly promptVersion: string;
  readonly rankingPolicyVersion: string;
  readonly storyClusters: readonly {
    readonly id: string;
    readonly representativeFeedItemId: string;
    readonly duplicateFeedItemIds: readonly string[];
    readonly providerKeys: readonly string[];
  }[];
  readonly topReadFeedItemIds: readonly string[];
  readonly topReadQualityEligibility: readonly boolean[];
  readonly narrativeSections: readonly {
    readonly kind: ReaderSummaryNarrativeSectionKind;
    readonly storyClusterId?: string;
    readonly citationFeedItemIds: readonly string[];
  }[];
};

export type ReaderSummaryMultiDayQualityThresholds = {
  readonly minimumDayCount: number;
  readonly minimumStoryPairPrecision: number;
  readonly minimumStoryPairRecall: number;
  readonly minimumCrossSourcePrecision: number;
  readonly minimumCrossSourceRecall: number;
  readonly minimumRankingAccuracy: number;
  readonly minimumNarrativeCoverage: number;
  readonly maximumWeakTopReadRate: number;
};

export type ReaderSummaryMultiDayQualityResult = {
  readonly metrics: {
    readonly dayCount: number;
    readonly currentGenerationArtifactCount: number;
    readonly storyPairPrecision: number;
    readonly storyPairRecall: number;
    readonly crossSourcePrecision: number;
    readonly crossSourceRecall: number;
    readonly falseCrossSourceClusterCount: number;
    readonly rankingAccuracy: number;
    readonly topReadPositiveRecall: number;
    readonly excludedItemRejectionRate: number;
    readonly narrativeCoverage: number;
    readonly leadCoverage: number;
    readonly secondarySignalCoverage: number;
    readonly weakTopReadRate: number;
    readonly missingExpectedFeedItemCount: number;
  };
  readonly days: readonly ReaderSummaryMultiDayQualityDayResult[];
  readonly qualityGates: Record<string, boolean>;
  readonly blockingPassed: boolean;
};

export type ReaderSummaryMultiDayQualityDayResult = {
  readonly collectionDate: string;
  readonly metrics: Omit<
    ReaderSummaryMultiDayQualityResult["metrics"],
    "dayCount"
  >;
  readonly issues: readonly string[];
};

export const evaluateReaderSummaryMultiDayQuality = (params: {
  readonly actualDays: readonly ReaderSummaryMultiDayActualDay[];
  readonly goldDays: readonly ReaderSummaryMultiDayGoldDay[];
  readonly thresholds: ReaderSummaryMultiDayQualityThresholds;
  readonly expectedGenerationProfile: ReaderSummaryMultiDayGenerationProfile;
}): ReaderSummaryMultiDayQualityResult => {
  const actualByDate = new Map(
    params.actualDays.map((day) => [day.collectionDate, day] as const),
  );
  const days = params.goldDays.map((gold) =>
    evaluateDay(
      gold,
      actualByDate.get(gold.collectionDate),
      params.expectedGenerationProfile,
    ),
  );
  const aggregate = aggregateMetrics(days);
  const qualityGates = {
    minimumRealDayCount:
      aggregate.dayCount >= params.thresholds.minimumDayCount,
    allDaysUseExpectedGenerationProfile:
      aggregate.currentGenerationArtifactCount === aggregate.dayCount,
    storyPairPrecision:
      aggregate.storyPairPrecision >=
      params.thresholds.minimumStoryPairPrecision,
    storyPairRecall:
      aggregate.storyPairRecall >= params.thresholds.minimumStoryPairRecall,
    crossSourcePrecision:
      aggregate.crossSourcePrecision >=
      params.thresholds.minimumCrossSourcePrecision,
    crossSourceRecall:
      aggregate.crossSourceRecall >= params.thresholds.minimumCrossSourceRecall,
    rankingAccuracy:
      aggregate.rankingAccuracy >= params.thresholds.minimumRankingAccuracy,
    narrativeCoverage:
      aggregate.narrativeCoverage >= params.thresholds.minimumNarrativeCoverage,
    weakTopReadRate:
      aggregate.weakTopReadRate <= params.thresholds.maximumWeakTopReadRate,
    allGoldFeedItemsPresent: aggregate.missingExpectedFeedItemCount === 0,
  };

  return {
    metrics: aggregate,
    days,
    qualityGates,
    blockingPassed: Object.values(qualityGates).every(Boolean),
  };
};

const evaluateDay = (
  gold: ReaderSummaryMultiDayGoldDay,
  actual: ReaderSummaryMultiDayActualDay | undefined,
  expectedGenerationProfile: ReaderSummaryMultiDayGenerationProfile,
): ReaderSummaryMultiDayQualityDayResult => {
  if (actual === undefined) {
    return {
      collectionDate: gold.collectionDate,
      metrics: emptyMetrics(),
      issues: [`Missing persisted reader summary for ${gold.collectionDate}`],
    };
  }
  const clusterByFeedItemId = new Map<string, string>();
  const clusterById = new Map(
    actual.storyClusters.map((item) => [item.id, item]),
  );
  for (const cluster of actual.storyClusters) {
    for (const feedItemId of [
      cluster.representativeFeedItemId,
      ...cluster.duplicateFeedItemIds,
    ]) {
      clusterByFeedItemId.set(feedItemId, cluster.id);
    }
  }
  const pairCounts = storyPairCounts(
    gold.storyExpectations,
    clusterByFeedItemId,
  );
  const missingExpectedFeedItemIds = gold.storyExpectations
    .map((item) => item.feedItemId)
    .filter((feedItemId) => !clusterByFeedItemId.has(feedItemId));
  const crossSource = crossSourceCounts({
    expectations: gold.crossSourceExpectations,
    storyExpectations: gold.storyExpectations,
    clusterByFeedItemId,
    clusterById,
  });
  const topReadIds = new Set(actual.topReadFeedItemIds);
  const positiveRanking = gold.rankingExpectations.filter(
    (item) => item.expected === "top_read",
  );
  const excludedRanking = gold.rankingExpectations.filter(
    (item) => item.expected === "exclude",
  );
  const rankingCorrect = gold.rankingExpectations.filter((item) =>
    item.expected === "top_read"
      ? topReadIds.has(item.feedItemId)
      : !topReadIds.has(item.feedItemId),
  ).length;
  const narratives = narrativeCounts({
    expectations: gold.narrativeExpectations,
    sections: actual.narrativeSections,
    storyExpectations: gold.storyExpectations,
    clusterByFeedItemId,
  });
  const usesExpectedGenerationProfile =
    matchesReaderSummaryMultiDayGenerationProfile(
      actual,
      expectedGenerationProfile,
    );
  const weakTopReadCount = actual.topReadQualityEligibility.filter(
    (eligible) => !eligible,
  ).length;
  const issues = [
    ...(usesExpectedGenerationProfile
      ? []
      : [readerSummaryMultiDayGenerationProfileMismatch(actual)]),
    ...missingExpectedFeedItemIds.map(
      (feedItemId) => `Missing expected feed item ${feedItemId}`,
    ),
    ...pairCounts.issues,
    ...crossSource.issues,
    ...gold.rankingExpectations
      .filter((item) =>
        item.expected === "top_read"
          ? !topReadIds.has(item.feedItemId)
          : topReadIds.has(item.feedItemId),
      )
      .map(
        (item) =>
          `Ranking mismatch for ${item.feedItemId}: expected ${item.expected}`,
      ),
    ...narratives.issues,
  ];

  return {
    collectionDate: gold.collectionDate,
    metrics: {
      currentGenerationArtifactCount: usesExpectedGenerationProfile ? 1 : 0,
      storyPairPrecision: ratio(
        pairCounts.truePositive,
        pairCounts.truePositive + pairCounts.falseMerge,
      ),
      storyPairRecall: ratio(
        pairCounts.truePositive,
        pairCounts.truePositive + pairCounts.falseSplit,
      ),
      crossSourcePrecision: ratio(
        crossSource.truePositive,
        crossSource.truePositive + crossSource.falsePositive,
      ),
      crossSourceRecall: ratio(
        crossSource.truePositive,
        crossSource.truePositive + crossSource.falseNegative,
      ),
      falseCrossSourceClusterCount: crossSource.falsePositive,
      rankingAccuracy: ratio(rankingCorrect, gold.rankingExpectations.length),
      topReadPositiveRecall: ratio(
        positiveRanking.filter((item) => topReadIds.has(item.feedItemId))
          .length,
        positiveRanking.length,
      ),
      excludedItemRejectionRate: ratio(
        excludedRanking.filter((item) => !topReadIds.has(item.feedItemId))
          .length,
        excludedRanking.length,
      ),
      narrativeCoverage: ratio(narratives.matched, narratives.total),
      leadCoverage: ratio(narratives.matchedLead, narratives.totalLead),
      secondarySignalCoverage: ratio(
        narratives.matchedSecondary,
        narratives.totalSecondary,
      ),
      weakTopReadRate: ratio(
        weakTopReadCount,
        actual.topReadQualityEligibility.length,
      ),
      missingExpectedFeedItemCount: missingExpectedFeedItemIds.length,
    },
    issues,
  };
};

const storyPairCounts = (
  expectations: ReaderSummaryMultiDayGoldDay["storyExpectations"],
  clusterByFeedItemId: ReadonlyMap<string, string>,
) => {
  let truePositive = 0;
  let falseMerge = 0;
  let falseSplit = 0;
  const issues: string[] = [];
  for (let left = 0; left < expectations.length; left += 1) {
    for (let right = left + 1; right < expectations.length; right += 1) {
      const leftItem = expectations[left]!;
      const rightItem = expectations[right]!;
      const expectedSame =
        leftItem.expectedStoryKey === rightItem.expectedStoryKey;
      const predictedSame =
        clusterByFeedItemId.get(leftItem.feedItemId) !== undefined &&
        clusterByFeedItemId.get(leftItem.feedItemId) ===
          clusterByFeedItemId.get(rightItem.feedItemId);
      if (expectedSame && predictedSame) {
        truePositive += 1;
      } else if (!expectedSame && predictedSame) {
        falseMerge += 1;
        issues.push(
          `False story merge: ${leftItem.feedItemId}, ${rightItem.feedItemId}`,
        );
      } else if (expectedSame) {
        falseSplit += 1;
        issues.push(
          `False story split: ${leftItem.feedItemId}, ${rightItem.feedItemId}`,
        );
      }
    }
  }

  return { truePositive, falseMerge, falseSplit, issues };
};

const crossSourceCounts = (params: {
  readonly expectations: ReaderSummaryMultiDayGoldDay["crossSourceExpectations"];
  readonly storyExpectations: ReaderSummaryMultiDayGoldDay["storyExpectations"];
  readonly clusterByFeedItemId: ReadonlyMap<string, string>;
  readonly clusterById: ReadonlyMap<
    string,
    ReaderSummaryMultiDayActualDay["storyClusters"][number]
  >;
}) => {
  const expectedGroups = groupBy(
    params.storyExpectations,
    (item) => item.expectedStoryKey,
  );
  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  const issues: string[] = [];
  for (const expectation of params.expectations) {
    const storyKey = expectation.expectedStoryKey;
    const items = expectedGroups.get(storyKey) ?? [];
    const predictedClusters = new Set(
      items
        .map((item) => params.clusterByFeedItemId.get(item.feedItemId))
        .filter((value): value is string => value !== undefined),
    );
    const expectedCrossSource = expectation.expected;
    const predictedCrossSource =
      predictedClusters.size === 1 &&
      (params.clusterById.get([...predictedClusters][0] ?? "")?.providerKeys
        .length ?? 0) > 1;
    if (expectedCrossSource && predictedCrossSource) {
      truePositive += 1;
    } else if (expectedCrossSource) {
      falseNegative += 1;
      issues.push(`Missing cross-source cluster for ${storyKey}`);
    } else if (predictedCrossSource) {
      falsePositive += 1;
      issues.push(`False cross-source cluster for ${storyKey}`);
    }
  }

  return { truePositive, falsePositive, falseNegative, issues };
};

const narrativeCounts = (params: {
  readonly expectations: ReaderSummaryMultiDayGoldDay["narrativeExpectations"];
  readonly sections: ReaderSummaryMultiDayActualDay["narrativeSections"];
  readonly storyExpectations: ReaderSummaryMultiDayGoldDay["storyExpectations"];
  readonly clusterByFeedItemId: ReadonlyMap<string, string>;
}) => {
  const clusterIdsByStoryKey = new Map<string, Set<string>>();
  for (const item of params.storyExpectations) {
    const clusterId = params.clusterByFeedItemId.get(item.feedItemId);
    if (clusterId === undefined) {
      continue;
    }
    const ids = clusterIdsByStoryKey.get(item.expectedStoryKey) ?? new Set();
    ids.add(clusterId);
    clusterIdsByStoryKey.set(item.expectedStoryKey, ids);
  }
  let matched = 0;
  let matchedLead = 0;
  let matchedSecondary = 0;
  let totalLead = 0;
  let totalSecondary = 0;
  const issues: string[] = [];
  for (const expectation of params.expectations) {
    const expectedClusterIds =
      clusterIdsByStoryKey.get(expectation.expectedStoryKey) ?? new Set();
    const found = params.sections.some((section) => {
      if (section.kind !== expectation.expectedKind) {
        return false;
      }
      if (
        section.storyClusterId !== undefined &&
        expectedClusterIds.has(section.storyClusterId)
      ) {
        return true;
      }

      return section.citationFeedItemIds.some((feedItemId) => {
        const clusterId = params.clusterByFeedItemId.get(feedItemId);
        return clusterId !== undefined && expectedClusterIds.has(clusterId);
      });
    });
    if (expectation.expectedKind === "lead") {
      totalLead += 1;
      matchedLead += found ? 1 : 0;
    } else {
      totalSecondary += 1;
      matchedSecondary += found ? 1 : 0;
    }
    matched += found ? 1 : 0;
    if (!found) {
      issues.push(
        `Missing ${expectation.expectedKind} narrative for ${expectation.expectedStoryKey}`,
      );
    }
  }

  return {
    matched,
    total: params.expectations.length,
    matchedLead,
    totalLead,
    matchedSecondary,
    totalSecondary,
    issues,
  };
};

const aggregateMetrics = (
  days: readonly ReaderSummaryMultiDayQualityDayResult[],
): ReaderSummaryMultiDayQualityResult["metrics"] => ({
  dayCount: days.length,
  currentGenerationArtifactCount: days.reduce(
    (sum, day) => sum + day.metrics.currentGenerationArtifactCount,
    0,
  ),
  storyPairPrecision: average(
    days.map((day) => day.metrics.storyPairPrecision),
  ),
  storyPairRecall: average(days.map((day) => day.metrics.storyPairRecall)),
  crossSourcePrecision: average(
    days.map((day) => day.metrics.crossSourcePrecision),
  ),
  crossSourceRecall: average(days.map((day) => day.metrics.crossSourceRecall)),
  falseCrossSourceClusterCount: days.reduce(
    (sum, day) => sum + day.metrics.falseCrossSourceClusterCount,
    0,
  ),
  rankingAccuracy: average(days.map((day) => day.metrics.rankingAccuracy)),
  topReadPositiveRecall: average(
    days.map((day) => day.metrics.topReadPositiveRecall),
  ),
  excludedItemRejectionRate: average(
    days.map((day) => day.metrics.excludedItemRejectionRate),
  ),
  narrativeCoverage: average(days.map((day) => day.metrics.narrativeCoverage)),
  leadCoverage: average(days.map((day) => day.metrics.leadCoverage)),
  secondarySignalCoverage: average(
    days.map((day) => day.metrics.secondarySignalCoverage),
  ),
  weakTopReadRate: average(days.map((day) => day.metrics.weakTopReadRate)),
  missingExpectedFeedItemCount: days.reduce(
    (sum, day) => sum + day.metrics.missingExpectedFeedItemCount,
    0,
  ),
});

const emptyMetrics = (): ReaderSummaryMultiDayQualityDayResult["metrics"] => ({
  currentGenerationArtifactCount: 0,
  storyPairPrecision: 0,
  storyPairRecall: 0,
  crossSourcePrecision: 0,
  crossSourceRecall: 0,
  falseCrossSourceClusterCount: 0,
  rankingAccuracy: 0,
  topReadPositiveRecall: 0,
  excludedItemRejectionRate: 0,
  narrativeCoverage: 0,
  leadCoverage: 0,
  secondarySignalCoverage: 0,
  weakTopReadRate: 1,
  missingExpectedFeedItemCount: 0,
});

const groupBy = <T>(
  values: readonly T[],
  key: (value: T) => string,
): ReadonlyMap<string, readonly T[]> => {
  const grouped = new Map<string, T[]>();
  for (const value of values) {
    const groupKey = key(value);
    grouped.set(groupKey, [...(grouped.get(groupKey) ?? []), value]);
  }
  return grouped;
};

const average = (values: readonly number[]): number =>
  ratio(
    values.reduce((sum, value) => sum + value, 0),
    values.length,
  );

const ratio = (value: number, total: number): number =>
  total === 0 ? 1 : Math.round((value / total) * 1000) / 1000;
