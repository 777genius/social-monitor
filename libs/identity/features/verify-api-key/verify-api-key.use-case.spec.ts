import { FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { ApiKey } from '../../domain';
import type { ApiKeyHasherPort, ApiKeyRepositoryPort, ListApiKeysQuery, ListApiKeysResult } from '../../ports';
import { CreateApiKeyUseCase } from '../create-api-key/create-api-key.use-case';
import { RevokeApiKeyUseCase } from '../revoke-api-key/revoke-api-key.use-case';
import { VerifyApiKeyUseCase } from './verify-api-key.use-case';

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `id-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

class FakeApiKeys implements ApiKeyRepositoryPort {
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
    return {
      apiKeys: [...this.keysById.values()].filter((apiKey) => {
        const snapshot = apiKey.toSnapshot();

        return snapshot.tenantId === query.tenantId && snapshot.workspaceId === query.workspaceId;
      }),
      nextCursor: undefined,
    };
  }
}

class FakeHasher implements ApiKeyHasherPort {
  async hash(secret: string): Promise<string> {
    return `hash:${secret}`;
  }

  async verify(params: { readonly secret: string; readonly hash: string }): Promise<boolean> {
    return params.hash === await this.hash(params.secret);
  }
}

describe('VerifyApiKeyUseCase', () => {
  it('verifies scoped API key and rejects missing scope', async () => {
    const tenant = tenantId('tenant-1');
    const workspace = workspaceId('workspace-1');
    const keys = new FakeApiKeys();
    const hasher = new FakeHasher();
    const created = await new CreateApiKeyUseCase(
      keys,
      hasher,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-06T00:00:00.000Z')),
    ).execute({
      tenantId: tenant,
      workspaceId: workspace,
      name: 'Readonly key',
      scopes: ['read:summaries'],
    });

    if (!created.ok) {
      throw created.error;
    }

    await expect(new VerifyApiKeyUseCase(keys, hasher).execute({
      secret: created.value.secret,
      requiredScope: 'read:summaries',
    })).resolves.toEqual({
      ok: true,
      value: {
        apiKey: created.value.apiKey,
      },
    });
    await expect(new VerifyApiKeyUseCase(keys, hasher).execute({
      secret: created.value.secret,
      requiredScope: 'write:webhook_endpoints',
    })).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'authorization.denied',
      }),
    });
  });

  it('rejects revoked API key', async () => {
    const tenant = tenantId('tenant-1');
    const workspace = workspaceId('workspace-1');
    const keys = new FakeApiKeys();
    const hasher = new FakeHasher();
    const created = await new CreateApiKeyUseCase(
      keys,
      hasher,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-06T00:00:00.000Z')),
    ).execute({
      tenantId: tenant,
      workspaceId: workspace,
      name: 'Revoked key',
      scopes: ['read:summaries'],
    });

    if (!created.ok) {
      throw created.error;
    }

    await new RevokeApiKeyUseCase(
      keys,
      new FixedClock(new Date('2026-06-06T00:01:00.000Z')),
    ).execute({
      tenantId: tenant,
      workspaceId: workspace,
      apiKeyId: created.value.apiKey.id,
    });

    await expect(new VerifyApiKeyUseCase(keys, hasher).execute({
      secret: created.value.secret,
      requiredScope: 'read:summaries',
    })).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'authorization.denied',
      }),
    });
  });
});
