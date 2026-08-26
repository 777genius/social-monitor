import type {
  StoryRelationCandidateVerificationProof,
  StoryRelationExecutionProof,
} from "../value-objects/story-relation-verification-proof";

const authenticatedExecutionProofs = new WeakSet<object>();
const authenticatedCandidateProofs = new WeakSet<object>();

/**
 * Records the result of the trusted verifier port's authenticated execution
 * check. This module is deliberately internal to the summary context: raw
 * proof bytes cannot recreate the object authority recorded here.
 */
export const bindAuthenticatedStoryRelationExecutionProof = (
  proof: StoryRelationExecutionProof,
): StoryRelationExecutionProof => {
  authenticatedExecutionProofs.add(proof);
  return proof;
};

export const hasAuthenticatedStoryRelationExecutionProof = (
  proof: unknown,
): proof is StoryRelationExecutionProof =>
  isObject(proof) && authenticatedExecutionProofs.has(proof);

export const bindAuthenticatedStoryRelationCandidateProof = (
  proof: StoryRelationCandidateVerificationProof,
): StoryRelationCandidateVerificationProof => {
  authenticatedCandidateProofs.add(proof);
  return proof;
};

export const hasAuthenticatedStoryRelationCandidateProof = (
  proof: unknown,
): proof is StoryRelationCandidateVerificationProof =>
  isObject(proof) && authenticatedCandidateProofs.has(proof);

const isObject = (value: unknown): value is object =>
  value !== null && typeof value === "object";
