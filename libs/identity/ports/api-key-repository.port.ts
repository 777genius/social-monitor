import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { ApiKey } from '../domain';

export type ListApiKeysQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly limit: number;
  readonly cursor?: string;
};

export type ListApiKeysResult = {
  readonly apiKeys: readonly ApiKey[];
  readonly nextCursor?: string;
};

export interface ApiKeyRepositoryPort {
  save(apiKey: ApiKey): Promise<void>;
  findById(params: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly apiKeyId: string;
  }): Promise<ApiKey | null>;
  findByKeyPrefix(params: { readonly keyPrefix: string }): Promise<ApiKey | null>;
  list(query: ListApiKeysQuery): Promise<ListApiKeysResult>;
}
