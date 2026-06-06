import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type RequestSummaryCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly topicId: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
};
