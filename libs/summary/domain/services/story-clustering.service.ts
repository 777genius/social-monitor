import type { Clock } from "@social-monitor/shared-kernel";

import type {
  SummaryEvidenceItem,
  SummaryEvidenceSelection,
  SummarySourceWindow,
  StoryCluster,
} from "../value-objects/summary-evidence-item";
import {
  readerSummaryScopeKey,
  type ReaderSummaryScopeIdentity,
} from "../value-objects/reader-summary-scope";
import {
  STORY_RANKING_POLICY_V1,
  type StoryRankingPolicy,
} from "../policies/story-ranking-policy";
import { compareRepresentativeEvidenceItems } from "../policies/representative-evidence-selection-policy";
import {
  belongsToCrossProviderCluster,
  hasCrossProviderClaimFacetConflict,
} from "./story-cluster-membership";
import { storyKey } from "./story-key-normalizer";

export class StoryClusteringService {
  constructor(
    private readonly clock: Clock,
    private readonly policy: StoryRankingPolicy = STORY_RANKING_POLICY_V1,
  ) {}

  cluster(params: {
    readonly identity: ReaderSummaryScopeIdentity;
    readonly items: readonly SummaryEvidenceItem[];
    readonly limit: number;
  }): SummaryEvidenceSelection {
    const limit = normalizeLimit(params.limit, this.policy);
    const clusters = [
      ...buildClusters(params.items, this.clock.now(), this.policy),
    ]
      .sort(compareStoryClusters)
      .slice(0, limit);
    const selectedEvidence = selectedClusterEvidence(
      params.items,
      clusters,
      this.policy,
    );

    return {
      rankingPolicyVersion: this.policy.version,
      sourceWindow: buildSourceWindow(
        params.identity,
        clusters,
        selectedEvidence,
        this.clock,
      ),
      clusters,
      selectedEvidence,
    };
  }
}

const buildClusters = (
  items: readonly SummaryEvidenceItem[],
  now: Date,
  policy: StoryRankingPolicy,
): readonly StoryCluster[] => {
  const groups: {
    readonly key: string;
    readonly items: SummaryEvidenceItem[];
  }[] = [];

  for (const item of items) {
    const key = storyKey(item, policy);
    const group = groups.find(
      (candidate) =>
        (candidate.key === key &&
          !hasCrossProviderClaimFacetConflict(item, candidate.items, policy)) ||
        belongsToCrossProviderCluster(item, candidate.items, policy),
    );

    if (group === undefined) {
      groups.push({ key, items: [item] });
    } else {
      group.items.push(item);
    }
  }

  return groups.map((group) => {
    const key = group.key;
    const clusterItems = group.items;
    const sorted = [...clusterItems].sort(compareRepresentativeEvidenceItems);
    const representative = sorted[0];
    if (representative === undefined) {
      throw new Error("Reader summary story cluster must contain evidence");
    }
    const observedTimes = sorted.map((item) => item.observedAt.getTime());
    const signal = storyClusterSignal(clusterItems, now, policy);

    return {
      id: `story:${key}`,
      storyKey: key,
      rankingPolicyVersion: policy.version,
      representativeFeedItemId: representative.feedItemId,
      duplicateFeedItemIds: sorted.slice(1).map((item) => item.feedItemId),
      interestIds: uniqueSorted(sorted.map((item) => item.interestId)),
      providerKeys: uniqueSorted(sorted.map((item) => item.providerKey)),
      score: signal.score,
      signalBreakdown: signal.breakdown,
      observedAtRange: {
        startedAt: new Date(Math.min(...observedTimes)),
        endedAt: new Date(Math.max(...observedTimes) + 1),
      },
      whyImportant: uniqueStable([
        ...signal.reasons,
        ...sorted.flatMap((item) =>
          item.whyImportant.filter(isUserFacingStoryReason),
        ),
      ]),
    } satisfies StoryCluster;
  });
};

const isUserFacingStoryReason = (value: string): boolean => {
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();

  return (
    trimmed.length > 0 &&
    !lower.startsWith("selected to preserve ") &&
    !lower.startsWith("unsafe source instructions were sandboxed") &&
    !lower.includes("provider coverage in the reader summary")
  );
};

