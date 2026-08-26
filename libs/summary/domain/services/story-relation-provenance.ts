import type { ApprovedSameStoryRelation } from
  "../value-objects/summary-evidence-item";
import { STORY_RELATION_APPROVAL_CONFIDENCE_MIN } from
  "./story-relation-candidates";
import { STORY_RELATION_CANDIDATE_POLICY_VERSION } from
  "./story-relation-decision-trace";
import {
  STORY_RELATION_GUARDED_RECALL_CONFIDENCE_MIN,
  STORY_RELATION_GUARDED_RECALL_POLICY_VERSION,
} from "./story-relation-guarded-recall";
import { verifiedStoryRelationPairKey } from "./story-cluster-membership";

export const hasValidStoryRelationProvenance = (
  relation: ApprovedSameStoryRelation,
): boolean => {
  if (!nonBlank(relation.leftFeedItemId) ||
      !nonBlank(relation.rightFeedItemId) ||
      !nonBlank(relation.canonicalPairId) ||
      !nonBlank(relation.rankingPolicyVersion)) return false;
  const minimumConfidence = relation.verificationLane === "guarded_recall_primary"
    ? STORY_RELATION_GUARDED_RECALL_CONFIDENCE_MIN
    : relation.verificationLane === "semantic_primary"
      ? STORY_RELATION_APPROVAL_CONFIDENCE_MIN
      : undefined;
  const expectedCandidatePolicy = relation.verificationLane ===
      "guarded_recall_primary"
    ? STORY_RELATION_GUARDED_RECALL_POLICY_VERSION
    : relation.verificationLane === "semantic_primary"
      ? STORY_RELATION_CANDIDATE_POLICY_VERSION
      : undefined;
  return minimumConfidence !== undefined && expectedCandidatePolicy !== undefined &&
    relation.canonicalPairId === verifiedStoryRelationPairKey(
      relation.leftFeedItemId, relation.rightFeedItemId) &&
    relation.leftFeedItemId !== relation.rightFeedItemId &&
    Number.isFinite(relation.confidence) && relation.confidence >= minimumConfidence &&
    relation.confidence <= 1 && relation.candidatePolicyVersion ===
      expectedCandidatePolicy &&
    [relation.featureDigest, relation.executionAttestationSha256,
      relation.normalizedOutputSha256, relation.selectedOutputSha256]
      .every((hash) => typeof hash === "string" &&
        /^[0-9a-f]{64}$/u.test(hash));
};

const nonBlank = (value: unknown): value is string =>
  typeof value === "string" && value.trim() !== "";
