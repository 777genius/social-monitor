import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { SourceBinding, Interest, type SourceBindingProps } from '../../domain';
import type {
  ListSourceBindingsQuery,
  ListSourceBindingsResult,
  SourceBindingRepositoryPort,
  InterestRepositoryPort,
} from '../../ports';
import { ListSourceBindingsUseCase } from './list-source-bindings.use-case';

describe('ListSourceBindingsUseCase', () => {
  it('lists source bindings for an existing interest and hides encrypted config payloads', async () => {
    const interests = new FakeInterestRepository();
    const bindings = new FakeSourceBindingRepository();
    const tenant = tenantId('tenant-1');
    const workspace = workspaceId('workspace-1');
    const interest = Interest.create({
      id: 'interest-1',
      tenantId: tenant,
      workspaceId: workspace,
      name: 'AI Infrastructure',
      query: 'AI infrastructure',
      createdAt: new Date('2026-06-06T00:00:00.000Z'),
    });
    await interests.save(interest);
    await bindings.save(makeBinding({
      id: 'binding-old',
      tenantId: tenant,
      workspaceId: workspace,
      interestId: 'interest-1',
      createdAt: new Date('2026-06-06T00:00:00.000Z'),
    }));
    await bindings.save(makeBinding({
      id: 'binding-new',
      tenantId: tenant,
      workspaceId: workspace,
      interestId: 'interest-1',
      providerKey: 'rss',
      config: {
        url: 'https://example.com/feed.xml',
        apiToken: {
          encrypted: true,
          algorithm: 'aes-256-gcm',
          keyId: 'local-ephemeral',
          ciphertext: 'hidden',
        },
      },
      createdAt: new Date('2026-06-06T01:00:00.000Z'),
    }));

    const result = await new ListSourceBindingsUseCase(interests, bindings).execute({
      tenantId: tenant,
      workspaceId: workspace,
      interestId: 'interest-1',
      limit: 1,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        sourceBindings: [
          expect.objectContaining({
            id: 'binding-new',
            providerKey: 'rss',
            configPreview: {
              url: 'https://example.com/feed.xml',
              apiToken: {
                encrypted: true,
                algorithm: 'aes-256-gcm',
              },
            },
          }),
        ],
        nextCursor: expect.any(String),
      },
    });
  });

  it('filters source bindings by provider and status before pagination', async () => {
    const interests = new FakeInterestRepository();
    const bindings = new FakeSourceBindingRepository();
    const tenant = tenantId('tenant-1');
    const workspace = workspaceId('workspace-1');
    await interests.save(Interest.create({
      id: 'interest-1',
      tenantId: tenant,
      workspaceId: workspace,
      name: 'AI Infrastructure',
      query: 'AI infrastructure',
      createdAt: new Date('2026-06-06T00:00:00.000Z'),
    }));
    await bindings.save(makeBinding({
      id: 'binding-reddit',
      tenantId: tenant,
      workspaceId: workspace,
      interestId: 'interest-1',
      providerKey: 'reddit',
      createdAt: new Date('2026-06-06T02:00:00.000Z'),
    }));
    await bindings.save(makeBinding({
      id: 'binding-rss-paused',
      tenantId: tenant,
      workspaceId: workspace,
      interestId: 'interest-1',
      providerKey: 'rss',
      status: 'paused',
      createdAt: new Date('2026-06-06T01:00:00.000Z'),
    }));
    await bindings.save(makeBinding({
      id: 'binding-rss-enabled',
      tenantId: tenant,
      workspaceId: workspace,
      interestId: 'interest-1',
      providerKey: 'rss',
      createdAt: new Date('2026-06-06T00:30:00.000Z'),
    }));

    const result = await new ListSourceBindingsUseCase(interests, bindings).execute({
      tenantId: tenant,
      workspaceId: workspace,
      interestId: 'interest-1',
      limit: 10,
      providerKeys: [' rss ', 'rss'],
      statuses: ['paused'],
    });

    expect(result).toEqual({
      ok: true,
      value: {
        sourceBindings: [
          expect.objectContaining({
            id: 'binding-rss-paused',
            providerKey: 'rss',
            status: 'paused',
          }),
        ],
        nextCursor: undefined,
      },
    });
    expect(bindings.queries).toEqual([
      expect.objectContaining({
        providerKeys: ['rss'],
        statuses: ['paused'],
      }),
    ]);
  });

  it('returns not found when interest is outside the tenant workspace', async () => {
    const interests = new FakeInterestRepository();
    const bindings = new FakeSourceBindingRepository();

    await expect(new ListSourceBindingsUseCase(interests, bindings).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      interestId: 'missing-interest',
      limit: 50,
    })).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'resource.not_found',
      }),
    });
  });

  it('rejects unsupported status filters before listing bindings', async () => {
    const interests = new FakeInterestRepository();
    const bindings = new FakeSourceBindingRepository();
    const tenant = tenantId('tenant-1');
    const workspace = workspaceId('workspace-1');
    await interests.save(Interest.create({
      id: 'interest-1',
      tenantId: tenant,
      workspaceId: workspace,
      name: 'AI Infrastructure',
      query: 'AI infrastructure',
      createdAt: new Date('2026-06-06T00:00:00.000Z'),
    }));

    const result = await new ListSourceBindingsUseCase(interests, bindings).execute({
      tenantId: tenant,
      workspaceId: workspace,
      interestId: 'interest-1',
      limit: 10,
      statuses: ['failed'],
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'validation.failed',
      }),
    });
    expect(bindings.queries).toEqual([]);
  });
});

