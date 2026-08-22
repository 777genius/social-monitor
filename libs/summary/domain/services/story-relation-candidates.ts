import {
  STORY_RANKING_POLICY_V1,
  type StoryRankingPolicy,
} from "../policies/story-ranking-policy";
import type {
  StoryCluster,
  SummaryEvidenceItem,
  SummaryEvidenceSelection,
} from "../value-objects/summary-evidence-item";
import {
  hasSharedStoryEventFacet,
  isDeterministicCrossProviderStoryMatch,
  isVerifiedSameAuthorStorySeriesCandidate,
  isVerifiedStoryRelationGuardEligible,
  verifiedStoryRelationPairKey,
} from "./story-cluster-membership";
import {
  sharedStoryTopicTokenCount,
  storyClaimFacetTokens,
  storyIdentityAnchorTokens,
  storyIdentitySpecificProductTokens,
  storyIdentityTokens,
  storyTopicEventTokens,
  storyTopicSimilarity,
} from "./story-topic-tokenizer";
import { readerPostProviderFamily } from
  "../policies/reader-post-promotion-policy";

export type StoryRelationCandidate = {
  readonly leftFeedItemId: string;
  readonly rightFeedItemId: string;
  readonly leftClusterId: string;
  readonly rightClusterId: string;
  readonly sharedTopicTokens: readonly string[];
  readonly sharedAnchorTokens: readonly string[];
  readonly sharedEventTokens: readonly string[];
  readonly sharedSpecificProductTokens: readonly string[];
  readonly topicSimilarity: number;
};

export type StoryRelationDecision = {
  readonly leftFeedItemId: string;
  readonly rightFeedItemId: string;
  readonly sameStory: boolean;
  readonly confidenceScore: number;
  readonly rationale?: string;
};

const maxCandidates = 32;
const maxCandidatesPerClusterPair = 4;
const minimumCandidateSimilarity = 0.14;
export const STORY_RELATION_APPROVAL_CONFIDENCE_MIN = 0.92;

export const buildStoryRelationCandidates = (params: {
  readonly selection: SummaryEvidenceSelection;
  readonly evidence: readonly SummaryEvidenceItem[];
  readonly policy?: StoryRankingPolicy;
}): readonly StoryRelationCandidate[] => {
  const policy = params.policy ?? STORY_RANKING_POLICY_V1;
  const clusterByFeedItemId = clusterMembership(params.selection.clusters);
  const candidates: StoryRelationCandidate[] = [];

  for (let leftIndex = 0; leftIndex < params.evidence.length; leftIndex += 1) {
    const left = params.evidence[leftIndex];
    if (left === undefined) {
      continue;
    }
    const leftClusterId = clusterByFeedItemId.get(left.feedItemId);
    if (leftClusterId === undefined) {
      continue;
    }

    for (
      let rightIndex = leftIndex + 1;
      rightIndex < params.evidence.length;
      rightIndex += 1
    ) {
      const right = params.evidence[rightIndex];
      if (right === undefined) {
        continue;
      }
      const rightClusterId = clusterByFeedItemId.get(right.feedItemId);
      if (
        rightClusterId === undefined ||
        leftClusterId === rightClusterId ||
        readerPostProviderFamily(left.providerKey) ===
          readerPostProviderFamily(right.providerKey) ||
        !isVerifiedStoryRelationGuardEligible(left, right, policy) ||
        isDeterministicCrossProviderStoryMatch(left, right, policy)
      ) {
        continue;
      }

      const canonical =
        left.feedItemId.localeCompare(right.feedItemId) <= 0
          ? { left, right, leftClusterId, rightClusterId }
          : {
              left: right,
              right: left,
              leftClusterId: rightClusterId,
              rightClusterId: leftClusterId,
            };
      const candidate = relationCandidate({
        ...canonical,
        policy,
      });
      if (candidate !== undefined) {
        candidates.push(candidate);
      }
    }
  }

  return boundedCandidates(candidates);
};

