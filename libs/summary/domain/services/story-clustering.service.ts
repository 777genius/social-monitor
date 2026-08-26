import type { Clock } from "@social-monitor/shared-kernel";

import type {
  SummaryEvidenceItem,
  SummaryEvidenceSelection,
  SummarySourceWindow,
  StoryCluster,
} from "../value-objects/summary-evidence-item";
import { readerSummaryIndependentProviderFamily,
  readerSummaryIndependentProviderFamilyCount } from
  "../value-objects/reader-summary-provider-identity";
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
  belongsToVerifiedStoryCluster,
  hasCrossProviderClaimFacetConflict,
} from "./story-cluster-membership";
import { storyRelationHardNegative } from "./story-relation-hard-negative";
import { storyKey } from "./story-key-normalizer";
import { storyClusterSignal } from "./story-cluster-signal";

export class StoryClusteringService {
  constructor(
    private readonly clock: Clock,
    private readonly policy: StoryRankingPolicy = STORY_RANKING_POLICY_V1,
  ) {}

  cluster(params: {
    readonly identity: ReaderSummaryScopeIdentity;
    readonly items: readonly SummaryEvidenceItem[];
    readonly limit: number;
    readonly verifiedStoryRelationPairs?: ReadonlySet<string>;
    readonly now?: Date;
  }): SummaryEvidenceSelection {
    const limit = normalizeLimit(params.limit, this.policy);
    const now = new Date((params.now ?? this.clock.now()).getTime());
    const clusters = [
      ...buildClusters(
        params.items,
        now,
        this.policy,
        params.verifiedStoryRelationPairs,
      ),
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
        now,
      ),
      clusters,
      selectedEvidence,
    };
  }
}

export const rebuildStoryClustersForPromotionAdmission = (params: {
  readonly items: readonly SummaryEvidenceItem[];
  readonly verifiedStoryRelationPairs: ReadonlySet<string>;
  readonly now: Date;
  readonly policy?: StoryRankingPolicy;
}): readonly StoryCluster[] => [...buildClusters(
  params.items,
  new Date(params.now.getTime()),
  params.policy ?? STORY_RANKING_POLICY_V1,
  params.verifiedStoryRelationPairs,
)].sort(compareStoryClusters);

