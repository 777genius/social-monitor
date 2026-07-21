import type {
  ReaderSummaryMultiDayActualDay,
  ReaderSummaryMultiDayGoldDay,
  ReaderSummaryMultiDayQualityDayResult,
  ReaderSummaryMultiDayQualityResult,
  ReaderSummaryMultiDayQualityThresholds,
} from "./reader-summary-multi-day-quality-eval";

export const storyPairCounts = (
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

export const crossSourceCounts = (params: {
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
    const predictedCluster = params.clusterById.get(
      [...predictedClusters][0] ?? "",
    );
    const predictedCrossSource =
      predictedClusters.size === 1 &&
      new Set(predictedCluster?.providerKeys ?? []).size > 1;
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

export const narrativeCounts = (params: {
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

export const aggregateMetrics = (
  days: readonly ReaderSummaryMultiDayQualityDayResult[],
  dayCount: number,
  goldDayCount: number,
): ReaderSummaryMultiDayQualityResult["metrics"] => ({
  dayCount,
  goldDayCount,
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
  orderedRankingCorrectCount: days.reduce(
    (sum, day) => sum + day.metrics.orderedRankingCorrectCount,
    0,
  ),
  orderedRankingExpectationCount: days.reduce(
    (sum, day) => sum + day.metrics.orderedRankingExpectationCount,
    0,
  ),
  orderedRankingAccuracy: ratio(
    days.reduce((sum, day) => sum + day.metrics.orderedRankingCorrectCount, 0),
    days.reduce(
      (sum, day) => sum + day.metrics.orderedRankingExpectationCount,
      0,
    ),
  ),
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

export const emptyMetrics = (
  orderedRankingExpectationCount: number,
  missingExpectedFeedItemCount: number,
): ReaderSummaryMultiDayQualityDayResult["metrics"] => ({
  currentGenerationArtifactCount: 0,
  storyPairPrecision: 0,
  storyPairRecall: 0,
  crossSourcePrecision: 0,
  crossSourceRecall: 0,
  falseCrossSourceClusterCount: 0,
  rankingAccuracy: 0,
  orderedRankingCorrectCount: 0,
  orderedRankingExpectationCount,
  orderedRankingAccuracy: orderedRankingExpectationCount > 0 ? 0 : 1,
  topReadPositiveRecall: 0,
  excludedItemRejectionRate: 0,
  narrativeCoverage: 0,
  leadCoverage: 0,
  secondarySignalCoverage: 0,
  weakTopReadRate: 1,
  missingExpectedFeedItemCount,
});

export const allDaysMeetCatastrophicQualityFloor = (
  days: readonly ReaderSummaryMultiDayQualityDayResult[],
  thresholds: ReaderSummaryMultiDayQualityThresholds,
): boolean => {
  const storyPairPrecisionFloor = catastrophicMinimumFloor(
    thresholds.minimumStoryPairPrecision,
  );
  const storyPairRecallFloor = catastrophicMinimumFloor(
    thresholds.minimumStoryPairRecall,
  );
  const crossSourcePrecisionFloor = catastrophicMinimumFloor(
    thresholds.minimumCrossSourcePrecision,
  );
  const crossSourceRecallFloor = catastrophicMinimumFloor(
    thresholds.minimumCrossSourceRecall,
  );
  const rankingFloor = catastrophicMinimumFloor(
    thresholds.minimumRankingAccuracy,
  );
  const narrativeFloor = catastrophicMinimumFloor(
    thresholds.minimumNarrativeCoverage,
  );
  const weakTopReadCeiling = catastrophicMaximumCeiling(
    thresholds.maximumWeakTopReadRate,
  );

  return days.every(
    (day) =>
      day.metrics.storyPairPrecision >= storyPairPrecisionFloor &&
      day.metrics.storyPairRecall >= storyPairRecallFloor &&
      day.metrics.crossSourcePrecision >= crossSourcePrecisionFloor &&
      day.metrics.crossSourceRecall >= crossSourceRecallFloor &&
      day.metrics.rankingAccuracy >= rankingFloor &&
      day.metrics.orderedRankingAccuracy >= rankingFloor &&
      day.metrics.topReadPositiveRecall >= rankingFloor &&
      day.metrics.excludedItemRejectionRate >= rankingFloor &&
      day.metrics.narrativeCoverage >= narrativeFloor &&
      day.metrics.leadCoverage >= narrativeFloor &&
      day.metrics.secondarySignalCoverage >= narrativeFloor &&
      day.metrics.weakTopReadRate <= weakTopReadCeiling,
  );
};

// One day may consume at most one additional configured error budget beyond
// the aggregate target. For example, a 0.8 minimum yields a 0.6 daily floor.
const catastrophicMinimumFloor = (minimum: number): number =>
  Math.max(0, 2 * minimum - 1);

// Weak-rate targets use zero as perfection, so the same policy doubles the
// configured error budget. For example, a 0.2 maximum yields a 0.4 ceiling.
const catastrophicMaximumCeiling = (maximum: number): number =>
  Math.min(1, 2 * maximum);

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

export const ratio = (value: number, total: number): number =>
  total === 0 ? 1 : Math.round((value / total) * 1000) / 1000;
