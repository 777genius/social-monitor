import type { ReaderSummaryModelInput } from "../../ports";
import { normalizeReaderSummaryStoryLimit } from "./deterministic-reader-summary-provider-diversity";

export {
  normalizeReaderSummaryStoryLimit,
  selectProviderDiverseRankedEvidence,
} from "./deterministic-reader-summary-provider-diversity";

export const selectClustersForEvidence = (
  clusters: ReaderSummaryModelInput["evidence"]["clusters"],
  evidence: ReaderSummaryModelInput["evidence"]["selectedEvidence"],
  limit: number,
  pinnedClusterIds: readonly string[],
): ReaderSummaryModelInput["evidence"]["clusters"] => {
  const normalizedLimit = normalizeReaderSummaryStoryLimit(limit);
  const clusterByRepresentative = new Map(
    clusters.map(
      (cluster) => [cluster.representativeFeedItemId, cluster] as const,
    ),
  );
  const clusterById = new Map(
    clusters.map((cluster) => [cluster.id, cluster] as const),
  );
  const selectedClusters: ReaderSummaryModelInput["evidence"]["clusters"][number][] =
    [];
  const selectedClusterIds = new Set<string>();
  const addCluster = (
    cluster:
      ReaderSummaryModelInput["evidence"]["clusters"][number] | undefined,
  ): void => {
    if (
      cluster === undefined ||
      selectedClusters.length >= normalizedLimit ||
      selectedClusterIds.has(cluster.id)
    ) {
      return;
    }
    selectedClusters.push(cluster);
    selectedClusterIds.add(cluster.id);
  };

  for (const pinnedClusterId of pinnedClusterIds) {
    addCluster(clusterById.get(pinnedClusterId));
  }
  for (const item of evidence) {
    addCluster(clusterByRepresentative.get(item.feedItemId));
  }

  for (const cluster of clusters) {
    if (selectedClusters.length >= normalizedLimit) {
      break;
    }

    addCluster(cluster);
  }

  return selectedClusters.slice(0, normalizedLimit);
};
