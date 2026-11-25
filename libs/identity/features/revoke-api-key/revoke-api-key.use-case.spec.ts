import { FixedClock, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { ApiKey, type ApiKeyProps } from '../../domain';
import type { ApiKeyRepositoryPort, ListApiKeysResult } from '../../ports';
import { RevokeApiKeyUseCase } from './revoke-api-key.use-case';

class FakeApiKeys implements ApiKeyRepositoryPort {
  private readonly keys = new Map<string, ApiKey>();

  async save(apiKey: ApiKey): Promise<void> {
    const snapshot = apiKey.toSnapshot();
    this.keys.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`, apiKey);
  }

  async findById(params: Parameters<ApiKeyRepositoryPort['findById']>[0]): Promise<ApiKey | null> {
    return this.keys.get(`${params.tenantId}:${params.workspaceId}:${params.apiKeyId}`) ?? null;
  }

  async findByKeyPrefix(): Promise<ApiKey | null> {
    return null;
  }

  async list(): Promise<ListApiKeysResult> {
    return {
      apiKeys: [...this.keys.values()],
      nextCursor: undefined,
    };
  }
}

describe('RevokeApiKeyUseCase', () => {
  it('revokes an API key in the requested tenant scope', async () => {
    const apiKeys = new FakeApiKeys();
    await apiKeys.save(makeApiKey({ id: 'api-key-1' }));

    const result = await new RevokeApiKeyUseCase(
      apiKeys,
      new FixedClock(new Date('2026-06-06T01:00:00.000Z')),
    ).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      apiKeyId: 'api-key-1',
    });

    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        id: 'api-key-1',
        status: 'revoked',
        revokedAt: '2026-06-06T01:00:00.000Z',
      }),
    });
    await expect(apiKeys.findById({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      apiKeyId: 'api-key-1',
    })).resolves.toEqual(expect.objectContaining({
      toSnapshot: expect.any(Function),
    }));
  });

  it('does not revoke API keys outside the requested workspace', async () => {
    const apiKeys = new FakeApiKeys();
    await apiKeys.save(makeApiKey({ id: 'api-key-1', workspaceId: workspaceId('workspace-2') }));

    await expect(new RevokeApiKeyUseCase(
      apiKeys,
      new FixedClock(new Date('2026-06-06T01:00:00.000Z')),
    ).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      apiKeyId: 'api-key-1',
    })).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'resource.not_found',
      }),
    });
  });
});

const makeApiKey = (overrides: Partial<ApiKeyProps> = {}): ApiKey => ApiKey.create({
  id: 'api-key-1',
  tenantId: tenantId('tenant-1'),
  workspaceId: workspaceId('workspace-1'),
  name: 'Automation',
  keyPrefix: 'smk_live_123',
  secretHash: 'secret-hash',
  scopes: ['read:summaries'],
  status: 'active',
  createdAt: new Date('2026-06-06T00:00:00.000Z'),
  ...overrides,
});