const makeBinding = (overrides: Partial<SourceBindingProps> = {}): SourceBinding => SourceBinding.rehydrate({
  id: 'binding-1',
  tenantId: tenantId('tenant-1'),
  workspaceId: workspaceId('workspace-1'),
  interestId: 'interest-1',
  providerKey: 'fake-source',
  capabilityProfileVersion: 1,
  config: { mode: 'search', query: 'AI infrastructure' },
  status: 'enabled',
  createdAt: new Date('2026-06-06T00:00:00.000Z'),
  ...overrides,
});

class FakeInterestRepository implements InterestRepositoryPort {
  private readonly interests = new Map<string, Interest>();

  async save(interest: Interest): Promise<void> {
    const snapshot = interest.toSnapshot();

    this.interests.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`, interest);
  }

  async findByName(params: Parameters<InterestRepositoryPort['findByName']>[0]): Promise<Interest | null> {
    const normalizedName = params.name.trim().toLowerCase();

    return [...this.interests.values()].find((interest) => {
      const snapshot = interest.toSnapshot();

      return (
        snapshot.tenantId === params.tenantId &&
        snapshot.workspaceId === params.workspaceId &&
        snapshot.name.toLowerCase() === normalizedName
      );
    }) ?? null;
  }

  async findById(params: Parameters<InterestRepositoryPort['findById']>[0]): Promise<Interest | null> {
    return this.interests.get(`${params.tenantId}:${params.workspaceId}:${params.interestId}`) ?? null;
  }

  async list(): Promise<{ readonly interests: readonly Interest[]; readonly nextCursor?: string }> {
    return { interests: [...this.interests.values()], nextCursor: undefined };
  }
}

class FakeSourceBindingRepository implements SourceBindingRepositoryPort {
  private readonly bindings = new Map<string, SourceBinding>();
  readonly queries: ListSourceBindingsQuery[] = [];

  async save(binding: SourceBinding): Promise<void> {
    const snapshot = binding.toSnapshot();

    this.bindings.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`, binding);
  }

  async findByInterestAndProvider(
    params: Parameters<SourceBindingRepositoryPort['findByInterestAndProvider']>[0],
  ): Promise<SourceBinding | null> {
    return [...this.bindings.values()].find((binding) => {
      const snapshot = binding.toSnapshot();

      return (
        snapshot.tenantId === params.tenantId &&
        snapshot.workspaceId === params.workspaceId &&
        snapshot.interestId === params.interestId &&
        snapshot.providerKey === params.providerKey
      );
    }) ?? null;
  }

  async findById(params: Parameters<SourceBindingRepositoryPort['findById']>[0]): Promise<SourceBinding | null> {
    return this.bindings.get(`${params.tenantId}:${params.workspaceId}:${params.sourceBindingId}`) ?? null;
  }

  async listByInterest(query: ListSourceBindingsQuery): Promise<ListSourceBindingsResult> {
    this.queries.push(query);
    const offset = parseCursor(query.cursor);
    const allBindings = [...this.bindings.values()]
      .filter((binding) => {
        const snapshot = binding.toSnapshot();

        return (
          snapshot.tenantId === query.tenantId &&
          snapshot.workspaceId === query.workspaceId &&
          snapshot.interestId === query.interestId &&
          (query.providerKeys === undefined ||
            query.providerKeys.includes(snapshot.providerKey)) &&
          (query.statuses === undefined ||
            query.statuses.includes(snapshot.status))
        );
      })
      .sort(compareBindingsByCreation);
    const sourceBindings = allBindings.slice(offset, offset + query.limit);
    const nextOffset = offset + sourceBindings.length;

    return {
      sourceBindings,
      nextCursor: nextOffset < allBindings.length ? encodeCursor(nextOffset) : undefined,
    };
  }
}

const compareBindingsByCreation = (left: SourceBinding, right: SourceBinding): number => {
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

  const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { offset?: unknown };

  return typeof parsed.offset === 'number' && Number.isInteger(parsed.offset) ? parsed.offset : 0;
};
