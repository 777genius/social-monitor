import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type SetScanPolicyCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly sourceBindingId: string;
  readonly intervalSeconds: number;
  readonly freshnessSeconds: number;
  readonly retryBudget: number;
  readonly idempotencyKey: string;
  readonly correlationId: string;
};
