import {
  readerPostProviderFamily,
  type StoryCluster,
  type StoryRelationCandidate,
  type SummaryEvidenceItem,
  type SummaryEvidenceSelection,
} from "../../domain";

export const promotionPolicySelection = (
  base: SummaryEvidenceSelection,
  items: readonly SummaryEvidenceItem[],
): SummaryEvidenceSelection => {
  const byId = new Map(items.map((item) => [item.feedItemId, item] as const));
  const clusteredIds = new Set<string>();
  const clusters = base.clusters.flatMap((cluster): readonly StoryCluster[] => {
    const members = [
      cluster.representativeFeedItemId,
      ...cluster.duplicateFeedItemIds,
    ].flatMap((id) => byId.has(id) ? [byId.get(id)!] : []);
    if (members.length === 0) return [];
    for (const member of members) clusteredIds.add(member.feedItemId);
    const representative = deterministicRepresentative(members);
    return [{
      ...cluster,
      representativeFeedItemId: representative.feedItemId,
      duplicateFeedItemIds: members
        .map((item) => item.feedItemId)
        .filter((id) => id !== representative.feedItemId)
        .sort(),
      interestIds: [...new Set(members.map((item) => item.interestId))].sort(),
      providerKeys: [...new Set(members.map((item) => item.providerKey))].sort(),
    }];
  });
  for (const item of items) {
    if (clusteredIds.has(item.feedItemId)) continue;
    clusters.push({
      id: `promotion-candidate:${item.feedItemId}`,
      storyKey: item.promotionFacts?.canonicalIdentity ?? item.canonicalUrl,
      rankingPolicyVersion: "reader-post-promotion-input.v1",
      representativeFeedItemId: item.feedItemId,
      duplicateFeedItemIds: [],
      interestIds: [item.interestId],
      providerKeys: [item.providerKey],
      score: item.score,
      observedAtRange: {
        startedAt: new Date(item.observedAt),
        endedAt: new Date(item.observedAt),
      },
      whyImportant: item.whyImportant,
    });
  }
  return {
    rankingPolicyVersion: "reader-post-promotion-input.v1",
    sourceWindow: {
      ...base.sourceWindow,
      selectedFeedItemIds: items.map((item) => item.feedItemId),
      storyClusterIds: clusters.map((cluster) => cluster.id),
    },
    selectedEvidence: items,
    clusters,
    approvedSameStoryRelations: base.approvedSameStoryRelations,
  };
};

const deterministicRepresentative = (
  items: readonly SummaryEvidenceItem[],
): SummaryEvidenceItem => [...items].sort((left, right) =>
  right.score - left.score ||
  right.publishedAt.getTime() - left.publishedAt.getTime() ||
  left.feedItemId.localeCompare(right.feedItemId))[0]!;

export const promotionSupportCandidates = (params: {
  readonly evidence: readonly SummaryEvidenceItem[];
  readonly clusters: readonly StoryCluster[];
  readonly leadIds: ReadonlySet<string>;
  readonly promotionCandidateIds: ReadonlySet<string>;
}): readonly StoryRelationCandidate[] => {
  const evidenceById = new Map(params.evidence.map((item) =>
    [item.feedItemId, item] as const));
  const candidates: StoryRelationCandidate[] = [];
  const seen = new Set<string>();
  const clusterIdByEvidenceId = new Map<string, string>();
  for (const cluster of params.clusters) {
    const memberIds = [
      cluster.representativeFeedItemId,
      ...cluster.duplicateFeedItemIds,
    ].filter((id) => params.promotionCandidateIds.has(id));
    for (const id of memberIds) clusterIdByEvidenceId.set(id, cluster.id);
    for (const leadId of memberIds.filter((id) => params.leadIds.has(id))) {
      const lead = evidenceById.get(leadId);
      if (lead === undefined) continue;
      for (const supportId of memberIds) {
        const support = evidenceById.get(supportId);
        if (support === undefined || supportId === leadId ||
            readerPostProviderFamily(lead.providerKey) ===
              readerPostProviderFamily(support.providerKey)) continue;
        addCandidate({ candidates, seen, leadId, supportId,
          leftClusterId: cluster.id, rightClusterId: cluster.id });
      }
    }
  }
  for (const leadId of params.leadIds) {
    const lead = evidenceById.get(leadId);
    if (lead === undefined) continue;
    for (const supportId of params.promotionCandidateIds) {
      const support = evidenceById.get(supportId);
      if (support === undefined || supportId === leadId ||
          normalizedTitle(lead.title) !== normalizedTitle(support.title) ||
          readerPostProviderFamily(lead.providerKey) ===
            readerPostProviderFamily(support.providerKey)) continue;
      addCandidate({
        candidates,
        seen,
        leadId,
        supportId,
        leftClusterId: clusterIdByEvidenceId.get(leadId) ??
          `promotion:${leadId}`,
        rightClusterId: clusterIdByEvidenceId.get(supportId) ??
          `promotion:${supportId}`,
      });
    }
  }
  return candidates;
};

const addCandidate = (params: {
  readonly candidates: StoryRelationCandidate[];
  readonly seen: Set<string>;
  readonly leadId: string;
  readonly supportId: string;
  readonly leftClusterId: string;
  readonly rightClusterId: string;
}): void => {
  const key = [params.leadId, params.supportId].sort().join("\u0000");
  if (params.seen.has(key)) return;
  params.seen.add(key);
  params.candidates.push({
    leftFeedItemId: params.leadId,
    rightFeedItemId: params.supportId,
    leftClusterId: params.leftClusterId,
    rightClusterId: params.rightClusterId,
    sharedTopicTokens: [],
    sharedAnchorTokens: [],
    sharedEventTokens: [],
    sharedSpecificProductTokens: [],
    topicSimilarity: 1,
  });
};

const normalizedTitle = (value: string): string => value
  .trim().toLocaleLowerCase("en-US").replace(/\s+/gu, " ");
