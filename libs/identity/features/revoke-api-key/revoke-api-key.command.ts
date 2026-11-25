import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type RevokeApiKeyCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly apiKeyId: string;
};
