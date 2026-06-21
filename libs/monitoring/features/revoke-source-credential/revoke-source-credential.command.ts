import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type RevokeSourceCredentialCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly sourceCredentialId: string;
};
