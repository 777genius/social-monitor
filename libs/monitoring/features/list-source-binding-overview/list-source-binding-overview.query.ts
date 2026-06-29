import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type ListSourceBindingOverviewQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly interestId: string;
  readonly limit: number;
  readonly cursor?: string;
  readonly providerKeys?: readonly string[];
  readonly statuses?: readonly string[];
};
