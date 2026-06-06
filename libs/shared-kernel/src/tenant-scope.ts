import { DomainError } from './domain-error';
import { tenantId, type TenantId, workspaceId, type WorkspaceId } from './ids';

export type TenantScope = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
};

export const requireTenantScope = (params: {
  readonly tenantIdHeader: string | undefined;
  readonly workspaceIdHeader: string | undefined;
}): TenantScope => {
  if (params.tenantIdHeader === undefined || params.tenantIdHeader.trim().length === 0) {
    throw new DomainError('tenant.scope_missing', 'x-tenant-id header is required');
  }

  if (params.workspaceIdHeader === undefined || params.workspaceIdHeader.trim().length === 0) {
    throw new DomainError('tenant.scope_missing', 'x-workspace-id header is required');
  }

  return {
    tenantId: tenantId(params.tenantIdHeader),
    workspaceId: workspaceId(params.workspaceIdHeader),
  };
};
