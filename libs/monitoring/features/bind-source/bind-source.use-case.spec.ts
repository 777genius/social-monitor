import { FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { Interest, type SourceBinding } from '../../domain';
import type {
  IdempotencyPort,
  ListSourceBindingsQuery,
  ListSourceBindingsResult,
  ListInterestsQuery,
  ListInterestsResult,
  OutboxPort,
  SourceBindingConfig,
  SourceBindingConfigValidationResult,
  SourceBindingConfigProtectorPort,
  SourceBindingRepositoryPort,
  SourceCatalogPort,
  SourceCapabilityProfile,
  InterestRepositoryPort,
} from '../../ports';
import type { BindSourceResult } from './bind-source.result';
import { BindSourceUseCase } from './bind-source.use-case';

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `00000000-0000-7000-8000-${this.nextId.toString().padStart(12, '0')}`;
    this.nextId += 1;
    return id;
  }
}

class FakeInterests implements InterestRepositoryPort {
  private readonly interests = new Map<string, Interest>();

  add(interest: Interest): void {
    const snapshot = interest.toSnapshot();
    this.interests.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`, interest);
  }

  async save(interest: Interest): Promise<void> {
    this.add(interest);
  }

  async findByName(): Promise<Interest | null> {
    return null;
  }

  async findById(params: Parameters<InterestRepositoryPort['findById']>[0]): Promise<Interest | null> {
    return this.interests.get(`${params.tenantId}:${params.workspaceId}:${params.interestId}`) ?? null;
  }

  async list(query: ListInterestsQuery): Promise<ListInterestsResult> {
    return {
      interests: [...this.interests.values()].filter((interest) => {
        const snapshot = interest.toSnapshot();

        return snapshot.tenantId === query.tenantId && snapshot.workspaceId === query.workspaceId;
      }),
      nextCursor: undefined,
    };
  }
}

class FakeBindings implements SourceBindingRepositoryPort {
  private readonly bindingsByInterestProvider = new Map<string, SourceBinding>();
  private readonly bindingsById = new Map<string, SourceBinding>();

  async save(binding: SourceBinding): Promise<void> {
    const snapshot = binding.toSnapshot();
    this.bindingsByInterestProvider.set(
      `${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.interestId}:${snapshot.providerKey}`,
      binding,
    );
    this.bindingsById.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`, binding);
  }

  async findByInterestAndProvider(
    params: Parameters<SourceBindingRepositoryPort['findByInterestAndProvider']>[0],
  ): Promise<SourceBinding | null> {
    return (
      this.bindingsByInterestProvider.get(`${params.tenantId}:${params.workspaceId}:${params.interestId}:${params.providerKey}`) ??
      null
    );
  }

  async findById(params: Parameters<SourceBindingRepositoryPort['findById']>[0]): Promise<SourceBinding | null> {
    return this.bindingsById.get(`${params.tenantId}:${params.workspaceId}:${params.sourceBindingId}`) ?? null;
  }

  async listByInterest(query: ListSourceBindingsQuery): Promise<ListSourceBindingsResult> {
    return {
      sourceBindings: [...this.bindingsById.values()].filter((binding) => {
        const snapshot = binding.toSnapshot();

        return (
          snapshot.tenantId === query.tenantId &&
          snapshot.workspaceId === query.workspaceId &&
          snapshot.interestId === query.interestId
        );
      }),
      nextCursor: undefined,
    };
  }
}

class FakeCatalog implements SourceCatalogPort {
  constructor(
    private readonly profile: SourceCapabilityProfile | null,
    private readonly validation: SourceBindingConfigValidationResult = { ok: true },
  ) {}

  async getCapability(): Promise<SourceCapabilityProfile | null> {
    return this.profile;
  }

  async validateBindingConfig(): Promise<SourceBindingConfigValidationResult> {
    return this.validation;
  }
}

class FakeOutbox implements OutboxPort {
  readonly events: unknown[] = [];

  async append(event: Parameters<OutboxPort['append']>[0]): Promise<void> {
    this.events.push(event);
  }
}

class FakeIdempotency implements IdempotencyPort {
  private readonly records = new Map<string, BindSourceResult>();

  async get<TValue>(params: Parameters<IdempotencyPort['get']>[0]) {
    const value = this.records.get(this.key(params));
    return value === undefined ? null : { value: value as TValue };
  }

  async set<TValue>(params: Parameters<IdempotencyPort['set']>[0] & { value: TValue }): Promise<void> {
    this.records.set(this.key(params), params.value as BindSourceResult);
  }

  private key(params: { tenantId: string; workspaceId: string; scope: string; key: string }): string {
    return `${params.tenantId}:${params.workspaceId}:${params.scope}:${params.key}`;
  }
}

class FakeConfigProtector implements SourceBindingConfigProtectorPort {
  readonly configs: SourceBindingConfig[] = [];

