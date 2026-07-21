import type { ReaderSummaryNarrativeSectionKind } from "../entities/reader-summary-narrative-section";
import {
  matchesReaderSummaryMultiDayGenerationProfile,
  readerSummaryMultiDayGenerationProfileMismatch,
  type ReaderSummaryMultiDayGenerationProfile,
} from "./reader-summary-multi-day-generation-profile";
import { assertValidReaderSummaryMultiDayQualityInputs } from "./reader-summary-multi-day-quality-input-validation";
import {
  aggregateMetrics,
  allDaysMeetCatastrophicQualityFloor,
  crossSourceCounts,
  emptyMetrics,
  narrativeCounts,
  ratio,
  storyPairCounts,
} from "./reader-summary-multi-day-quality-metrics";

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
  readonly rankingExpectations: readonly ReaderSummaryMultiDayRankingExpectation[];
  readonly narrativeExpectations: readonly {
    readonly expectedStoryKey: string;
    readonly expectedKind: "lead" | "secondary_signal";
  }[];
};

export type ReaderSummaryMultiDayRankingExpectation =
  | {
      readonly feedItemId: string;
      readonly expected: "top_read";
      readonly expectedRank?: number;
    }
  | {
      readonly feedItemId: string;
      readonly expected: "exclude";
      readonly expectedRank?: never;
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
  readonly topReadEntries: readonly ReaderSummaryMultiDayTopReadEntry[];
  readonly narrativeSections: readonly {
    readonly kind: ReaderSummaryNarrativeSectionKind;
    readonly storyClusterId?: string;
    readonly citationFeedItemIds: readonly string[];
  }[];
};

export type ReaderSummaryMultiDayTopReadEntry = {
  readonly citationFeedItemIds: readonly string[];
  readonly qualityEligible: boolean;
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
    readonly goldDayCount: number;
    readonly currentGenerationArtifactCount: number;
    readonly storyPairPrecision: number;
    readonly storyPairRecall: number;
    readonly crossSourcePrecision: number;
    readonly crossSourceRecall: number;
    readonly falseCrossSourceClusterCount: number;
    readonly rankingAccuracy: number;
    readonly orderedRankingCorrectCount: number;
    readonly orderedRankingExpectationCount: number;
    readonly orderedRankingAccuracy: number;
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
    "dayCount" | "goldDayCount"
  >;
  readonly issues: readonly string[];
};

export const evaluateReaderSummaryMultiDayQuality = (params: {
  readonly actualDays: readonly ReaderSummaryMultiDayActualDay[];
  readonly goldDays: readonly ReaderSummaryMultiDayGoldDay[];
  readonly thresholds: ReaderSummaryMultiDayQualityThresholds;
  readonly expectedGenerationProfile: ReaderSummaryMultiDayGenerationProfile;
}): ReaderSummaryMultiDayQualityResult => {
  assertValidReaderSummaryMultiDayQualityInputs(
    params.actualDays,
    params.goldDays,
  );
  const actualByDate = new Map(
    params.actualDays.map((day) => [day.collectionDate, day] as const),
  );
  const goldDates = new Set(params.goldDays.map((day) => day.collectionDate));
  const days = params.goldDays.map((gold) =>
    evaluateDay(
      gold,
      actualByDate.get(gold.collectionDate),
      params.expectedGenerationProfile,
    ),
  );
  const aggregate = aggregateMetrics(
    days,
    [...goldDates].filter((collectionDate) => actualByDate.has(collectionDate))
      .length,
    goldDates.size,
  );
  const qualityGates = {
    minimumRealDayCount:
      aggregate.dayCount >= params.thresholds.minimumDayCount,
    allGoldDaysPersisted: aggregate.dayCount === aggregate.goldDayCount,
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
    orderedRankingAccuracy:
      aggregate.orderedRankingAccuracy >=
      params.thresholds.minimumRankingAccuracy,
    narrativeCoverage:
      aggregate.narrativeCoverage >= params.thresholds.minimumNarrativeCoverage,
    leadCoverage:
      aggregate.leadCoverage >= params.thresholds.minimumNarrativeCoverage,
    secondarySignalCoverage:
      aggregate.secondarySignalCoverage >=
      params.thresholds.minimumNarrativeCoverage,
    weakTopReadRate:
      aggregate.weakTopReadRate <= params.thresholds.maximumWeakTopReadRate,
    allDaysMeetCatastrophicQualityFloor: allDaysMeetCatastrophicQualityFloor(
      days,
      params.thresholds,
    ),
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
      metrics: emptyMetrics(
        gold.rankingExpectations.filter(
          (expectation) => expectation.expectedRank !== undefined,
        ).length,
        gold.storyExpectations.length,
      ),
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
  const topReadIds = new Set(
    actual.topReadEntries.flatMap((entry) => entry.citationFeedItemIds),
  );
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
  const orderedRanking = orderedRankingCounts(
    gold.rankingExpectations,
    actual.topReadEntries,
  );
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
  const weakTopReadCount = actual.topReadEntries.filter(
    (entry) => !entry.qualityEligible,
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
    ...orderedRanking.issues,
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
      orderedRankingCorrectCount: orderedRanking.correct,
      orderedRankingExpectationCount: orderedRanking.total,
      orderedRankingAccuracy: ratio(
        orderedRanking.correct,
        orderedRanking.total,
      ),
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
      weakTopReadRate: ratio(weakTopReadCount, actual.topReadEntries.length),
      missingExpectedFeedItemCount: missingExpectedFeedItemIds.length,
    },
    issues,
  };
};

const orderedRankingCounts = (
  expectations: ReaderSummaryMultiDayGoldDay["rankingExpectations"],
  actualTopReadEntries: readonly ReaderSummaryMultiDayTopReadEntry[],
) => {
  const actualRankByFeedItemId = new Map(
    actualTopReadEntries.flatMap((entry, index) =>
      entry.citationFeedItemIds.map(
        (feedItemId) => [feedItemId, index + 1] as const,
      ),
    ),
  );
  const orderedExpectations = expectations.filter(
    (
      expectation,
    ): expectation is Extract<
      ReaderSummaryMultiDayRankingExpectation,
      { readonly expected: "top_read" }
    > & { readonly expectedRank: number } =>
      expectation.expected === "top_read" &&
      expectation.expectedRank !== undefined,
  );
  let correct = 0;
  const issues: string[] = [];
  for (const expectation of orderedExpectations) {
    const expectedRankIsValid =
      Number.isSafeInteger(expectation.expectedRank) &&
      expectation.expectedRank >= 1;
    const actualRank = actualRankByFeedItemId.get(expectation.feedItemId);
    if (expectedRankIsValid && actualRank === expectation.expectedRank) {
      correct += 1;
      continue;
    }
    issues.push(
      expectedRankIsValid
        ? `Ranking order mismatch for ${expectation.feedItemId}: expected rank ${expectation.expectedRank}, actual ${actualRank ?? "missing"}`
        : `Invalid expected rank for ${expectation.feedItemId}: ${expectation.expectedRank}`,
    );
  }

  return { correct, total: orderedExpectations.length, issues };
};
