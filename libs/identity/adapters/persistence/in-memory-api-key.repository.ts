import type { ApiKey } from '../../domain';
import type { ApiKeyRepositoryPort, ListApiKeysQuery, ListApiKeysResult } from '../../ports';

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

  async list(query: ListApiKeysQuery): Promise<ListApiKeysResult> {
    const offset = parseCursor(query.cursor);
    const allKeys = [...this.keysById.values()]
      .filter((apiKey) => {
        const snapshot = apiKey.toSnapshot();

        return snapshot.tenantId === query.tenantId && snapshot.workspaceId === query.workspaceId;
      })
      .sort(compareApiKeys);
    const apiKeys = allKeys.slice(offset, offset + query.limit);
    const nextOffset = offset + apiKeys.length;

    return {
      apiKeys,
      nextCursor: nextOffset < allKeys.length ? encodeCursor(nextOffset) : undefined,
    };
  }
}

const compareApiKeys = (left: ApiKey, right: ApiKey): number => {
  const leftSnapshot = left.toSnapshot();
  const rightSnapshot = right.toSnapshot();
  const createdDiff = rightSnapshot.createdAt.getTime() - leftSnapshot.createdAt.getTime();

  if (createdDiff !== 0) {
    return createdDiff;
  }

  return rightSnapshot.id.localeCompare(leftSnapshot.id);
};

const encodeCursor = (offset: number): string => Buffer.from(JSON.stringify({ offset })).toString('base64url');

const parseCursor = (cursor: string | undefined): number => {
  if (cursor === undefined) {
    return 0;
  }

  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { offset?: unknown };

    if (typeof parsed.offset === 'number' && Number.isInteger(parsed.offset) && parsed.offset >= 0) {
      return parsed.offset;
    }
  } catch {
    return 0;
  }

  return 0;
};