const selectedClusterEvidence = (
  items: readonly SummaryEvidenceItem[],
  clusters: readonly StoryCluster[],
  policy: StoryRankingPolicy,
): readonly SummaryEvidenceItem[] => {
  const byId = new Map(items.map((item) => [item.feedItemId, item] as const));
  const selected: SummaryEvidenceItem[] = [];
  const selectedIds = new Set<string>();

  for (const cluster of clusters) {
    const ids = selectedClusterEvidenceIds(cluster, byId, policy);

    for (const id of ids) {
      const item = byId.get(id);
      if (item === undefined || selectedIds.has(id)) {
        continue;
      }
      selected.push(item);
      selectedIds.add(id);
    }
  }

  return selected;
};

const selectedClusterEvidenceIds = (
  cluster: StoryCluster,
  evidenceById: ReadonlyMap<string, SummaryEvidenceItem>,
  policy: StoryRankingPolicy,
): readonly string[] => {
  const limit = Math.max(1, policy.maxSelectedEvidencePerCluster);
  const clusterItems = [
    cluster.representativeFeedItemId,
    ...cluster.duplicateFeedItemIds,
  ]
    .map((id) => evidenceById.get(id))
    .filter((item): item is SummaryEvidenceItem => item !== undefined);
  const selected: string[] = [];
  const selectedIds = new Set<string>();
  const selectedProviders = new Set<string>();

  const select = (item: SummaryEvidenceItem): void => {
    if (selected.length >= limit || selectedIds.has(item.feedItemId)) {
      return;
    }
    selected.push(item.feedItemId);
    selectedIds.add(item.feedItemId);
    selectedProviders.add(item.providerKey);
  };

  const representative = evidenceById.get(cluster.representativeFeedItemId);
  if (representative !== undefined) {
    select(representative);
  }

  for (const item of clusterItems) {
    if (selected.length >= limit) {
      break;
    }
    if (selectedProviders.has(item.providerKey)) {
      continue;
    }
    select(item);
  }

  for (const item of clusterItems) {
    if (selected.length >= limit) {
      break;
    }
    select(item);
  }

  return selected;
};

