export const STORY_RELATION_EXECUTION_PROOF_VERSION =
  "reader_summary.story_relation.execution_proof.v2" as const;
export const STORY_RELATION_VERIFIER_IMPLEMENTATION =
  "agent_runtime_reader_summary_story_relation_verifier.v1" as const;

export type StoryRelationRuntimeExecutionAttestation = Readonly<{
  schemaVersion: 1;
  requestId: string;
  purpose: string;
  canonicalRequestSha256: string;
  provider: "codex" | "claude";
  model: string;
  reasoningEffort: string;
  runtimeEngine: "subscription-runtime-cli";
  runtimePackageVersion: string;
  launcherSha256: string;
  selectedOutputKind: "structured_output" | "output_text";
  selectedOutputSha256: string;
}>;

export type StoryRelationCandidateProofBinding = Readonly<{
  shortlistRank: number;
  canonicalPairId: string;
  featureDigest: string;
}>;

export type StoryRelationDecisionProofBinding = Readonly<
  | { valid: false; decisionSha256: string }
  | {
      valid: true;
      canonicalPairId: string;
      sameStory: boolean;
      confidenceScore: number;
      decisionSha256: string;
    }
>;

export type StoryRelationExecutionProof = Readonly<{
  proofVersion: typeof STORY_RELATION_EXECUTION_PROOF_VERSION;
  verificationLane: "semantic_primary" | "guarded_recall_primary";
  verifierImplementation: typeof STORY_RELATION_VERIFIER_IMPLEMENTATION;
  verifierPolicy: Readonly<{
    promptVersion: string;
    provider: "codex";
    model: "gpt-5.6-sol";
    reasoningEffort: "high";
    purpose: "social_monitor.reader_summary.verify_story_relations.v2";
  }>;
  rankingPolicyVersion: string;
  selectionSha256: string;
  candidateBindings: readonly StoryRelationCandidateProofBinding[];
  decisionBindings: readonly StoryRelationDecisionProofBinding[];
  normalizedOutputSha256: string;
  executionAttestation: StoryRelationRuntimeExecutionAttestation;
  executionAttestationSha256: string;
  selectedOutputSha256: string;
  proofSha256: string;
}>;

export type StoryRelationCandidateVerificationProof = Readonly<{
  executionProof: StoryRelationExecutionProof;
  canonicalPairId: string;
  featureDigest: string;
  normalizedDecision: Readonly<{
    sameStory: true;
    confidenceScore: number;
  }>;
  candidateProofSha256: string;
}>;
