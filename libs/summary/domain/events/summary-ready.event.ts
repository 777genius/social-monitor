import type { EventEnvelope, TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { SummaryJobStatus } from '../entities/summary-job';

export type SummaryReadyPayload = {
  readonly summaryJobId: string;
  readonly summaryId: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly topicId: string;
  readonly status: Extract<SummaryJobStatus, 'completed' | 'no_signal'>;
};

export type SummaryReadyEvent = EventEnvelope<SummaryReadyPayload>;
