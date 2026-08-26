import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

import type {
  ReaderSummaryPeriod,
  ReaderSummaryScope,
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
  readonly candidates: readonly StoryRelationCandidate[];
};

export interface ReaderSummaryStoryRelationVerifierPort {
  verify(
    input: ReaderSummaryStoryRelationVerifierInput,
  ): Promise<readonly StoryRelationDecision[]>;
}

export const NOOP_READER_SUMMARY_STORY_RELATION_VERIFIER: ReaderSummaryStoryRelationVerifierPort =
  {
    verify: async () => [],
  };
