import { canonicalReaderSummaryPreparationTimestamp,
  type selectReaderPostPromotionsV3, type ReaderPostPromotionV3Candidate,
  type StoryCluster, type SummaryEvidenceItem,
  type SummaryEvidenceSelection } from "../../domain";

const compareUtf8Bytes = (left: string, right: string): number =>
  Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));

export const v3EvidenceSelection = (params: {
  readonly jobId: string;
  readonly period: { readonly startedAt: Date; readonly endedAt: Date };
  readonly cutoffAt: string;
  readonly clusters: readonly StoryCluster[];
  readonly primaryEvidence: readonly SummaryEvidenceItem[];
  readonly supplementalEvidence: readonly SummaryEvidenceItem[];
  readonly selection: NonNullable<SummaryEvidenceSelection["promotionV3"]>;
}): SummaryEvidenceSelection => {
  const primaryIds = new Set(params.primaryEvidence.map((item) => item.feedItemId));
  const selectedEvidence = [...params.primaryEvidence,
    ...params.supplementalEvidence.filter((item) => !primaryIds.has(item.feedItemId))];
  const exactCutoff = canonicalReaderSummaryPreparationTimestamp(params.cutoffAt);
  return {
    rankingPolicyVersion: "reader_promotion_policy.v3",
    sourceWindow: {
      windowId: `reader-summary-v3:${params.jobId}`,
      startedAt: params.period.startedAt, endedAt: params.period.endedAt,
      selectedFeedItemIds: selectedEvidence.map((item) => item.feedItemId),
      storyClusterIds: params.clusters.map((cluster) => cluster.id),
      periodStartedAt: params.period.startedAt,
      periodEndedAt: params.period.endedAt,
      ingestionCutoff: new Date(exactCutoff), exactIngestionCutoff: exactCutoff,
    },
    clusters: params.clusters, selectedEvidence, promotionV3: params.selection,
  };
};

export const clustersForSelection = (
  selection: ReturnType<typeof selectReaderPostPromotionsV3>,
  evidence: readonly SummaryEvidenceItem[],
  candidates: readonly ReaderPostPromotionV3Candidate[],
): readonly StoryCluster[] => [...selection.top, ...selection.additional].map((candidate) => {
  const item = evidence.find((value) => value.feedItemId === candidate.candidateId)!;
  const members = candidates.filter((value) =>
    value.storyId === candidate.storyId || value.sourceItemId === candidate.sourceItemId);
  const duplicateFeedItemIds = members.filter((value) =>
    value.candidateId !== candidate.candidateId &&
    (value.storyId === candidate.storyId || value.sourceItemId === candidate.sourceItemId))
    .map((value) => value.candidateId);
  return { id: candidate.storyId, storyKey: candidate.storyId,
    rankingPolicyVersion: "reader_promotion_policy.v3",
    representativeFeedItemId: candidate.candidateId, duplicateFeedItemIds,
    interestIds: [...new Set(members.map((member) => member.interestId ??
      item.interestId))].sort(compareUtf8Bytes), providerKeys: [...new Set(
      members.map((member) => member.providerKey))].sort(compareUtf8Bytes), score: 0,
    observedAtRange: { startedAt: item.observedAt, endedAt: item.observedAt },
    whyImportant: [] };
});
