import type { SelectedReaderPostPromotion } from
  "../policies/reader-post-promotion-selection";
import type {
  StoryCluster,
  SummaryEvidenceItem,
} from "../value-objects/summary-evidence-item";
import { compactUnique } from "../value-objects/summary-text";

export const projectReaderPostPromotionAdmittedClusters = (
  clusters: readonly StoryCluster[],
  admittedEvidence: readonly SummaryEvidenceItem[],
  selected: readonly SelectedReaderPostPromotion[],
): readonly StoryCluster[] => {
  const evidenceById = new Map(admittedEvidence.map((item) =>
    [item.feedItemId, item] as const,
  ));
  const clusterById = new Map(clusters.map((cluster) => [cluster.id, cluster]));
  const usedClusterIds = new Set<string>();
  return selected.map((promotion): StoryCluster => {
    const members = [promotion.candidate, ...promotion.support].map((input) =>
      requiredEvidence(evidenceById, input.candidateId),
    );
    const representative = members[0]!;
    const original = promotion.candidate.clusterId === undefined
      ? undefined
      : clusterById.get(promotion.candidate.clusterId);
    const preferredId = original?.id ??
      `promotion:${promotion.candidate.canonicalIdentity}`;
    const id = usedClusterIds.has(preferredId)
      ? `${preferredId}:${promotion.candidate.candidateId}`
      : preferredId;
    usedClusterIds.add(id);
    const observedAt = members.map((item) => item.observedAt.getTime());
    return {
      id,
      storyKey: original?.storyKey ?? promotion.candidate.canonicalIdentity,
      ...(original?.rankingPolicyVersion === undefined
        ? {}
        : { rankingPolicyVersion: original.rankingPolicyVersion }),
      representativeFeedItemId: representative.feedItemId,
      duplicateFeedItemIds: members.slice(1).map((item) => item.feedItemId),
      interestIds: compactUnique(members.map((item) => item.interestId)),
      providerKeys: compactUnique(members.map((item) => item.providerKey)),
      score: Math.max(...members.map((item) => item.score)),
      observedAtRange: {
        startedAt: new Date(Math.min(...observedAt)),
        endedAt: new Date(Math.max(...observedAt)),
      },
      whyImportant: compactUnique(members.flatMap((item) =>
        item.whyImportant)),
    };
  });
};

const requiredEvidence = (
  evidenceById: ReadonlyMap<string, SummaryEvidenceItem>,
  id: string,
): SummaryEvidenceItem => {
  const evidence = evidenceById.get(id);
  if (evidence === undefined) {
    throw new Error(`Missing promoted evidence: ${id}`);
  }
  return evidence;
};
