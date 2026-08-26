import { createHash } from "node:crypto";

import type { StoryRelationCandidate, StoryRelationDecision } from
  "./story-relation-candidates";
import { verifiedStoryRelationPairKey } from "./story-cluster-membership";
import {
  STORY_RELATION_EXECUTION_PROOF_VERSION,
  STORY_RELATION_VERIFIER_IMPLEMENTATION,
  type StoryRelationCandidateProofBinding,
  type StoryRelationCandidateVerificationProof,
  type StoryRelationDecisionProofBinding,
  type StoryRelationExecutionProof,
  type StoryRelationRuntimeExecutionAttestation,
} from "../value-objects/story-relation-verification-proof";
import type { SummarySourceWindow } from
  "../value-objects/summary-evidence-item";
import {
  bindAuthenticatedStoryRelationCandidateProof,
  hasAuthenticatedStoryRelationCandidateProof,
  hasAuthenticatedStoryRelationExecutionProof,
} from "./story-relation-proof-authority";

export type StoryRelationProofSelectionContext = Readonly<{
  rankingPolicyVersion: string;
  sourceWindow: SummarySourceWindow;
}>;

export const storyRelationCandidateFeatureDigest = (
  candidate: StoryRelationCandidate,
): string => canonicalSha256({
  canonicalPairId: candidatePairId(candidate),
  leftClusterId: candidate.leftClusterId,
  rightClusterId: candidate.rightClusterId,
  sharedTopicTokens: candidate.sharedTopicTokens,
  sharedAnchorTokens: candidate.sharedAnchorTokens,
  sharedEventTokens: candidate.sharedEventTokens,
  sharedSpecificProductTokens: candidate.sharedSpecificProductTokens,
  topicSimilarity: candidate.topicSimilarity,
  ...guardedCandidateFeatures(candidate),
});

export const storyRelationSelectionSha256 = (
  context: StoryRelationProofSelectionContext,
): string => canonicalSha256({
  rankingPolicyVersion: context.rankingPolicyVersion,
  sourceWindow: {
    windowId: context.sourceWindow.windowId,
    startedAt: iso(context.sourceWindow.startedAt),
    endedAt: iso(context.sourceWindow.endedAt),
    selectedFeedItemIds: context.sourceWindow.selectedFeedItemIds,
    storyClusterIds: context.sourceWindow.storyClusterIds,
    ...(context.sourceWindow.periodStartedAt === undefined ? {} : {
      periodStartedAt: iso(context.sourceWindow.periodStartedAt),
    }),
    ...(context.sourceWindow.periodEndedAt === undefined ? {} : {
      periodEndedAt: iso(context.sourceWindow.periodEndedAt),
    }),
    ...(context.sourceWindow.ingestionCutoff === undefined ? {} : {
      ingestionCutoff: iso(context.sourceWindow.ingestionCutoff),
    }),
  },
});

export const storyRelationCandidateProofBindings = (
  candidates: readonly StoryRelationCandidate[],
): readonly StoryRelationCandidateProofBinding[] => candidates.map(
  (candidate, index) => ({
    shortlistRank: index + 1,
    canonicalPairId: candidatePairId(candidate),
    leftFeedItemId: candidate.leftFeedItemId,
    rightFeedItemId: candidate.rightFeedItemId,
    featureDigest: storyRelationCandidateFeatureDigest(candidate),
  }));

export const storyRelationDecisionProofBindings = (
  decisions: readonly unknown[],
): readonly StoryRelationDecisionProofBinding[] => decisions.map((decision) => {
  const decisionSha256 = canonicalSha256(decision);
  if (!validDecisionOutcome(decision)) {
    return { valid: false, decisionSha256 };
  }
  return {
    valid: true,
    canonicalPairId: verifiedStoryRelationPairKey(
      decision.leftFeedItemId.trim(), decision.rightFeedItemId.trim()),
    leftFeedItemId: decision.leftFeedItemId.trim(),
    rightFeedItemId: decision.rightFeedItemId.trim(),
    sameStory: decision.sameStory,
    confidenceScore: decision.confidenceScore,
    decisionSha256,
  };
});

