import { createHash } from "node:crypto";

import {
  STORY_RANKING_POLICY_V1,
  type StoryRankingPolicy,
} from "../policies/story-ranking-policy";
import type {
  StoryCluster,
  SummaryEvidenceItem,
  SummaryEvidenceSelection,
} from "../value-objects/summary-evidence-item";
import { isDeterministicCrossProviderStoryMatch,
  verifiedStoryRelationPairKey } from "./story-cluster-membership";
import type { StoryRelationCandidate } from "./story-relation-candidates";
import {
  sharedExactTokens,
  speculativeQuestionClearedByBody,
  storyEventSignature,
  storyTitleSimilarity,
  type StoryEventLemma,
  type StoryEventRole,
} from "./story-event-signature";
import { storyRelationHardNegative } from "./story-relation-hard-negative";

export const STORY_RELATION_GUARDED_RECALL_POLICY_VERSION =
  "reader_summary.story_relation.guarded_recall.v1";
export const STORY_RELATION_GUARDED_RECALL_MAX_CANDIDATES = 8;
export const STORY_RELATION_GUARDED_RECALL_CONFIDENCE_MIN = 0.98;

export type GuardedRecallCandidate = StoryRelationCandidate & Readonly<{
  eventPredicate: StoryEventLemma;
  anchor: string;
  objectAnchor: string;
  eventRole?: StoryEventRole;
  featureDigest: string;
}>;

export type GuardedRecallGenerationReason =
  | "candidate"
  | "excluded_existing_primary"
  | "excluded_existing_deterministic"
  | "excluded_cluster_pair_cap"
  | "excluded_global_cap"
  | "excluded_hard_negative";

export type GuardedRecallGenerationAggregate = Readonly<{
  reasonCode: GuardedRecallGenerationReason;
  candidatePolicyVersion: typeof STORY_RELATION_GUARDED_RECALL_POLICY_VERSION;
  count: number;
}>;

export const buildGuardedRecallCandidates = (params: {
  readonly selection: SummaryEvidenceSelection;
  readonly evidence: readonly SummaryEvidenceItem[];
  readonly primaryCandidates: readonly StoryRelationCandidate[];
  readonly policy?: StoryRankingPolicy;
}): Readonly<{
  candidates: readonly GuardedRecallCandidate[];
  aggregates: readonly GuardedRecallGenerationAggregate[];
}> => {
  const policy = params.policy ?? STORY_RANKING_POLICY_V1;
  const clusterByItem = clusterMembership(params.selection.clusters);
  const primaryPairs = new Set(params.primaryCandidates.map(candidatePairId));
  const counts = new Map<GuardedRecallGenerationReason, number>();
  const eligible: GuardedRecallCandidate[] = [];
  const evidence = [...params.evidence]
    .sort((left, right) => left.feedItemId.localeCompare(right.feedItemId));
  for (let leftIndex = 0; leftIndex < evidence.length; leftIndex += 1) {
    const left = evidence[leftIndex];
    if (left === undefined) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < evidence.length; rightIndex += 1) {
      const right = evidence[rightIndex];
      if (right === undefined) continue;
      const leftClusterId = clusterByItem.get(left.feedItemId);
      const rightClusterId = clusterByItem.get(right.feedItemId);
      if (leftClusterId === undefined || rightClusterId === undefined ||
          leftClusterId === rightClusterId) continue;
      const pairId = verifiedStoryRelationPairKey(left.feedItemId, right.feedItemId);
      if (primaryPairs.has(pairId)) {
        increment(counts, "excluded_existing_primary");
        continue;
      }
      if (isDeterministicCrossProviderStoryMatch(left, right, policy)) {
        increment(counts, "excluded_existing_deterministic");
        continue;
      }
      const candidate = guardedCandidate({
        left, right, leftClusterId, rightClusterId, policy,
      });
      if (candidate === undefined) {
        increment(counts, "excluded_hard_negative");
      } else {
        eligible.push(candidate);
      }
    }
  }
  const candidates: GuardedRecallCandidate[] = [];
  const clusterPairs = new Set<string>();
  for (const candidate of eligible.sort(compareCandidates)) {
    const clusterPair = canonicalClusterPair(candidate.leftClusterId,
      candidate.rightClusterId);
    if (clusterPairs.has(clusterPair)) {
      increment(counts, "excluded_cluster_pair_cap");
      continue;
    }
    if (candidates.length >= STORY_RELATION_GUARDED_RECALL_MAX_CANDIDATES) {
      increment(counts, "excluded_global_cap");
      continue;
    }
    candidates.push(candidate);
    clusterPairs.add(clusterPair);
    increment(counts, "candidate");
  }
  return {
    candidates,
    aggregates: [...counts.entries()].sort(([left], [right]) =>
      left.localeCompare(right)).map(([reasonCode, count]) => ({
        reasonCode,
        candidatePolicyVersion: STORY_RELATION_GUARDED_RECALL_POLICY_VERSION,
        count,
      })),
  };
};

export const guardedRecallCandidateStillEligible = (params: {
  readonly candidate: GuardedRecallCandidate;
  readonly evidenceById: ReadonlyMap<string, SummaryEvidenceItem>;
  readonly policy?: StoryRankingPolicy;
}): boolean => {
  const left = params.evidenceById.get(params.candidate.leftFeedItemId);
  const right = params.evidenceById.get(params.candidate.rightFeedItemId);
  if (left === undefined || right === undefined) return false;
  const rebuilt = guardedCandidate({
    left,
    right,
    leftClusterId: params.candidate.leftClusterId,
    rightClusterId: params.candidate.rightClusterId,
    policy: params.policy ?? STORY_RANKING_POLICY_V1,
  });
  return rebuilt !== undefined && rebuilt.featureDigest === params.candidate.featureDigest;
};

