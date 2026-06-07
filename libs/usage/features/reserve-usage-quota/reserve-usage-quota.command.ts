import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type ReserveUsageQuotaUseCaseCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly subjectKey: string;
  readonly operation: string;
  readonly amount: number;
  readonly limit: number;
  readonly windowSeconds: number;
};