export const buildStoryRelationExecutionProof = (params: {
  readonly verificationLane: StoryRelationExecutionProof["verificationLane"];
  readonly promptVersion: string;
  readonly selection: StoryRelationProofSelectionContext;
  readonly candidates: readonly StoryRelationCandidate[];
  readonly decisions: readonly unknown[];
  readonly normalizedOutputSha256: string;
  readonly executionAttestation: StoryRelationRuntimeExecutionAttestation;
  readonly executionAttestationSha256: string;
  readonly selectedOutputSha256: string;
}): StoryRelationExecutionProof => {
  const body = {
    proofVersion: STORY_RELATION_EXECUTION_PROOF_VERSION,
    verificationLane: params.verificationLane,
    verifierImplementation: STORY_RELATION_VERIFIER_IMPLEMENTATION,
    verifierPolicy: {
      promptVersion: params.promptVersion,
      provider: "codex" as const,
      model: "gpt-5.6-sol" as const,
      reasoningEffort: "high" as const,
      purpose: "social_monitor.reader_summary.verify_story_relations.v2" as const,
    },
    rankingPolicyVersion: params.selection.rankingPolicyVersion,
    selectionSha256: storyRelationSelectionSha256(params.selection),
    candidateBindings: storyRelationCandidateProofBindings(params.candidates),
    decisionBindings: storyRelationDecisionProofBindings(params.decisions),
    normalizedOutputSha256: params.normalizedOutputSha256,
    executionAttestation: params.executionAttestation,
    executionAttestationSha256: params.executionAttestationSha256,
    selectedOutputSha256: params.selectedOutputSha256,
  };
  return deepFreeze({ ...body, proofSha256: canonicalSha256(body) });
};

export const buildStoryRelationCandidateVerificationProof = (params: {
  readonly executionProof: StoryRelationExecutionProof;
  readonly canonicalPairId: string;
  readonly leftFeedItemId: string;
  readonly rightFeedItemId: string;
  readonly featureDigest: string;
  readonly confidenceScore: number;
}): StoryRelationCandidateVerificationProof => {
  const body = {
    executionProof: params.executionProof,
    canonicalPairId: params.canonicalPairId,
    leftFeedItemId: params.leftFeedItemId,
    rightFeedItemId: params.rightFeedItemId,
    featureDigest: params.featureDigest,
    normalizedDecision: {
      sameStory: true as const,
      confidenceScore: params.confidenceScore,
    },
  };
  if (!hasAuthenticatedStoryRelationExecutionProof(params.executionProof)) {
    throw new Error("Story relation execution proof has no trusted authority");
  }
  const proof = deepFreeze({
    ...body,
    candidateProofSha256: canonicalSha256(body),
  });
  bindAuthenticatedStoryRelationCandidateProof(proof);
  if (!validStoryRelationCandidateVerificationProof(proof)) {
    throw new Error("Story relation candidate proof is not execution-bound");
  }
  return proof;
};

export const validStoryRelationCandidateVerificationProof = (
  value: unknown,
): value is StoryRelationCandidateVerificationProof => {
  if (!record(value) || !record(value.executionProof) ||
      !nonBlank(value.canonicalPairId) || !nonBlank(value.leftFeedItemId) ||
      !nonBlank(value.rightFeedItemId) || !isSha256(value.featureDigest) ||
      !record(value.normalizedDecision) ||
      value.normalizedDecision.sameStory !== true ||
      typeof value.normalizedDecision.confidenceScore !== "number" ||
      !Number.isFinite(value.normalizedDecision.confidenceScore) ||
      !isSha256(value.candidateProofSha256) ||
      !validStoryRelationExecutionProof({ proof: value.executionProof }) ||
      !hasAuthenticatedStoryRelationExecutionProof(value.executionProof) ||
      !hasAuthenticatedStoryRelationCandidateProof(value)) {
    return false;
  }
  const proof = value as StoryRelationCandidateVerificationProof;
  const { candidateProofSha256, ...body } = proof;
  return candidateProofSha256 === canonicalSha256(body) &&
    proof.executionProof.candidateBindings.some((candidate) =>
      candidate.canonicalPairId === proof.canonicalPairId &&
      candidate.leftFeedItemId === proof.leftFeedItemId &&
      candidate.rightFeedItemId === proof.rightFeedItemId &&
      candidate.featureDigest === proof.featureDigest) &&
    proof.executionProof.decisionBindings.some((decision) => decision.valid &&
      decision.canonicalPairId === proof.canonicalPairId &&
      decision.leftFeedItemId === proof.leftFeedItemId &&
      decision.rightFeedItemId === proof.rightFeedItemId && decision.sameStory &&
      decision.confidenceScore === proof.normalizedDecision.confidenceScore);
};

