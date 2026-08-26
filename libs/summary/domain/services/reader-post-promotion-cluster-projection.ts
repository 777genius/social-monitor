import type { SelectedReaderPostPromotion } from
  "../policies/reader-post-promotion-selection";
import type {
  StoryCluster,
  SummaryEvidenceItem,
} from "../value-objects/summary-evidence-item";
import { compactUnique } from "../value-objects/summary-text";

export const projectAdmittedReaderPostClusters = (
  clusters: readonly StoryCluster[],
  admittedEvidence: readonly SummaryEvidenceItem[],
  selected: readonly SelectedReaderPostPromotion[],
): readonly StoryCluster[] => {
  const evidenceById = new Map(admittedEvidence.map((item) =>
    [item.feedItemId, item] as const));
  const clusterById = new Map(clusters.map((cluster) => [cluster.id, cluster]));
  const clusterByEvidenceId = clusterMembership(clusters);
  const unclusteredEvidence = admittedEvidence.find((item) =>
    !clusterByEvidenceId.has(item.feedItemId));
  if (unclusteredEvidence !== undefined) {
    throw new Error(
      `Admitted evidence has no selector cluster: ${unclusteredEvidence.feedItemId}`,
    );
  }
  const orderedClusterIds = compactUnique([
    ...selected.flatMap((promotion) => promotion.candidate.clusterId ?? []),
    ...admittedEvidence.flatMap((item) =>
      clusterByEvidenceId.get(item.feedItemId) ?? []),
  ]);
  return orderedClusterIds.map((clusterId) => projectCluster({
    clusterId,
    clusterById,
    evidenceById,
  }));
};

const projectCluster = (params: {
  readonly clusterId: string;
  readonly clusterById: ReadonlyMap<string, StoryCluster>;
  readonly evidenceById: ReadonlyMap<string, SummaryEvidenceItem>;
}): StoryCluster => {
  const original = params.clusterById.get(params.clusterId);
  if (original === undefined) {
    throw new Error(`Missing admitted selector cluster: ${params.clusterId}`);
  }
  const originalMemberIds = [original.representativeFeedItemId,
    ...original.duplicateFeedItemIds];
  const members = originalMemberIds.flatMap((id) => {
    const evidence = params.evidenceById.get(id);
    return evidence === undefined ? [] : [evidence];
  });
  const representative = members[0];
  if (representative === undefined) {
    throw new Error(
      `Admitted selector cluster has no evidence: ${params.clusterId}`,
    );
  }
  const observedAt = members.map((item) => item.observedAt.getTime());
  return {
    id: original.id,
    storyKey: original.storyKey,
    ...(original.rankingPolicyVersion === undefined
      ? {} : { rankingPolicyVersion: original.rankingPolicyVersion }),
    representativeFeedItemId: representative.feedItemId,
    duplicateFeedItemIds: members.slice(1).map((item) => item.feedItemId),
    interestIds: compactUnique(members.map((item) => item.interestId)),
    providerKeys: compactUnique(members.map((item) => item.providerKey)),
    score: Math.max(...members.map((item) => item.score)),
    observedAtRange: {
      startedAt: new Date(Math.min(...observedAt)),
      endedAt: new Date(Math.max(...observedAt)),
    },
    whyImportant: compactUnique(members.flatMap((item) => item.whyImportant)),
  };
};

const clusterMembership = (
  clusters: readonly StoryCluster[],
): ReadonlyMap<string, string> => {
  const result = new Map<string, string>();
  for (const cluster of clusters) {
    for (const id of [cluster.representativeFeedItemId,
      ...cluster.duplicateFeedItemIds]) {
      const current = result.get(id);
      if (current !== undefined && current !== cluster.id) {
        throw new Error(`Summary evidence belongs to multiple clusters: ${id}`);
      }
      result.set(id, cluster.id);
    }
  }
  return result;
};
