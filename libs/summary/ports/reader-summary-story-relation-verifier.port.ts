import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

import type {
  ReaderSummaryPeriod,
  ReaderSummaryScope,
  RelatedTopicCandidate,
  StoryCluster,
  StoryRelationCandidate,
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
  /** Omitted for the unchanged production verification lane. */
  readonly verificationLane?: "safe_recall_shadow" | "related_topic";
  /** Shadow callers provide their independent execution bound. */
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
};

export interface ReaderSummaryStoryRelationVerifierPort {
  verify(
    input: ReaderSummaryStoryRelationVerifierInput,
  ): Promise<readonly unknown[]>;
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
    verify: async () => [],
  };
