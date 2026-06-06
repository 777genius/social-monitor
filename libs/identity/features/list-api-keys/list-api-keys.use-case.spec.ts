import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { ApiKey, type ApiKeyProps } from '../../domain';
import type { ApiKeyRepositoryPort, ListApiKeysQuery, ListApiKeysResult as RepositoryListApiKeysResult } from '../../ports';
import { ListApiKeysUseCase } from './list-api-keys.use-case';

class FakeApiKeys implements ApiKeyRepositoryPort {
  constructor(private readonly keys: readonly ApiKey[]) {}

  async save(): Promise<void> {}

  async findById(): Promise<ApiKey | null> {
    return null;
  }

  async findByKeyPrefix(): Promise<ApiKey | null> {
    return null;
  }

  async list(query: ListApiKeysQuery): Promise<RepositoryListApiKeysResult> {
    return {
      apiKeys: this.keys.slice(0, query.limit),
      nextCursor: undefined,
    };
  }
}

const makeApiKey = (props: Partial<ApiKeyProps>) =>
  ApiKey.create({
    id: props.id ?? 'api-key-1',
    tenantId: props.tenantId ?? tenantId('tenant-1'),
    workspaceId: props.workspaceId ?? workspaceId('workspace-1'),
    name: props.name ?? 'Key',
    keyPrefix: props.keyPrefix ?? 'smk_test_123',
    secretHash: props.secretHash ?? 'hash',
    scopes: props.scopes ?? ['read:summaries'],
    status: props.status ?? 'active',
    createdAt: props.createdAt ?? new Date('2026-06-06T00:00:00.000Z'),
    revokedAt: props.revokedAt,
  });

describe('ListApiKeysUseCase', () => {
  it('lists API keys without secret hashes', async () => {
    const result = await new ListApiKeysUseCase(
      new FakeApiKeys([
        makeApiKey({
          id: 'api-key-1',
          secretHash: 'hidden-hash',
        }),
      ]),
    ).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      limit: 10,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        apiKeys: [
          {
            id: 'api-key-1',
            tenantId: 'tenant-1',
            workspaceId: 'workspace-1',
            name: 'Key',
            keyPrefix: 'smk_test_123',
            scopes: ['read:summaries'],
            status: 'active',
            createdAt: '2026-06-06T00:00:00.000Z',
            revokedAt: undefined,
          },
        ],
        nextCursor: undefined,
      },
    });
  });
});
