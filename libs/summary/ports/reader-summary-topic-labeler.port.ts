import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

import type {
  ReaderSummaryPeriod,
  ReaderSummaryScope,
  ReaderSummaryTopicLabelPlan,
  ReaderSummaryTopicLabelCandidateOption,
  StoryCluster,
  SummaryEvidenceItem,
  TopReadCandidate,
} from "../domain";

export type ReaderSummaryTopicLabelCandidate = {
  readonly nodeId: string;
  readonly storyClusterId: string;
  readonly fallbackLabel: string;
  readonly summary?: string;
  readonly score: number;
  readonly evidenceCount: number;
  readonly providerKeys: readonly string[];
  readonly interestIds: readonly string[];
  readonly keywords: readonly string[];
  readonly labelCandidates: readonly ReaderSummaryTopicLabelCandidateOption[];
};

export type ReaderSummaryTopicLabelerInput = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scope: ReaderSummaryScope;
  readonly period: ReaderSummaryPeriod;
  readonly requestedAt: Date;
  readonly clusters: readonly StoryCluster[];
  readonly selectedEvidence: readonly SummaryEvidenceItem[];
  readonly topStories: readonly TopReadCandidate[];
  readonly candidates: readonly ReaderSummaryTopicLabelCandidate[];
};

export type ReaderSummaryTopicMapAttemptContext = {
  readonly attemptNumber: number;
  readonly totalAttempts: number;
};

export interface ReaderSummaryTopicLabelerPort {
  label(
    input: ReaderSummaryTopicLabelerInput,
    attemptContext?: ReaderSummaryTopicMapAttemptContext,
  ): Promise<ReaderSummaryTopicLabelPlan>;
}
