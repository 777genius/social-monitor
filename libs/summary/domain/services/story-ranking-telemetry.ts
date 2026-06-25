import type {
  SummaryEvidenceItem,
  SummaryEvidenceSelection,
  StoryCluster,
} from "../value-objects/summary-evidence-item";

export type StoryRankingTelemetrySnapshot = {
  readonly rankingPolicyVersion: string;
  readonly clusterCount: number;
  readonly averageStorySignal: number;
  readonly crossProviderClusterShare: number;
  readonly titleOnlyClusterShare: number;
  readonly sameProviderDuplicateCount: number;
  readonly maxSameProviderDuplicateCount: number;
  readonly clustersWithoutProviderMetrics: number;
  readonly topProviderKey?: string;
  readonly topProviderClusterShare: number;
};

export const buildStoryRankingTelemetrySnapshot = (
  selection: SummaryEvidenceSelection,
): StoryRankingTelemetrySnapshot => {
  const clusters = selection.clusters;
  const clusterCount = clusters.length;
  const evidenceById = new Map(
    selection.selectedEvidence.map((item) => [item.feedItemId, item] as const),
  );
  const sameProviderDuplicateCounts = clusters.map((cluster) =>
    sameProviderDuplicateCount(cluster, evidenceById),
  );
  const topProvider = topRepresentativeProvider(clusters, evidenceById);

  return {
    rankingPolicyVersion: selection.rankingPolicyVersion,
    clusterCount,
    averageStorySignal: ratio(
      clusters.reduce((total, cluster) => total + cluster.score, 0),
      clusterCount,
    ),
    crossProviderClusterShare: ratio(
      clusters.filter((cluster) => cluster.providerKeys.length > 1).length,
      clusterCount,
    ),
    titleOnlyClusterShare: ratio(
      clusters.filter((cluster) => cluster.storyKey.startsWith("title:"))
        .length,
      clusterCount,
    ),
    sameProviderDuplicateCount: sameProviderDuplicateCounts.reduce(
      (total, count) => total + count,
      0,
    ),
    maxSameProviderDuplicateCount: Math.max(0, ...sameProviderDuplicateCounts),
    clustersWithoutProviderMetrics: clusters.filter((cluster) =>
      clusterEvidence(cluster, evidenceById).every(
        (item) => (item.providerMetricLabels ?? []).length === 0,
      ),
    ).length,
    topProviderKey: topProvider?.providerKey,
    topProviderClusterShare: ratio(
      topProvider?.clusterCount ?? 0,
      clusterCount,
    ),
  };
};

const clusterEvidence = (
  cluster: StoryCluster,
  evidenceById: ReadonlyMap<string, SummaryEvidenceItem>,
): readonly SummaryEvidenceItem[] =>
  [cluster.representativeFeedItemId, ...cluster.duplicateFeedItemIds].flatMap(
    (feedItemId) => evidenceById.get(feedItemId) ?? [],
  );

const sameProviderDuplicateCount = (
  cluster: StoryCluster,
  evidenceById: ReadonlyMap<string, SummaryEvidenceItem>,
): number => {
  const providerCounts = new Map<string, number>();
  for (const item of clusterEvidence(cluster, evidenceById)) {
    providerCounts.set(
      item.providerKey,
      (providerCounts.get(item.providerKey) ?? 0) + 1,
    );
  }

  return Math.max(0, ...[...providerCounts.values()].map((count) => count - 1));
};

const topRepresentativeProvider = (
  clusters: readonly StoryCluster[],
  evidenceById: ReadonlyMap<string, SummaryEvidenceItem>,
):
  | { readonly providerKey: string; readonly clusterCount: number }
  | undefined => {
  const counts = new Map<string, number>();

  for (const cluster of clusters) {
    const providerKey =
      evidenceById.get(cluster.representativeFeedItemId)?.providerKey ??
      cluster.providerKeys[0];
    if (providerKey === undefined) {
      continue;
    }
    counts.set(providerKey, (counts.get(providerKey) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(
      ([leftProvider, leftCount], [rightProvider, rightCount]) =>
        rightCount - leftCount || leftProvider.localeCompare(rightProvider),
    )
    .map(([providerKey, clusterCount]) => ({ providerKey, clusterCount }))
    .at(0);
};

const ratio = (value: number, total: number): number =>
  total <= 0 ? 0 : Math.round((value / total) * 1000) / 1000;
