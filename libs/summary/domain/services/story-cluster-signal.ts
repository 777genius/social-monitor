import type { StoryRankingPolicy } from "../policies/story-ranking-policy";
import {
  independentEvidenceItems,
  independentEvidenceProviderKeys,
  readerSummaryProviderIdentity,
} from "../value-objects/reader-summary-provider-identity";
import type {
  StoryCluster,
  SummaryEvidenceItem,
} from "../value-objects/summary-evidence-item";

export const storyClusterSignal = (
  items: readonly SummaryEvidenceItem[],
  now: Date,
  policy: StoryRankingPolicy,
): {
  readonly score: number;
  readonly breakdown: StoryCluster["signalBreakdown"];
  readonly reasons: readonly string[];
} => {
  const sorted = [...items].sort(compareSignalEvidenceItems);
  const signalLeader = sorted[0];
  if (signalLeader === undefined) {
    return { score: 0, breakdown: zeroSignalBreakdown(), reasons: [] };
  }

  const independentEvidence = independentEvidenceItems(sorted);
  const providerKeys = independentEvidenceProviderKeys(independentEvidence);
  const interestIds = uniqueSorted(sorted.map((item) => item.interestId));
  const strongestByProvider = new Map<string, number>();

  for (const item of independentEvidence) {
    const providerKey = readerSummaryProviderIdentity(item).providerKey;
    const current = strongestByProvider.get(providerKey) ?? 0;
    strongestByProvider.set(providerKey, Math.max(current, item.score));
  }

  const signalLeaderProviderKey =
    readerSummaryProviderIdentity(signalLeader).providerKey;
  const otherProviderSupport = [...strongestByProvider.entries()]
    .filter(([providerKey]) => providerKey !== signalLeaderProviderKey)
    .map(([, score]) => Math.max(0, score))
    .sort((left, right) => right - left)
    .slice(0, policy.maxCrossProviderEvidence)
    .reduce(
      (total, score) =>
        total +
        Math.min(
          policy.crossProviderContributionCap,
          score * policy.crossProviderScoreWeight,
        ),
      0,
    );
  const sameProviderDuplicateCount =
    independentEvidence.filter(
      (item) =>
        readerSummaryProviderIdentity(item).providerKey ===
        signalLeaderProviderKey,
    ).length - 1;
  const sameProviderSupport = Math.min(
    policy.sameProviderSupportCap,
    Math.log1p(Math.max(0, sameProviderDuplicateCount)) *
      policy.sameProviderDuplicateWeight,
  );
  const breakdown = {
    baseScore: roundScore(signalLeader.score),
    crossProviderSupport: roundScore(otherProviderSupport),
    sameProviderSupport: roundScore(sameProviderSupport),
    providerDiversityBoost: roundScore(
      Math.min(
        policy.providerDiversityCap,
        (providerKeys.length - 1) * policy.providerDiversityWeight,
      ),
    ),
    interestDiversityBoost: roundScore(
      Math.min(
        policy.interestDiversityCap,
        (interestIds.length - 1) * policy.interestDiversityWeight,
      ),
    ),
    freshnessBoost: roundScore(
      freshnessBoostFor(signalLeader.observedAt, now, policy),
    ),
    totalScore: 0,
  };
  const score = roundScore(
    breakdown.baseScore +
      breakdown.crossProviderSupport +
      breakdown.sameProviderSupport +
      breakdown.providerDiversityBoost +
      breakdown.interestDiversityBoost +
      breakdown.freshnessBoost,
  );

  return {
    score,
    breakdown: { ...breakdown, totalScore: score },
    reasons: storyClusterReasons({
      providerKeys,
      interestIds,
      evidenceCount: sorted.length,
      score,
    }),
  };
};

const storyClusterReasons = (params: {
  readonly providerKeys: readonly string[];
  readonly interestIds: readonly string[];
  readonly evidenceCount: number;
  readonly score: number;
}): readonly string[] => {
  const reasons: string[] = [];
  if (params.providerKeys.length > 1) {
    reasons.push(
      `Confirmed by ${params.providerKeys.length} source groups: ${params.providerKeys.slice(0, 3).join(", ")}`,
    );
  }
  if (params.evidenceCount > 1) {
    reasons.push(`Clustered ${params.evidenceCount} related source items`);
  }
  if (params.interestIds.length > 1) {
    reasons.push(
      `Appears across ${params.interestIds.length} monitored interests`,
    );
  }
  reasons.push(`Story signal score ${formatScore(params.score)}`);

  return reasons;
};

const compareSignalEvidenceItems = (
  left: SummaryEvidenceItem,
  right: SummaryEvidenceItem,
): number =>
  right.score - left.score ||
  right.observedAt.getTime() - left.observedAt.getTime();

const freshnessBoostFor = (
  observedAt: Date,
  now: Date,
  policy: StoryRankingPolicy,
): number => {
  const ageHours = Math.max(
    0,
    (now.getTime() - observedAt.getTime()) / 3_600_000,
  );

  return (
    policy.freshnessBoosts.find(
      (candidate) => ageHours <= candidate.maxAgeHours,
    )?.boost ?? 0
  );
};

const zeroSignalBreakdown = (): NonNullable<
  StoryCluster["signalBreakdown"]
> => ({
  baseScore: 0,
  crossProviderSupport: 0,
  sameProviderSupport: 0,
  providerDiversityBoost: 0,
  interestDiversityBoost: 0,
  freshnessBoost: 0,
  totalScore: 0,
});

const uniqueSorted = (values: readonly string[]): readonly string[] =>
  [...new Set(values)].sort();

const roundScore = (value: number): number => Math.round(value * 1000) / 1000;

const formatScore = (value: number): string =>
  Number.isInteger(value)
    ? String(value)
    : value.toFixed(3).replace(/0+$/u, "").replace(/\.$/u, "");