const relationCandidate = (params: {
  readonly left: SummaryEvidenceItem;
  readonly right: SummaryEvidenceItem;
  readonly leftClusterId: string;
  readonly rightClusterId: string;
  readonly policy: StoryRankingPolicy;
}): StoryRelationCandidate | undefined => {
  const leftTokens = storyIdentityTokens(params.left, params.policy);
  const rightTokens = storyIdentityTokens(params.right, params.policy);
  const sharedTopicTokens = sharedTokens(leftTokens, rightTokens);
  const sharedAnchorTokens = sharedTokens(
    storyIdentityAnchorTokens(leftTokens),
    storyIdentityAnchorTokens(rightTokens),
  );
  const sharedEventTokens = sharedTokens(
    storyTopicEventTokens(leftTokens),
    storyTopicEventTokens(rightTokens),
  );
  const sharedSpecificProductTokens = sharedTokens(
    storyIdentitySpecificProductTokens(leftTokens),
    storyIdentitySpecificProductTokens(rightTokens),
  );
  const topicSimilarity = storyTopicSimilarity(leftTokens, rightTokens);
  const sameAuthorSeries = isVerifiedSameAuthorStorySeriesCandidate(
    params.left,
    params.right,
  );
  const sharedNonAnchorTokens = sharedTopicTokens.filter(
    (token) => !sharedAnchorTokens.includes(token),
  );
  const sameAuthorSeriesContext =
    sameAuthorSeries && sharedNonAnchorTokens.length > 0;
  const sharedStoryEventFacet = hasSharedStoryEventFacet(
    params.left,
    params.right,
  );
  const sharedEntityAnchorTokens = sharedAnchorTokens.filter(
    (token) => !sharedEventTokens.includes(token),
  );
  const sharedConcreteSubject =
    sharedEntityAnchorTokens.length > 0 ||
    sharedSpecificProductTokens.length > 0 ||
    sharedNonAnchorTokens.length >= minimumSharedSubjectTokens ||
    sameAuthorSeriesContext;
  const enoughContext =
    sameAuthorSeriesContext ||
    (sharedTopicTokens.length >=
      (sharedStoryEventFacet
        ? minimumSharedEventFacetTopicTokens
        : minimumSharedTopicTokens) &&
      (sharedEventTokens.length > 0 ||
        sharedNonAnchorTokens.length >= minimumSharedContextTokens ||
        sharedStoryEventFacet));

  if (
    !sharedConcreteSubject ||
    !enoughContext ||
    (!sameAuthorSeries && topicSimilarity < minimumCandidateSimilarity)
  ) {
    return undefined;
  }

  return {
    leftFeedItemId: params.left.feedItemId,
    rightFeedItemId: params.right.feedItemId,
    leftClusterId: params.leftClusterId,
    rightClusterId: params.rightClusterId,
    sharedTopicTokens,
    sharedAnchorTokens,
    sharedEventTokens,
    sharedSpecificProductTokens,
    topicSimilarity,
  };
};

const minimumSharedContextTokens = 2;
const minimumSharedEventFacetTopicTokens = 2;
const minimumSharedSubjectTokens = 3;
const minimumSharedTopicTokens = 3;

const boundedCandidates = (
  candidates: readonly StoryRelationCandidate[],
): readonly StoryRelationCandidate[] => {
  const perClusterPair = new Map<string, number>();
  const selected: StoryRelationCandidate[] = [];
  for (const candidate of [...candidates].sort(compareCandidates)) {
    const clusterPair = [candidate.leftClusterId, candidate.rightClusterId]
      .sort()
      .join("\u0000");
    const currentCount = perClusterPair.get(clusterPair) ?? 0;
    if (currentCount >= maxCandidatesPerClusterPair) {
      continue;
    }
    selected.push(candidate);
    perClusterPair.set(clusterPair, currentCount + 1);
    if (selected.length >= maxCandidates) {
      break;
    }
  }
  return selected;
};

const compareCandidates = (
  left: StoryRelationCandidate,
  right: StoryRelationCandidate,
): number =>
  right.sharedSpecificProductTokens.length -
    left.sharedSpecificProductTokens.length ||
  right.sharedEventTokens.length - left.sharedEventTokens.length ||
  right.sharedAnchorTokens.length - left.sharedAnchorTokens.length ||
  right.topicSimilarity - left.topicSimilarity ||
  candidatePairKey(left).localeCompare(candidatePairKey(right));

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

const sharedTokens = (
  left: readonly string[],
  right: readonly string[],
): readonly string[] => {
  if (sharedStoryTopicTokenCount(left, right) === 0) {
    return [];
  }
  const rightSet = new Set(right);
  return [...new Set(left.filter((token) => rightSet.has(token)))].sort();
};

const candidatePairKey = (candidate: StoryRelationCandidate): string =>
  verifiedStoryRelationPairKey(
    candidate.leftFeedItemId,
    candidate.rightFeedItemId,
  );

export const storyRelationCandidateClaimFacets = (
  item: SummaryEvidenceItem,
): readonly string[] => storyClaimFacetTokens(item);
