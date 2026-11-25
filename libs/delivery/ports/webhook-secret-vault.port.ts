import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type WebhookSecretScope = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly secretKeyId: string;
};

export interface WebhookSecretVaultPort {
  put(params: WebhookSecretScope & { readonly secret: string }): Promise<void>;
  get(params: WebhookSecretScope): Promise<string | null>;
}
