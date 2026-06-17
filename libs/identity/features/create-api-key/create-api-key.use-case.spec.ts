import { FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { ApiKey } from '../../domain';
import type { ApiKeyHasherPort, ApiKeyRepositoryPort, ListApiKeysResult } from '../../ports';
import { CreateApiKeyUseCase } from './create-api-key.use-case';

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `id-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

class FakeApiKeys implements ApiKeyRepositoryPort {
  readonly saved: ApiKey[] = [];

  async save(apiKey: ApiKey): Promise<void> {
    this.saved.push(apiKey);
  }

  async findById(): Promise<ApiKey | null> {
    return null;
  }

  async findByKeyPrefix(): Promise<ApiKey | null> {
    return null;
  }

  async list(): Promise<ListApiKeysResult> {
    return {
      apiKeys: this.saved,
      nextCursor: undefined,
    };
  }
}

class FakeHasher implements ApiKeyHasherPort {
  readonly secrets: string[] = [];

  async hash(secret: string): Promise<string> {
    this.secrets.push(secret);

    return `hash:${secret}`;
  }

  async verify(params: { readonly secret: string; readonly hash: string }): Promise<boolean> {
    return params.hash === `hash:${params.secret}`;
  }
}

describe('CreateApiKeyUseCase', () => {
  it('creates and persists a hashed API key while returning the one-time secret', async () => {
    const apiKeys = new FakeApiKeys();
    const hasher = new FakeHasher();

    const result = await new CreateApiKeyUseCase(
      apiKeys,
      hasher,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-06T00:00:00.000Z')),
    ).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      name: 'Automation',
      scopes: ['read:summaries', 'read:feed'],
    });

    expect(result).toEqual({
      ok: true,
      value: {
        apiKey: expect.objectContaining({
          id: 'id-3',
          name: 'Automation',
          keyPrefix: 'smk_id-1_id-',
          scopes: ['read:feed', 'read:summaries'],
          status: 'active',
          createdAt: '2026-06-06T00:00:00.000Z',
        }),
        secret: 'smk_id-1_id-2',
      },
    });
    expect(apiKeys.saved[0]?.toSnapshot()).toMatchObject({
      id: 'id-3',
      secretHash: 'hash:smk_id-1_id-2',
    });
    expect(result.ok && result.value.apiKey).not.toHaveProperty('secretHash');
    expect(hasher.secrets).toEqual(['smk_id-1_id-2']);
  });

  it('rejects API keys without scopes before generating secret material', async () => {
    const apiKeys = new FakeApiKeys();
    const hasher = new FakeHasher();

    await expect(new CreateApiKeyUseCase(
      apiKeys,
      hasher,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-06T00:00:00.000Z')),
    ).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      name: 'Automation',
      scopes: [],
    })).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'validation.failed',
      }),
    });
    expect(apiKeys.saved).toHaveLength(0);
    expect(hasher.secrets).toHaveLength(0);
  });
});
