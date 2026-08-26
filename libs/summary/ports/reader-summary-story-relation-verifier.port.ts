import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

import type {
  ReaderSummaryPeriod,
  ReaderSummaryScope,
  RelatedTopicVerdict,
  RelatedTopicCandidate,
  StoryCluster,
  StoryRelationCandidate,
  StoryRelationDecision,
  SummaryEvidenceItem,
} from "../domain";

export type ReaderSummaryStoryRelationVerifierInput = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scope: ReaderSummaryScope;
  readonly period: ReaderSummaryPeriod;
  readonly requestedAt: Date;
  readonly clusters: readonly StoryCluster[];
  readonly evidence: readonly SummaryEvidenceItem[];
  readonly candidates: readonly (StoryRelationCandidate | RelatedTopicCandidate)[];
  readonly verificationLane:
    | "semantic_primary"
    | "guarded_recall_primary"
    | "related_topic";
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
};

export type VerifiedStoryRelationExecutionProof = Readonly<{
  normalizedOutputSha256: string;
  executionAttestationSha256: string;
  selectedOutputSha256: string;
}>;

export type VerifiedStoryRelationDecisionBatch = Readonly<{
  verificationLane: ReaderSummaryStoryRelationVerifierInput["verificationLane"];
  decisions: readonly (StoryRelationDecision | RelatedTopicVerdict)[];
  proof: VerifiedStoryRelationExecutionProof;
}>;

export interface ReaderSummaryStoryRelationVerifierPort {
  /** Only the certified agent-runtime adapter may opt into guarded primary recall. */
  readonly guardedPrimaryRecallCertification?: "agent_runtime_attested_v1";
  verify(
    input: ReaderSummaryStoryRelationVerifierInput,
  ): Promise<VerifiedStoryRelationDecisionBatch>;
}

export type InvalidStoryRelationDecisionEnvelopeReason =
  | "envelope_invalid_shape"
  | "envelope_missing_decisions"
  | "envelope_unknown_property";

export class InvalidStoryRelationDecisionBatchError extends Error {
  constructor(
    readonly reason: InvalidStoryRelationDecisionEnvelopeReason,
  ) {
    super(`Reader summary story relation response rejected: ${reason}`);
    this.name = "InvalidStoryRelationDecisionBatchError";
  }
}

export const NOOP_READER_SUMMARY_STORY_RELATION_VERIFIER: ReaderSummaryStoryRelationVerifierPort =
  {
    verify: async (input) => ({
      verificationLane: input.verificationLane,
      decisions: [],
      proof: {
        normalizedOutputSha256: "0".repeat(64),
        executionAttestationSha256: "0".repeat(64),
        selectedOutputSha256: "0".repeat(64),
      },
    }),
  };