const buildClusters = (
  items: readonly SummaryEvidenceItem[],
  now: Date,
  policy: StoryRankingPolicy,
  verifiedStoryRelationPairs: ReadonlySet<string> | undefined,
): readonly StoryCluster[] => {
  const baseGroups: {
    readonly key: string;
    readonly items: SummaryEvidenceItem[];
  }[] = [];

  for (const item of [...items].sort((left, right) =>
    left.feedItemId.localeCompare(right.feedItemId))) {
    const key = storyKey(item, policy);
    const group = baseGroups.find(
      (candidate) =>
        (candidate.key === key &&
          !hasCrossProviderClaimFacetConflict(item, candidate.items, policy)) ||
        belongsToVerifiedStoryCluster(
          item,
          candidate.items,
          policy,
        ),
    );

    if (group === undefined) {
      baseGroups.push({ key, items: [item] });
    } else {
      group.items.push(item);
    }
  }

  const groups = modelAssistedGroups(baseGroups, verifiedStoryRelationPairs,
    policy);

  return groups.map((group) => {
    const clusterItems = group.items;
    const sorted = [...clusterItems].sort(compareRepresentativeEvidenceItems);
    const representative = sorted[0];
    if (representative === undefined) {
      throw new Error("Reader summary story cluster must contain evidence");
    }
    const key = storyKey(representative, policy);
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

type BaseStoryGroup = Readonly<{
  key: string;
  items: readonly SummaryEvidenceItem[];
}>;

const modelAssistedGroups = (
  baseGroups: readonly BaseStoryGroup[],
  verifiedPairs: ReadonlySet<string> | undefined,
  policy: StoryRankingPolicy,
): readonly BaseStoryGroup[] => {
  if (verifiedPairs === undefined || verifiedPairs.size === 0) return baseGroups;
  const baseByItem = new Map<string, number>();
  baseGroups.forEach((group, index) => group.items.forEach((item) =>
    baseByItem.set(item.feedItemId, index)));
  const attestedBasePairs = new Set<string>();
  for (const pair of verifiedPairs) {
    const [leftId, rightId] = pair.split("\u0000");
    if (leftId === undefined || rightId === undefined) continue;
    const leftBase = baseByItem.get(leftId);
    const rightBase = baseByItem.get(rightId);
    if (leftBase === undefined || rightBase === undefined || leftBase === rightBase) continue;
    attestedBasePairs.add(basePairId(leftBase, rightBase));
  }
  const components = baseGroups.map((_group, index) => [index]);
  for (const edge of [...attestedBasePairs].sort()) {
    const [leftRaw, rightRaw] = edge.split(":");
    const left = Number(leftRaw);
    const right = Number(rightRaw);
    const leftComponentIndex = components.findIndex((value) => value.includes(left));
    const rightComponentIndex = components.findIndex((value) => value.includes(right));
    if (leftComponentIndex < 0 || rightComponentIndex < 0 ||
        leftComponentIndex === rightComponentIndex) continue;
    const proposed = [...components[leftComponentIndex]!,
      ...components[rightComponentIndex]!].sort((a, b) => a - b);
    if (!modelComponentEligible(proposed, baseGroups, attestedBasePairs, policy)) {
      continue;
    }
    const keepIndex = Math.min(leftComponentIndex, rightComponentIndex);
    const dropIndex = Math.max(leftComponentIndex, rightComponentIndex);
    components[keepIndex] = proposed;
    components.splice(dropIndex, 1);
  }
  return components.map((component) => {
    const mergedItems = component.flatMap((index) => baseGroups[index]?.items ?? [])
      .sort((left, right) => left.feedItemId.localeCompare(right.feedItemId));
    const firstBase = baseGroups[component[0] ?? -1];
    if (firstBase === undefined) throw new Error("Story base component is empty");
    return { key: firstBase.key, items: mergedItems };
  }).sort((left, right) => left.items[0]!.feedItemId.localeCompare(
    right.items[0]!.feedItemId));
};

const modelComponentEligible = (
  component: readonly number[],
  baseGroups: readonly BaseStoryGroup[],
  attestedBasePairs: ReadonlySet<string>,
  policy: StoryRankingPolicy,
): boolean => {
  if (component.length > 4) return false;
  const groups = component.flatMap((index) => baseGroups[index] ?? []);
  if (groups.some((group) => independentFamilies(group.items).size > 4)) {
    return false;
  }
  const items = groups.flatMap((group) => group.items);
  if (independentFamilies(items).size > 4) return false;
  for (let left = 0; left < component.length; left += 1) {
    for (let right = left + 1; right < component.length; right += 1) {
      const leftBase = component[left];
      const rightBase = component[right];
      if (leftBase === undefined || rightBase === undefined ||
          !attestedBasePairs.has(basePairId(leftBase, rightBase))) return false;
    }
  }
  for (let left = 0; left < items.length; left += 1) {
    for (let right = left + 1; right < items.length; right += 1) {
      const leftItem = items[left];
      const rightItem = items[right];
      if (leftItem === undefined || rightItem === undefined) continue;
      const leftBase = component.find((base) =>
        baseGroups[base]?.items.includes(leftItem));
      const rightBase = component.find((base) =>
        baseGroups[base]?.items.includes(rightItem));
      if (leftBase === rightBase) continue;
      if (storyRelationHardNegative({
        left: leftItem,
        right: rightItem,
        policy,
      }) !== undefined) return false;
    }
  }
  return true;
};

const independentFamilies = (
  items: readonly SummaryEvidenceItem[],
): ReadonlySet<string> => new Set(items.map((item) =>
  readerSummaryIndependentProviderFamily(item)));

const basePairId = (left: number, right: number): string =>
  [left, right].sort((a, b) => a - b).join(":");

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

const buildSourceWindow = (
  identity: ReaderSummaryScopeIdentity,
  clusters: readonly StoryCluster[],
  selectedEvidence: readonly SummaryEvidenceItem[],
  now: Date,
): SummarySourceWindow => {
  if (clusters.length === 0 || selectedEvidence.length === 0) {
    const endedAt = new Date(now.getTime());
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

const compareStoryClusters = (
  left: StoryCluster,
  right: StoryCluster,
): number => {
  const scoreDiff = right.score - left.score;
  if (scoreDiff !== 0) {
    return scoreDiff;
  }

  const providerCoverageDiff =
    readerSummaryIndependentProviderFamilyCount(right.providerKeys) -
    readerSummaryIndependentProviderFamilyCount(left.providerKeys);
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
  ) || left.id.localeCompare(right.id);
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
