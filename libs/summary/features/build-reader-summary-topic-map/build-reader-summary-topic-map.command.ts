import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

import type {
  ReaderSummaryCitation,
  ReaderSummaryPeriod,
  ReaderSummaryScope,
  ReaderSummaryTopicMapEvidenceAdmission,
  StoryCluster,
  SummaryEvidenceItem,
  TopReadCandidate,
} from "../../domain";

export type BuildReaderSummaryTopicMapCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scope: ReaderSummaryScope;
  readonly period: ReaderSummaryPeriod;
  readonly requestedAt: Date;
  readonly evidenceAdmission: ReaderSummaryTopicMapEvidenceAdmission;
  readonly clusters: readonly StoryCluster[];
  readonly selectedEvidence: readonly SummaryEvidenceItem[];
  readonly topStories: readonly TopReadCandidate[];
  readonly citationMap: readonly ReaderSummaryCitation[];
};
