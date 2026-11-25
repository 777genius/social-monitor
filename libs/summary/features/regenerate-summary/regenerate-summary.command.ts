import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type RegenerateSummaryCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly summaryId: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
};
