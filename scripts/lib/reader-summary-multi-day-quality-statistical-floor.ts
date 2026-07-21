import type { ReaderSummaryMultiDayQualityThresholds } from "@social-monitor/summary/domain";

type GoldDayShape = {
  readonly storyExpectations: readonly Record<string, unknown>[];
  readonly crossSourceExpectations: readonly Record<string, unknown>[];
  readonly rankingExpectations: readonly Record<string, unknown>[];
  readonly narrativeExpectations: readonly Record<string, unknown>[];
};

export function assertReaderSummaryMultiDayGoldStatisticalFloor(params: {
  readonly days: readonly unknown[];
  readonly thresholds: ReaderSummaryMultiDayQualityThresholds;
  readonly label: string;
}): void {
  const { days, thresholds, label } = params;
  if (
    days.length < 5 ||
    thresholds.minimumDayCount < 5 ||
    thresholds.minimumDayCount > days.length
  ) {
    throw new Error(`${label} does not meet the five-day statistical floor`);
  }
  if (
    thresholds.minimumStoryPairPrecision < 0.8 ||
    thresholds.minimumStoryPairRecall < 0.7 ||
    thresholds.minimumCrossSourcePrecision < 0.8 ||
    thresholds.minimumCrossSourceRecall < 0.6 ||
    thresholds.minimumRankingAccuracy < 0.7 ||
    thresholds.minimumNarrativeCoverage < 0.7 ||
    thresholds.maximumWeakTopReadRate > 0.6
  ) {
    throw new Error(`${label} contains nonblocking quality thresholds`);
  }
  for (const value of days) {
    assertMeaningfulReviewedDay(asGoldDayShape(value, label), label);
  }
}

function assertMeaningfulReviewedDay(day: GoldDayShape, label: string): void {
  const providers = new Set(
    day.storyExpectations.map((item) => String(item.providerKey)),
  );
  const storyMembers = new Map<string, Record<string, unknown>[]>();
  for (const item of day.storyExpectations) {
    const storyKey = String(item.expectedStoryKey);
    storyMembers.set(storyKey, [...(storyMembers.get(storyKey) ?? []), item]);
  }
  const positiveStoryGroupCount = [...storyMembers.values()].filter(
    (items) => items.length >= 2,
  ).length;
  const trueCrossSource = day.crossSourceExpectations.filter(
    (item) => item.expected === true,
  );
  const falseCrossSource = day.crossSourceExpectations.filter(
    (item) => item.expected === false,
  );
  const crossSourceHasDistinctProviders = trueCrossSource.every((item) => {
    const members = storyMembers.get(String(item.expectedStoryKey)) ?? [];
    return (
      new Set(members.map((member) => String(member.providerKey))).size >= 2
    );
  });
  const topReads = day.rankingExpectations.filter(
    (item) => item.expected === "top_read",
  );
  const excludedCount = day.rankingExpectations.filter(
    (item) => item.expected === "exclude",
  ).length;
  const orderedRanks = topReads.map((item) => Number(item.expectedRank));
  const uniqueOrderedRanks = [...new Set(orderedRanks)].sort(
    (left, right) => left - right,
  );
  const hasContiguousRanks =
    orderedRanks.length === topReads.length &&
    orderedRanks.every((rank) => Number.isSafeInteger(rank) && rank >= 1) &&
    uniqueOrderedRanks.length >= 2 &&
    uniqueOrderedRanks.every((rank, index) => rank === index + 1);
  const leadCount = day.narrativeExpectations.filter(
    (item) => item.expectedKind === "lead",
  ).length;
  const secondaryCount = day.narrativeExpectations.filter(
    (item) => item.expectedKind === "secondary_signal",
  ).length;

  if (
    day.storyExpectations.length < 6 ||
    providers.size < 3 ||
    positiveStoryGroupCount < 1 ||
    trueCrossSource.length < 1 ||
    falseCrossSource.length < 1 ||
    !crossSourceHasDistinctProviders ||
    topReads.length < 2 ||
    excludedCount < 2 ||
    !hasContiguousRanks ||
    leadCount < 1 ||
    secondaryCount < 1
  ) {
    throw new Error(
      `${label} has a statistically vacuous reviewed day; each day requires at least six items, three providers, a positive same-story pair, true and false cross-source cases, two ordered top reads, two exclusions, a lead, and a secondary narrative`,
    );
  }
}

function asGoldDayShape(value: unknown, label: string): GoldDayShape {
  if (
    !isRecord(value) ||
    !Array.isArray(value.storyExpectations) ||
    !Array.isArray(value.crossSourceExpectations) ||
    !Array.isArray(value.rankingExpectations) ||
    !Array.isArray(value.narrativeExpectations)
  ) {
    throw new Error(`${label} contains an invalid gold day`);
  }
  return value as GoldDayShape;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