export const validStoryRelationExecutionProof = (params: {
  readonly proof: unknown;
  readonly verificationLane?: StoryRelationExecutionProof["verificationLane"];
  readonly selection?: StoryRelationProofSelectionContext;
  readonly candidates?: readonly StoryRelationCandidate[];
  readonly decisions?: readonly unknown[];
  readonly expectedRequestId?: string;
}): boolean => {
  if (!isProof(params.proof)) return false;
  const proof = params.proof;
  const { proofSha256, ...body } = proof;
  if (proofSha256 !== canonicalSha256(body) ||
      proof.executionAttestationSha256 !==
        canonicalSha256(proof.executionAttestation) ||
      !validRuntimeAttestation(proof) ||
      (params.expectedRequestId !== undefined &&
        proof.executionAttestation.requestId !== params.expectedRequestId) ||
      (params.verificationLane !== undefined &&
        proof.verificationLane !== params.verificationLane)) return false;
  if (params.selection !== undefined &&
      (proof.rankingPolicyVersion !== params.selection.rankingPolicyVersion ||
       proof.selectionSha256 !== storyRelationSelectionSha256(params.selection))) {
    return false;
  }
  if (params.candidates !== undefined && canonicalSha256(
    proof.candidateBindings) !== canonicalSha256(
      storyRelationCandidateProofBindings(params.candidates))) return false;
  if (params.decisions !== undefined && (proof.normalizedOutputSha256 !==
      canonicalSha256(params.decisions) || canonicalSha256(
        proof.decisionBindings) !== canonicalSha256(
          storyRelationDecisionProofBindings(params.decisions)))) return false;
  return true;
};

export const storyRelationExecutionRequestId = (params: {
  readonly tenantId: unknown;
  readonly workspaceId: unknown;
  readonly scopeKey: string;
  readonly requestedAt: Date;
  readonly verificationLane: "semantic_primary" | "guarded_recall_primary";
  readonly selection: StoryRelationProofSelectionContext;
  readonly candidates: readonly StoryRelationCandidate[];
}): string => {
  const digest = lengthDelimitedSha256([
    "reader-summary-story-relations.request-identity.v2",
    String(params.tenantId),
    String(params.workspaceId),
    params.scopeKey,
    iso(params.requestedAt),
    params.verificationLane,
    storyRelationSelectionSha256(params.selection),
    canonicalSha256(storyRelationCandidateProofBindings(params.candidates)),
  ]);
  return `reader-summary-story-relations:v2:${digest}`;
};

export const canonicalStoryRelationProofSha256 = (value: unknown): string =>
  canonicalSha256(value);

const validRuntimeAttestation = (proof: StoryRelationExecutionProof): boolean => {
  const attestation = proof.executionAttestation;
  return attestation.schemaVersion === 1 && nonBlank(attestation.requestId) &&
    attestation.purpose === proof.verifierPolicy.purpose &&
    attestation.provider === proof.verifierPolicy.provider &&
    attestation.model === proof.verifierPolicy.model &&
    attestation.reasoningEffort === proof.verifierPolicy.reasoningEffort &&
    attestation.runtimeEngine === "subscription-runtime-cli" &&
    /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u
      .test(attestation.runtimePackageVersion) &&
    attestation.selectedOutputKind === "structured_output" &&
    attestation.selectedOutputSha256 === proof.selectedOutputSha256 &&
    [attestation.canonicalRequestSha256, attestation.launcherSha256,
      attestation.selectedOutputSha256, proof.normalizedOutputSha256,
      proof.selectionSha256, proof.executionAttestationSha256,
      proof.proofSha256].every(isSha256);
};

const isProof = (value: unknown): value is StoryRelationExecutionProof => {
  if (!record(value) || value.proofVersion !==
      STORY_RELATION_EXECUTION_PROOF_VERSION || value.verifierImplementation !==
      STORY_RELATION_VERIFIER_IMPLEMENTATION || !record(value.verifierPolicy) ||
      !record(value.executionAttestation) ||
      !Array.isArray(value.candidateBindings) ||
      !Array.isArray(value.decisionBindings)) return false;
  const keys = Object.keys(value).sort();
  return canonicalSha256(keys) === canonicalSha256(proofKeys) &&
    (value.verificationLane === "semantic_primary" ||
      value.verificationLane === "guarded_recall_primary") &&
    nonBlank(value.verifierPolicy.promptVersion) &&
    value.verifierPolicy.provider === "codex" &&
    value.verifierPolicy.model === "gpt-5.6-sol" &&
    value.verifierPolicy.reasoningEffort === "high" &&
    value.verifierPolicy.purpose ===
      "social_monitor.reader_summary.verify_story_relations.v2" &&
    nonBlank(value.rankingPolicyVersion) &&
    uniqueCandidateBindings(value.candidateBindings) &&
    value.decisionBindings.every(validDecisionBinding);
};