const storyClusterSignal = (
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
    return {
      score: 0,
      breakdown: zeroSignalBreakdown(),
      reasons: [],
    };
  }

  const providerKeys = uniqueSorted(sorted.map((item) => item.providerKey));
  const interestIds = uniqueSorted(sorted.map((item) => item.interestId));
  const strongestByProvider = new Map<string, number>();

  for (const item of sorted) {
    const current = strongestByProvider.get(item.providerKey) ?? 0;
    strongestByProvider.set(item.providerKey, Math.max(current, item.score));
  }

  const otherProviderSupport = [...strongestByProvider.entries()]
    .filter(([providerKey]) => providerKey !== signalLeader.providerKey)
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
    sorted.filter((item) => item.providerKey === signalLeader.providerKey)
      .length - 1;
  const sameProviderSupport = Math.min(
    policy.sameProviderSupportCap,
    Math.log1p(Math.max(0, sameProviderDuplicateCount)) *
      policy.sameProviderDuplicateWeight,
  );
  const providerDiversityBoost = Math.min(
    policy.providerDiversityCap,
    (providerKeys.length - 1) * policy.providerDiversityWeight,
  );
  const interestDiversityBoost = Math.min(
    policy.interestDiversityCap,
    (interestIds.length - 1) * policy.interestDiversityWeight,
  );
  const freshnessBoost = freshnessBoostFor(
    signalLeader.observedAt,
    now,
    policy,
  );
  const breakdown = {
    baseScore: roundScore(signalLeader.score),
    crossProviderSupport: roundScore(otherProviderSupport),
    sameProviderSupport: roundScore(sameProviderSupport),
    providerDiversityBoost: roundScore(providerDiversityBoost),
    interestDiversityBoost: roundScore(interestDiversityBoost),
    freshnessBoost: roundScore(freshnessBoost),
    totalScore: 0,
  };
  const score = roundScore(
    Object.values({
      baseScore: breakdown.baseScore,
      crossProviderSupport: breakdown.crossProviderSupport,
      sameProviderSupport: breakdown.sameProviderSupport,
      providerDiversityBoost: breakdown.providerDiversityBoost,
      interestDiversityBoost: breakdown.interestDiversityBoost,
      freshnessBoost: breakdown.freshnessBoost,
    }).reduce((total, value) => total + value, 0),
  );
  const completeBreakdown = { ...breakdown, totalScore: score };

  return {
    score,
    breakdown: completeBreakdown,
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

const buildSourceWindow = (
  identity: ReaderSummaryScopeIdentity,
  clusters: readonly StoryCluster[],
  selectedEvidence: readonly SummaryEvidenceItem[],
  clock: Clock,
): SummarySourceWindow => {
  if (clusters.length === 0 || selectedEvidence.length === 0) {
    const endedAt = clock.now();
    const startedAt = new Date(endedAt.getTime() - 1);

    return {
      windowId: `${identity.tenantId}:${identity.workspaceId}:${readerSummaryScopeKey(identity.scope)}:empty`,
      startedAt,
      endedAt,
      selectedFeedItemIds: [],
      storyClusterIds: [],
    };
  }

  const publishedTimes = selectedEvidence.map((item) =>
    item.publishedAt.getTime(),
  );
  const startedAt = new Date(Math.min(...publishedTimes));
  const endedAtValue = Math.max(...publishedTimes);
  const endedAt = new Date(
    endedAtValue > startedAt.getTime() ? endedAtValue : endedAtValue + 1,
  );

  return {
    windowId: [
      identity.tenantId,
      identity.workspaceId,
      readerSummaryScopeKey(identity.scope),
      startedAt.toISOString(),
      endedAt.toISOString(),
    ].join(":"),
    startedAt,
    endedAt,
    selectedFeedItemIds: selectedEvidence.map((item) => item.feedItemId),
    storyClusterIds: clusters.map((cluster) => cluster.id),
  };
};

const compareSignalEvidenceItems = (
  left: SummaryEvidenceItem,
  right: SummaryEvidenceItem,
): number => {
  const scoreDiff = right.score - left.score;
  if (scoreDiff !== 0) {
    return scoreDiff;
  }

  return right.observedAt.getTime() - left.observedAt.getTime();
};

const compareStoryClusters = (
  left: StoryCluster,
  right: StoryCluster,
): number => {
  const scoreDiff = right.score - left.score;
  if (scoreDiff !== 0) {
    return scoreDiff;
  }

  const providerCoverageDiff =
    right.providerKeys.length - left.providerKeys.length;
  if (providerCoverageDiff !== 0) {
    return providerCoverageDiff;
  }

  const interestCoverageDiff =
    right.interestIds.length - left.interestIds.length;
  if (interestCoverageDiff !== 0) {
    return interestCoverageDiff;
  }

  return (
    right.observedAtRange.endedAt.getTime() -
    left.observedAtRange.endedAt.getTime()
  );
};

const uniqueSorted = (values: readonly string[]): readonly string[] =>
  [...new Set(values)].sort();

const uniqueStable = (values: readonly string[]): readonly string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }

  return result;
};

const normalizeLimit = (value: number, policy: StoryRankingPolicy): number => {
  if (!Number.isInteger(value) || value < 1) {
    return 1;
  }

  return Math.min(value, policy.maxClusters);
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

const freshnessBoostFor = (
  observedAt: Date,
  now: Date,
  policy: StoryRankingPolicy,
): number => {
  const ageHours = Math.max(
    0,
    (now.getTime() - observedAt.getTime()) / 3_600_000,
  );

  const boost = policy.freshnessBoosts.find(
    (candidate) => ageHours <= candidate.maxAgeHours,
  );

  return boost?.boost ?? 0;
};

const roundScore = (value: number): number => Math.round(value * 1000) / 1000;

const formatScore = (value: number): string =>
  Number.isInteger(value)
    ? String(value)
    : value.toFixed(3).replace(/0+$/u, "").replace(/\.$/u, "");
