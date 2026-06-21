import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type ListSourceCredentialsQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly providerKey?: string;
  readonly limit: number;
  readonly cursor?: string;
};
