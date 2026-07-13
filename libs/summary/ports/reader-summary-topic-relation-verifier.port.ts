import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

import type {
  ReaderSummaryPeriod,
  ReaderSummaryScope,
  ReaderSummaryTopicLabelPlan,
  ReaderSummaryTopicRelationCandidate,
  ReaderSummaryTopicRelationDecision,
  StoryCluster,
  SummaryEvidenceItem,
} from "../domain";
import type {
  ReaderSummaryTopicLabelCandidate,
  ReaderSummaryTopicMapAttemptContext,
} from "./reader-summary-topic-labeler.port";

export type ReaderSummaryTopicRelationVerifierInput = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scope: ReaderSummaryScope;
  readonly period: ReaderSummaryPeriod;
  readonly requestedAt: Date;
  readonly clusters: readonly StoryCluster[];
  readonly selectedEvidence: readonly SummaryEvidenceItem[];
  readonly candidates: readonly ReaderSummaryTopicLabelCandidate[];
  readonly labelPlan: ReaderSummaryTopicLabelPlan;
  readonly relations: readonly ReaderSummaryTopicRelationCandidate[];
};

export interface ReaderSummaryTopicRelationVerifierPort {
  verify(
    input: ReaderSummaryTopicRelationVerifierInput,
    attemptContext?: ReaderSummaryTopicMapAttemptContext,
  ): Promise<readonly ReaderSummaryTopicRelationDecision[]>;
}