const guardedCandidate = (params: {
  readonly left: SummaryEvidenceItem;
  readonly right: SummaryEvidenceItem;
  readonly leftClusterId: string;
  readonly rightClusterId: string;
  readonly policy: StoryRankingPolicy;
}): GuardedRecallCandidate | undefined => {
  if (!validTime(params.left.publishedAt) || !validTime(params.right.publishedAt) ||
      Math.abs(params.left.publishedAt.getTime() - params.right.publishedAt.getTime()) >
        30 * 60 * 60 * 1000) return undefined;
  const leftSignature = storyEventSignature(params.left.title);
  const rightSignature = storyEventSignature(params.right.title);
  if (leftSignature === undefined || rightSignature === undefined) return undefined;
  const hardNegative = storyRelationHardNegative({
    left: params.left,
    right: params.right,
    policy: params.policy,
  });
  const sharedEvents = sharedExactTokens(leftSignature.eventPredicates,
    rightSignature.eventPredicates) as readonly StoryEventLemma[];
  const sharedStrongAnchors = sharedExactTokens(leftSignature.strongAnchors,
    rightSignature.strongAnchors);
  const sharedTitleTokens = sharedExactTokens(leftSignature.titleTokens,
    rightSignature.titleTokens);
  const similarity = storyTitleSimilarity(leftSignature, rightSignature);
  const eventPredicate = sharedEvents.length === 1 ? sharedEvents[0] : undefined;
  const eventRole = sharedEventRole(leftSignature.eventRoles,
    rightSignature.eventRoles);
  const anchor = eventRole?.actorAnchor ?? sharedStrongAnchors[0];
  const objectAnchor = eventRole?.objectAnchor ??
    sharedStrongAnchors.find((token) => token !== anchor);
  if (hardNegative !== undefined || eventPredicate === undefined ||
      anchor === undefined || objectAnchor === undefined ||
      similarity < 0.14 ||
      !speculativeQuestionClearedByBody(params.left, leftSignature, anchor,
        objectAnchor, eventPredicate) ||
      !speculativeQuestionClearedByBody(params.right, rightSignature, anchor,
        objectAnchor, eventPredicate)) return undefined;
  const canonical = params.left.feedItemId.localeCompare(params.right.feedItemId) <= 0
    ? params
    : {
        left: params.right,
        right: params.left,
        leftClusterId: params.rightClusterId,
        rightClusterId: params.leftClusterId,
        policy: params.policy,
      };
  const features = {
    pairId: verifiedStoryRelationPairKey(canonical.left.feedItemId,
      canonical.right.feedItemId),
    eventPredicate,
    anchor,
    objectAnchor,
    eventRole,
    sharedTitleTokens,
    similarity,
  };
  return {
    leftFeedItemId: canonical.left.feedItemId,
    rightFeedItemId: canonical.right.feedItemId,
    leftClusterId: canonical.leftClusterId,
    rightClusterId: canonical.rightClusterId,
    sharedTopicTokens: sharedTitleTokens,
    sharedAnchorTokens: sharedStrongAnchors,
    sharedEventTokens: [eventPredicate],
    sharedSpecificProductTokens: [anchor],
    topicSimilarity: similarity,
    eventPredicate,
    anchor,
    objectAnchor,
    ...(eventRole === undefined ? {} : { eventRole }),
    featureDigest: createHash("sha256").update(JSON.stringify(features), "utf8")
      .digest("hex"),
  };
};

const sharedEventRole = (
  left: readonly StoryEventRole[],
  right: readonly StoryEventRole[],
): StoryEventRole | undefined => left.find((leftRole) => right.some((rightRole) =>
  leftRole.event === rightRole.event &&
  leftRole.actorAnchor === rightRole.actorAnchor &&
  leftRole.objectAnchor === rightRole.objectAnchor &&
  leftRole.direction === rightRole.direction));

const compareCandidates = (left: GuardedRecallCandidate,
  right: GuardedRecallCandidate): number =>
  right.topicSimilarity - left.topicSimilarity ||
  right.sharedTopicTokens.length - left.sharedTopicTokens.length ||
  candidatePairId(left).localeCompare(candidatePairId(right));

const candidatePairId = (candidate: StoryRelationCandidate): string =>
  verifiedStoryRelationPairKey(candidate.leftFeedItemId,
    candidate.rightFeedItemId);
const canonicalClusterPair = (left: string, right: string): string =>
  [left, right].sort().join("\u0000");
const clusterMembership = (clusters: readonly StoryCluster[]): ReadonlyMap<string, string> => {
  const result = new Map<string, string>();
  for (const cluster of clusters) {
    for (const id of [cluster.representativeFeedItemId,
      ...cluster.duplicateFeedItemIds]) result.set(id, cluster.id);
  }
  return result;
};
const validTime = (value: Date): boolean =>
  value instanceof Date && Number.isFinite(value.getTime());
const increment = <T extends string>(counts: Map<T, number>, key: T): void => {
  counts.set(key, (counts.get(key) ?? 0) + 1);
};
