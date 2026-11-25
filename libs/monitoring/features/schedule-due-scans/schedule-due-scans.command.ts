import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type ScheduleDueScansCommand = {
  readonly tenantId?: TenantId;
  readonly workspaceId?: WorkspaceId;
  readonly limit: number;
  readonly correlationId: string;
  readonly includeDecisions?: boolean;
};
