import type {
  StoryRelationCandidateVerificationProof,
  StoryRelationExecutionProof,
} from "../value-objects/story-relation-verification-proof";

const executionIssuerBrand: unique symbol = Symbol("story-relation-execution-issuer");
const candidateIssuerBrand: unique symbol = Symbol("story-relation-candidate-issuer");
const verifierBrand: unique symbol = Symbol("story-relation-proof-verifier");

export type StoryRelationExecutionProofIssuer = Readonly<{
  readonly [executionIssuerBrand]: true;
}>;
export type StoryRelationCandidateProofIssuer = Readonly<{
  readonly [candidateIssuerBrand]: true;
}>;
export type StoryRelationProofVerifier = Readonly<{
  readonly [verifierBrand]: true;
}>;

export type StoryRelationProofAuthority = Readonly<{
  executionProofIssuer: StoryRelationExecutionProofIssuer;
  candidateProofIssuer: StoryRelationCandidateProofIssuer;
  proofVerifier: StoryRelationProofVerifier;
}>;

type AuthorityState = Readonly<{
  executionProofs: WeakSet<object>;
  candidateProofs: WeakSet<object>;
}>;

const executionIssuerStates = new WeakMap<object, AuthorityState>();
const candidateIssuerStates = new WeakMap<object, AuthorityState>();
const verifierStates = new WeakMap<object, AuthorityState>();
const executionProofStates = new WeakMap<object, AuthorityState>();
const candidateProofStates = new WeakMap<object, AuthorityState>();
const promotionAuthorizedCandidateProofs = new WeakSet<object>();

/**
 * Creates one process-local authority. The factory is intentionally absent from
 * the summary domain barrel and may only be imported by trusted composition or
 * focused authority tests. Proof authority is deliberately lost on restart or
 * serialization, so unverifiable recall fails closed instead of being replayed.
 */
export const createStoryRelationProofAuthority = (): StoryRelationProofAuthority => {
  const state: AuthorityState = {
    executionProofs: new WeakSet<object>(),
    candidateProofs: new WeakSet<object>(),
  };
  const executionProofIssuer = Object.freeze({}) as StoryRelationExecutionProofIssuer;
  const candidateProofIssuer = Object.freeze({}) as StoryRelationCandidateProofIssuer;
  const proofVerifier = Object.freeze({}) as StoryRelationProofVerifier;
  executionIssuerStates.set(executionProofIssuer, state);
  candidateIssuerStates.set(candidateProofIssuer, state);
  verifierStates.set(proofVerifier, state);
  return Object.freeze({ executionProofIssuer, candidateProofIssuer, proofVerifier });
};

export const issueStoryRelationExecutionProof = (
  issuer: StoryRelationExecutionProofIssuer,
  proof: StoryRelationExecutionProof,
): StoryRelationExecutionProof => {
  const state = executionIssuerStates.get(issuer);
  if (state === undefined) throw new Error("Untrusted story relation proof issuer");
  const existingState = executionProofStates.get(proof);
  if (existingState !== undefined && existingState !== state) {
    throw new Error("Story relation execution proof already has another authority");
  }
  state.executionProofs.add(proof);
  executionProofStates.set(proof, state);
  return proof;
};

export const issueStoryRelationCandidateProof = (
  issuer: StoryRelationCandidateProofIssuer,
  proof: StoryRelationCandidateVerificationProof,
): StoryRelationCandidateVerificationProof => {
  const state = candidateIssuerStates.get(issuer);
  if (state === undefined || !state.executionProofs.has(proof.executionProof)) {
    throw new Error("Story relation candidate issuer does not own the execution proof");
  }
  const existingState = candidateProofStates.get(proof);
  if (existingState !== undefined && existingState !== state) {
    throw new Error("Story relation candidate proof already has another authority");
  }
  state.candidateProofs.add(proof);
  candidateProofStates.set(proof, state);
  return proof;
};

export const authenticatesStoryRelationExecutionProof = (
  verifier: StoryRelationProofVerifier,
  proof: unknown,
): proof is StoryRelationExecutionProof => sameAuthority(
  verifierStates.get(verifier), proof, executionProofStates,
);

export const authenticatesStoryRelationCandidateProof = (
  verifier: StoryRelationProofVerifier,
  proof: unknown,
): proof is StoryRelationCandidateVerificationProof => sameAuthority(
  verifierStates.get(verifier), proof, candidateProofStates,
);

export const hasIssuedStoryRelationCandidateProof = (
  proof: unknown,
): proof is StoryRelationCandidateVerificationProof =>
  isObject(proof) && candidateProofStates.has(proof);

export const authorizeStoryRelationCandidateProofForPromotion = (
  verifier: StoryRelationProofVerifier,
  proof: StoryRelationCandidateVerificationProof,
): boolean => {
  if (!authenticatesStoryRelationCandidateProof(verifier, proof)) return false;
  promotionAuthorizedCandidateProofs.add(proof);
  return true;
};

export const hasPromotionAuthorizedStoryRelationCandidateProof = (
  proof: unknown,
): proof is StoryRelationCandidateVerificationProof =>
  isObject(proof) && promotionAuthorizedCandidateProofs.has(proof);

const sameAuthority = <T extends object>(
  verifierState: AuthorityState | undefined,
  value: unknown,
  proofStates: WeakMap<object, AuthorityState>,
): value is T => isObject(value) && verifierState !== undefined &&
  proofStates.get(value) === verifierState;

const isObject = (value: unknown): value is object =>
  value !== null && typeof value === "object";
