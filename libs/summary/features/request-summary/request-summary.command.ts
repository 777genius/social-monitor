import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type RequestSummaryCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly interestId: string;
  readonly userId?: string;
  readonly subscriptionId?: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
};
