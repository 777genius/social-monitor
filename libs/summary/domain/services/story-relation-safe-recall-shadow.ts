import type {
  StoryCluster,
  SummaryEvidenceItem,
  SummaryEvidenceSelection,
} from "../value-objects/summary-evidence-item";
import { verifiedStoryRelationPairKey } from "./story-cluster-membership";
import type { StoryRelationCandidate } from "./story-relation-candidates";
import { strictStoryRelationTitleEvidence } from "./story-relation-title-evidence";

export const STORY_RELATION_SAFE_RECALL_SHADOW_POLICY_VERSION =
  "reader_summary.story_relation.safe_recall_shadow.v2";
export const STORY_RELATION_SAFE_RECALL_SHADOW_MAX_CANDIDATES = 8;

const maxCandidatesPerClusterPair = 1;

export type StoryRelationSafeRecallShadowReasonCode =
  "title_normalized_entity_event_evidence";

export type StoryRelationSafeRecallShadowGenerationReasonCode =
  | StoryRelationSafeRecallShadowReasonCode
  | "excluded_primary_pair"
  | "excluded_cluster_pair_cap"
  | "excluded_global_cap";

export type StoryRelationSafeRecallShadowCandidate = StoryRelationCandidate & {
  readonly shadowReasonCode: StoryRelationSafeRecallShadowReasonCode;
  readonly titleSharedIdentityTokenCount: number;
  readonly titleSharedEventTokenCount: number;
  readonly bodySharedTokenCount: number;
};

export type StoryRelationSafeRecallShadowGenerationAggregate = {
  readonly reasonCode: StoryRelationSafeRecallShadowGenerationReasonCode;
  readonly candidatePolicyVersion: typeof STORY_RELATION_SAFE_RECALL_SHADOW_POLICY_VERSION;
  readonly count: number;
};

export type StoryRelationSafeRecallShadowGeneration = {
  readonly candidates: readonly StoryRelationSafeRecallShadowCandidate[];
  readonly aggregates: readonly StoryRelationSafeRecallShadowGenerationAggregate[];
};

/**
 * Builds an additive, shadow-only shortlist. Title and body evidence are kept
 * separate: body overlap is verifier context only and never affects eligibility.
 */
export const buildStoryRelationSafeRecallShadowCandidates = (params: {
  readonly selection: SummaryEvidenceSelection;
  readonly evidence: readonly SummaryEvidenceItem[];
  readonly primaryCandidates: readonly StoryRelationCandidate[];
}): StoryRelationSafeRecallShadowGeneration => {
  const clusterByFeedItemId = clusterMembership(params.selection.clusters);
  const primaryPairIds = new Set(params.primaryCandidates.map(candidatePairId));
  const generationCounts = new Map<
    StoryRelationSafeRecallShadowGenerationReasonCode,
    number
  >();
  const candidates: StoryRelationSafeRecallShadowCandidate[] = [];
  const evidence = [...params.evidence].sort((left, right) =>
    left.feedItemId.localeCompare(right.feedItemId),
  );

  for (let leftIndex = 0; leftIndex < evidence.length; leftIndex += 1) {
    const left = evidence[leftIndex];
    if (left === undefined) continue;
    const leftClusterId = clusterByFeedItemId.get(left.feedItemId);
    if (leftClusterId === undefined) continue;

    for (let rightIndex = leftIndex + 1; rightIndex < evidence.length; rightIndex += 1) {
      const right = evidence[rightIndex];
      if (right === undefined) continue;
      const rightClusterId = clusterByFeedItemId.get(right.feedItemId);
      if (
        rightClusterId === undefined ||
        leftClusterId === rightClusterId ||
        !isSafeRecallShadowGuardEligible(left, right)
      ) {
        continue;
      }
      const pairId = verifiedStoryRelationPairKey(
        left.feedItemId,
        right.feedItemId,
      );
      if (primaryPairIds.has(pairId)) {
        increment(generationCounts, "excluded_primary_pair");
        continue;
      }
      const candidate = safeRecallCandidate({
        left,
        right,
        leftClusterId,
        rightClusterId,
      });
      if (candidate !== undefined) candidates.push(candidate);
    }
  }

  const selected: StoryRelationSafeRecallShadowCandidate[] = [];
  const clusterPairCounts = new Map<string, number>();
  for (const candidate of candidates.sort(compareCandidates)) {
    const clusterPairId = [candidate.leftClusterId, candidate.rightClusterId]
      .sort()
      .join("\u0000");
    const clusterPairCount = clusterPairCounts.get(clusterPairId) ?? 0;
    if (clusterPairCount >= maxCandidatesPerClusterPair) {
      increment(generationCounts, "excluded_cluster_pair_cap");
      continue;
    }
    if (selected.length >= STORY_RELATION_SAFE_RECALL_SHADOW_MAX_CANDIDATES) {
      increment(generationCounts, "excluded_global_cap");
      continue;
    }
    selected.push(candidate);
    clusterPairCounts.set(clusterPairId, clusterPairCount + 1);
    increment(generationCounts, candidate.shadowReasonCode);
  }

  return {
    candidates: selected,
    aggregates: [...generationCounts.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([reasonCode, count]) => ({
        reasonCode,
        candidatePolicyVersion:
          STORY_RELATION_SAFE_RECALL_SHADOW_POLICY_VERSION,
        count,
      })),
  };
};

