import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { ApiKey } from '../domain';

export interface ApiKeyRepositoryPort {
  save(apiKey: ApiKey): Promise<void>;
  findById(params: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly apiKeyId: string;
  }): Promise<ApiKey | null>;
  findByKeyPrefix(params: { readonly keyPrefix: string }): Promise<ApiKey | null>;
}