  async protect(config: SourceBindingConfig): Promise<SourceBindingConfig> {
    this.configs.push(config);

    return {
      ...config,
      apiToken: {
        encrypted: true,
        ciphertext: 'encrypted-token',
      },
    };
  }

  async unprotect(config: SourceBindingConfig): Promise<SourceBindingConfig> {
    return config;
  }
}

const makeInterest = () =>
  Interest.create({
    id: 'interest-1',
    tenantId: tenantId('tenant-1'),
    workspaceId: workspaceId('workspace-1'),
    name: 'AI Monitoring',
    query: 'openai monitoring',
    createdAt: new Date('2026-06-05T00:00:00.000Z'),
  });

describe('BindSourceUseCase', () => {
  it('binds a production-safe fake source and appends an event', async () => {
    const interests = new FakeInterests();
    interests.add(makeInterest());
    const outbox = new FakeOutbox();
    const bindings = new FakeBindings();
    const protector = new FakeConfigProtector();
    const useCase = new BindSourceUseCase(
      interests,
      bindings,
      new FakeCatalog({
        providerKey: 'fake-source',
        version: 1,
        productionSafe: true,
        supportsCursor: true,
      }),
      outbox,
      new FakeIdempotency(),
      protector,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-05T00:00:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      interestId: 'interest-1',
      providerKey: 'fake-source',
      config: { query: 'openai monitoring', apiToken: 'raw-token' },
      idempotencyKey: 'bind-1',
      correlationId: 'correlation-1',
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.created).toBe(true);
    expect(outbox.events).toHaveLength(1);
    expect(protector.configs).toEqual([{ query: 'openai monitoring', apiToken: 'raw-token' }]);

    const binding = await bindings.findByInterestAndProvider({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      interestId: 'interest-1',
      providerKey: 'fake-source',
    });

    expect(binding?.toSnapshot().config).toEqual({
      query: 'openai monitoring',
      apiToken: {
        encrypted: true,
        ciphertext: 'encrypted-token',
      },
    });
    expect(JSON.stringify(binding?.toSnapshot().config)).not.toContain('raw-token');
  });

  it('rejects unsupported source provider', async () => {
    const interests = new FakeInterests();
    interests.add(makeInterest());
    const useCase = new BindSourceUseCase(
      interests,
      new FakeBindings(),
      new FakeCatalog(null),
      new FakeOutbox(),
      new FakeIdempotency(),
      new FakeConfigProtector(),
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-05T00:00:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      interestId: 'interest-1',
      providerKey: 'unsafe-source',
      config: {},
      idempotencyKey: 'bind-1',
      correlationId: 'correlation-1',
    });

    expect(result.ok).toBe(false);
  });

  it('rejects invalid provider config before protecting and saving it', async () => {
    const interests = new FakeInterests();
    interests.add(makeInterest());
    const bindings = new FakeBindings();
    const protector = new FakeConfigProtector();
    const useCase = new BindSourceUseCase(
      interests,
      bindings,
      new FakeCatalog(
        {
          providerKey: 'rss',
          version: 1,
          productionSafe: true,
          supportsCursor: true,
        },
        { ok: false, reason: 'Feed URL must not target private or local networks.' },
      ),
      new FakeOutbox(),
      new FakeIdempotency(),
      protector,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-05T00:00:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      interestId: 'interest-1',
      providerKey: 'rss',
      config: { feedUrl: 'http://127.0.0.1/feed.xml' },
      idempotencyKey: 'bind-rss-invalid',
      correlationId: 'correlation-1',
    });

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({
        code: 'validation.failed',
      }),
    }));
    expect(protector.configs).toEqual([]);
    await expect(bindings.findByInterestAndProvider({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      interestId: 'interest-1',
      providerKey: 'rss',
    })).resolves.toBeNull();
  });

  it('rejects new source bindings after enabled source capacity limit is reached', async () => {
    const interests = new FakeInterests();
    interests.add(makeInterest());
    const bindings = new FakeBindings();
    const useCase = new BindSourceUseCase(
      interests,
      bindings,
      new FakeCatalog({
        providerKey: 'source-1',
        version: 1,
        productionSafe: true,
        supportsCursor: true,
      }),
      new FakeOutbox(),
      new FakeIdempotency(),
      new FakeConfigProtector(),
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-05T00:00:00.000Z')),
      { maxEnabledSourcesPerInterest: 1 },
    );

    const first = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      interestId: 'interest-1',
      providerKey: 'source-1',
      config: { query: 'openai monitoring' },
      idempotencyKey: 'bind-1',
      correlationId: 'correlation-1',
    });
    const second = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      interestId: 'interest-1',
      providerKey: 'source-2',
      config: { query: 'postgres rabbitmq' },
      idempotencyKey: 'bind-2',
      correlationId: 'correlation-2',
    });

    expect(first.ok).toBe(true);
    expect(second).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({
        code: 'operation.quota_exceeded',
      }),
    }));
  });
});
