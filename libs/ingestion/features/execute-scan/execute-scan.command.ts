import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type ExecuteScanCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scanJobId: string;
  readonly sourceBindingId: string;
  readonly scanPolicyId: string;
  readonly correlationId: string;
  readonly causationId: string;
  readonly attemptNumber?: number;
  readonly retryBudget?: number;
};
