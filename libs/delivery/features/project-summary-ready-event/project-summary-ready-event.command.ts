import type { EventEnvelope, TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type SummaryReadyProjectionPayload = {
  readonly summaryJobId: string;
  readonly summaryId: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly topicId: string;
  readonly status: 'completed' | 'no_signal';
};

export type ProjectSummaryReadyEventCommand = {
  readonly event: EventEnvelope<SummaryReadyProjectionPayload>;
};