const validDecisionOutcome = (value: unknown): value is StoryRelationDecision =>
  record(value) && typeof value.leftFeedItemId === "string" &&
  value.leftFeedItemId.trim() !== "" && typeof value.rightFeedItemId === "string" &&
  value.rightFeedItemId.trim() !== "" && typeof value.sameStory === "boolean" &&
  typeof value.confidenceScore === "number" &&
  Number.isFinite(value.confidenceScore) && value.confidenceScore >= 0 &&
  value.confidenceScore <= 1;

const validDecisionBinding = (value: unknown): boolean => record(value) &&
  isSha256(value.decisionSha256) && (value.valid === false ||
    (value.valid === true && nonBlank(value.canonicalPairId) &&
      nonBlank(value.leftFeedItemId) && nonBlank(value.rightFeedItemId) &&
      value.canonicalPairId === verifiedStoryRelationPairKey(
        value.leftFeedItemId, value.rightFeedItemId) &&
      typeof value.sameStory === "boolean" &&
      typeof value.confidenceScore === "number" &&
      Number.isFinite(value.confidenceScore) && value.confidenceScore >= 0 &&
      value.confidenceScore <= 1));

const uniqueCandidateBindings = (values: readonly unknown[]): boolean => {
  const pairs = new Set<string>();
  return values.every((value, index) => {
    if (!record(value) || value.shortlistRank !== index + 1 ||
        !nonBlank(value.canonicalPairId) || !nonBlank(value.leftFeedItemId) ||
        !nonBlank(value.rightFeedItemId) || value.leftFeedItemId ===
          value.rightFeedItemId || value.canonicalPairId !==
          verifiedStoryRelationPairKey(value.leftFeedItemId,
            value.rightFeedItemId) || !isSha256(value.featureDigest) ||
        pairs.has(value.canonicalPairId)) return false;
    pairs.add(value.canonicalPairId);
    return true;
  });
};

const guardedCandidateFeatures = (
  candidate: StoryRelationCandidate,
): Record<string, unknown> => {
  const value = candidate as StoryRelationCandidate & Record<string, unknown>;
  return {
    ...(typeof value.eventPredicate === "string"
      ? { eventPredicate: value.eventPredicate } : {}),
    ...(typeof value.anchor === "string" ? { anchor: value.anchor } : {}),
    ...(typeof value.objectAnchor === "string"
      ? { objectAnchor: value.objectAnchor } : {}),
    ...(record(value.eventRole) ? { eventRole: value.eventRole } : {}),
  };
};

const candidatePairId = (candidate: StoryRelationCandidate): string =>
  verifiedStoryRelationPairKey(candidate.leftFeedItemId,
    candidate.rightFeedItemId);
const iso = (value: Date): string => {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error("Story relation proof date is invalid");
  }
  return value.toISOString();
};
const nonBlank = (value: unknown): value is string =>
  typeof value === "string" && value.trim() !== "";
const isSha256 = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const proofKeys = ["candidateBindings", "decisionBindings",
  "executionAttestation", "executionAttestationSha256", "normalizedOutputSha256",
  "proofSha256", "proofVersion", "rankingPolicyVersion", "selectedOutputSha256",
  "selectionSha256", "verificationLane", "verifierImplementation",
  "verifierPolicy"].sort();

const canonicalSha256 = (value: unknown): string => createHash("sha256")
  .update(JSON.stringify(canonicalValue(value)), "utf8").digest("hex");
const lengthDelimitedSha256 = (parts: readonly string[]): string => {
  const hash = createHash("sha256");
  for (const part of parts) {
    const bytes = Buffer.from(part, "utf8");
    const length = Buffer.allocUnsafe(4);
    length.writeUInt32BE(bytes.length);
    hash.update(length);
    hash.update(bytes);
  }
  return hash.digest("hex");
};

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach((item) => deepFreeze(item));
  }
  return value;
};
const canonicalValue = (value: unknown): unknown => {
  if (value === null || typeof value === "string" ||
      typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Proof value is not finite");
    return value;
  }
  if (Array.isArray(value)) return value.map((item) =>
    item === undefined ? null : canonicalValue(item));
  if (record(value)) return Object.fromEntries(Object.entries(value)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [key, canonicalValue(item)]));
  throw new Error("Proof value is not canonical JSON");
};
