import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type ListSourceBindingScansQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly sourceBindingId: string;
  readonly limit: number;
  readonly cursor?: string;
  readonly statuses?: readonly string[];
};