const isSafeRecallShadowGuardEligible = (
  left: SummaryEvidenceItem,
  right: SummaryEvidenceItem,
): boolean =>
  left.providerKey !== right.providerKey &&
  Math.abs(left.publishedAt.getTime() - right.publishedAt.getTime()) <=
    safeRecallMaxTimeDistanceMs;

const safeRecallMaxTimeDistanceMs = 30 * 60 * 60 * 1000;

const safeRecallCandidate = (params: {
  readonly left: SummaryEvidenceItem;
  readonly right: SummaryEvidenceItem;
  readonly leftClusterId: string;
  readonly rightClusterId: string;
}): StoryRelationSafeRecallShadowCandidate | undefined => {
  const titleEvidence = strictStoryRelationTitleEvidence(
    params.left.title,
    params.right.title,
  );
  if (titleEvidence === undefined) return undefined;
  const sharedBody = sharedTokens(
    lexicalTokens(params.left.sourceText ?? params.left.bodyPreview ?? ""),
    lexicalTokens(params.right.sourceText ?? params.right.bodyPreview ?? ""),
  );

  return {
    leftFeedItemId: params.left.feedItemId,
    rightFeedItemId: params.right.feedItemId,
    leftClusterId: params.leftClusterId,
    rightClusterId: params.rightClusterId,
    sharedTopicTokens: titleEvidence.sharedTitleTokens,
    sharedAnchorTokens: titleEvidence.sharedEntityTokens,
    sharedEventTokens: titleEvidence.sharedEventTokens,
    sharedSpecificProductTokens: titleEvidence.sharedEntityTokens,
    topicSimilarity: titleEvidence.sharedTitleTokens.length /
      (titleEvidence.sharedTitleTokens.length + 2),
    shadowReasonCode: "title_normalized_entity_event_evidence",
    titleSharedIdentityTokenCount: titleEvidence.sharedEntityTokens.length,
    titleSharedEventTokenCount: titleEvidence.sharedEventTokens.length,
    bodySharedTokenCount: sharedBody.length,
  };
};

const lexicalTokens = (raw: string): readonly string[] =>
  raw.normalize("NFKC").toLocaleLowerCase("en-US")
    .replace(/[^\p{Letter}\p{Number}+#.]+/gu, " ")
    .trim()
    .split(/\s+/u)
    .filter((token) => token.length >= 3 && !genericTokens.has(token));
const genericTokens = new Set([
  "about",
  "after",
  "and",
  "announces",
  "for",
  "from",
  "how",
  "new",
  "official",
  "output",
  "the",
  "this",
  "with",
]);


const sharedTokens = (
  left: readonly string[],
  right: readonly string[],
): readonly string[] => {
  const rightSet = new Set(right);
  return [...new Set(left.filter((token) => rightSet.has(token)))].sort();
};

const compareCandidates = (
  left: StoryRelationSafeRecallShadowCandidate,
  right: StoryRelationSafeRecallShadowCandidate,
): number =>
  right.titleSharedEventTokenCount - left.titleSharedEventTokenCount ||
  right.titleSharedIdentityTokenCount - left.titleSharedIdentityTokenCount ||
  right.topicSimilarity - left.topicSimilarity ||
  candidatePairId(left).localeCompare(candidatePairId(right));

const candidatePairId = (candidate: StoryRelationCandidate): string =>
  verifiedStoryRelationPairKey(
    candidate.leftFeedItemId,
    candidate.rightFeedItemId,
  );

const clusterMembership = (
  clusters: readonly StoryCluster[],
): ReadonlyMap<string, string> => {
  const result = new Map<string, string>();
  for (const cluster of clusters) {
    for (const feedItemId of [
      cluster.representativeFeedItemId,
      ...cluster.duplicateFeedItemIds,
    ]) {
      result.set(feedItemId, cluster.id);
    }
  }
  return result;
};

const increment = <T extends string>(counts: Map<T, number>, key: T): void => {
  counts.set(key, (counts.get(key) ?? 0) + 1);
};
