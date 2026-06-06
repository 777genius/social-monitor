import type { ApiKey } from '../../domain';
import type { ApiKeyRepositoryPort } from '../../ports';

export class InMemoryApiKeyRepository implements ApiKeyRepositoryPort {
  private readonly keysById = new Map<string, ApiKey>();
  private readonly keysByPrefix = new Map<string, ApiKey>();

  async save(apiKey: ApiKey): Promise<void> {
    const snapshot = apiKey.toSnapshot();

    this.keysById.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`, apiKey);
    this.keysByPrefix.set(snapshot.keyPrefix, apiKey);
  }

  async findById(params: Parameters<ApiKeyRepositoryPort['findById']>[0]): Promise<ApiKey | null> {
    return this.keysById.get(`${params.tenantId}:${params.workspaceId}:${params.apiKeyId}`) ?? null;
  }

  async findByKeyPrefix(params: { readonly keyPrefix: string }): Promise<ApiKey | null> {
    return this.keysByPrefix.get(params.keyPrefix) ?? null;
  }
}
