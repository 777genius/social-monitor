import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type RequestScanCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly sourceBindingId: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
};
