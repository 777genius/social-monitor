import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type DigestCandidateSummary = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly summaryId: string;
  readonly topicId: string;
  readonly sourceWindowStartedAt: Date;
  readonly sourceWindowEndedAt: Date;
  readonly signal: 'high' | 'normal' | 'low' | 'no_signal';
};

export type DigestCandidateFeedItem = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly feedItemId: string;
  readonly topicId: string;
  readonly observedAt: Date;
  readonly signal: 'high' | 'normal' | 'low';
};

export type DigestSourceWindowQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly topicIds: readonly string[];
  readonly startedAt: Date;
  readonly endedAt: Date;
};

export type DigestSourceWindowResult = {
  readonly summaries: readonly DigestCandidateSummary[];
  readonly feedItems: readonly DigestCandidateFeedItem[];
};

export interface DigestSourceReaderPort {
  readWindow(query: DigestSourceWindowQuery): Promise<DigestSourceWindowResult>;
}
