import {
  FixedClock,
  tenantId,
  workspaceId,
  type TenantId,
  type WorkspaceId,
} from '@social-monitor/shared-kernel';

import { InMemoryInterestRepository } from '../../libs/monitoring/adapters/persistence/in-memory-interest.repository';
import { InMemoryScanPolicyRepository } from '../../libs/monitoring/adapters/persistence/in-memory-scan-policy.repository';
import { InMemorySourceBindingRepository } from '../../libs/monitoring/adapters/persistence/in-memory-source-binding.repository';
import { FakeSourceCatalogAdapter } from '../../libs/monitoring/adapters/source-catalog/fake-source-catalog.adapter';
import type {
  SourceBindingConfig,
  SourceBindingConfigProtectorPort,
} from '../../libs/monitoring/ports';
import {
  bootstrapReaderSummaryProductionSources,
  PrismaReaderSummaryProductionIdentityStore,
  readerSummaryProductionProviderKeys,
  type ReaderSummaryProductionCatalogCapabilityReader,
  type ReaderSummaryProductionIdentityStore,
  type ReaderSummaryProductionProviderKey,
  type ReaderSummaryProductionScope,
  type ReaderSummaryProductionSourceBootstrapDependencies,
} from './reader-summary-production-source-bootstrap';

const now = new Date('2026-07-28T00:00:00.000Z');
const scope: ReaderSummaryProductionScope = {
  tenantId: tenantId('00000000-0000-7000-8000-000000009001'),
  workspaceId: workspaceId('00000000-0000-7000-8000-000000009002'),
  userId: '00000000-0000-7000-8000-000000009003',
};

describe('reader summary production source bootstrap', () => {
  it('creates exactly five enabled bindings and policies and is idempotent', async () => {
    const fixture = createFixture();

    const first = await bootstrapReaderSummaryProductionSources(
      fixture.dependencies,
    );
    const second = await bootstrapReaderSummaryProductionSources(
      fixture.dependencies,
    );

    expect(first.providers.map((provider) => provider.providerKey)).toEqual(
      readerSummaryProductionProviderKeys,
    );
    expect(
      first.providers.every(
        (provider) =>
          provider.sourceBindingCreated &&
          provider.scanPolicyCreated &&
          !provider.scanPolicyUpdated,
      ),
    ).toBe(true);
    expect(second.providers).toEqual(
      second.providers.map((provider) => ({
        ...provider,
        sourceBindingCreated: false,
        scanPolicyCreated: false,
        scanPolicyUpdated: false,
      })),
    );
    expect(second).toMatchObject({
      tenantId: first.tenantId,
      workspaceId: first.workspaceId,
      userId: first.userId,
      interestId: first.interestId,
    });

    const bindings = await fixture.sourceBindings.listByInterest({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      interestId: first.interestId,
      limit: 100,
    });
    expect(bindings.nextCursor).toBeUndefined();
    expect(bindings.sourceBindings).toHaveLength(5);
    expect(
      bindings.sourceBindings
        .map((binding) => binding.toSnapshot())
        .map(({ providerKey, status }) => ({ providerKey, status }))
        .sort((left, right) => left.providerKey.localeCompare(right.providerKey)),
    ).toEqual(
      [...readerSummaryProductionProviderKeys]
        .sort()
        .map((providerKey) => ({ providerKey, status: 'enabled' })),
    );

    const policies = await Promise.all(
      bindings.sourceBindings.map((binding) =>
        fixture.scanPolicies.findBySourceBinding({
          tenantId: scope.tenantId,
          workspaceId: scope.workspaceId,
          sourceBindingId: binding.toSnapshot().id,
        }),
      ),
    );
    expect(policies).not.toContain(null);
    expect(
      Object.fromEntries(
        bindings.sourceBindings.map((binding, index) => [
          binding.toSnapshot().providerKey,
          policies[index]?.toSnapshot().intervalSeconds,
        ]),
      ),
    ).toEqual({
      'github-trending-page': 86_400,
      'hacker-news': 900,
      reddit: 1_800,
      rss: 1_800,
      'x-twitter': 86_400,
    });
    expect(fixture.identities.calls).toBe(2);
  });

  it('reuses AI developer preset configs and the daily GitHub Trending shape', async () => {
    const fixture = createFixture();
    const result = await bootstrapReaderSummaryProductionSources(
      fixture.dependencies,
    );

    const configs = Object.fromEntries(
      await Promise.all(
        result.providers.map(async ({ providerKey, sourceBindingId }) => {
          const binding = await fixture.sourceBindings.findById({
            tenantId: scope.tenantId,
            workspaceId: scope.workspaceId,
            sourceBindingId,
          });
          return [providerKey, binding?.toSnapshot().config];
        }),
      ),
    );

    expect(configs['github-trending-page']).toEqual(
      expect.objectContaining({
        mode: 'listing',
        query: 'daily',
        window: 'daily',
        maxItems: 100,
      }),
    );
    expect(configs['hacker-news']).toEqual(
      expect.objectContaining({
        mode: 'search',
        scanPasses: expect.any(Array),
      }),
    );
    expect(configs.reddit).toEqual(
      expect.objectContaining({
        mode: 'search',
        sourceQueryPlanner: expect.objectContaining({
          rollout: 'real_binding_canary',
        }),
      }),
    );
    expect(configs.rss).toEqual(
      expect.objectContaining({
        mode: 'url',
        feedUrl: expect.stringMatching(/^https:\/\/news\.google\.com\/rss\//),
      }),
    );
    expect(configs['x-twitter']).toEqual(
      expect.objectContaining({
        mode: 'search',
        searchProducts: ['top', 'latest'],
        windowHours: 24,
      }),
    );
  });

  it('fails before identity or source writes when a persisted capability is missing', async () => {
    const fixture = createFixture({
      catalogCapabilities: new TestCatalogCapabilityReader(
        new Set(['x-twitter']),
      ),
    });

    await expect(
      bootstrapReaderSummaryProductionSources(fixture.dependencies),
    ).rejects.toThrow(
      'Production catalog capability is unavailable for x-twitter version 1',
    );

    expect(fixture.identities.calls).toBe(0);
    expect(
      await fixture.interests.list({
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        limit: 100,
      }),
    ).toMatchObject({ interests: [] });
  });

  it('fails closed when the production runtime does not expose X capability', async () => {
    const fixture = createFixture({
      sourceCatalog: new FakeSourceCatalogAdapter({
        includeFixtureProviders: false,
        includeXTwitterProvider: false,
      }),
    });

    await expect(
      bootstrapReaderSummaryProductionSources(fixture.dependencies),
    ).rejects.toThrow(
      'Production runtime capability is unavailable for x-twitter',
    );
    expect(fixture.identities.calls).toBe(0);
  });

  it('upserts the deterministic tenant, workspace, user, and owner membership serializably', async () => {
    const transaction = recordingIdentityTransaction();
    const prisma = {
      $transaction: jest.fn(
        async <TValue>(
          work: (value: typeof transaction) => Promise<TValue>,
          options: { readonly isolationLevel: 'Serializable' },
        ): Promise<TValue> => {
          expect(options).toEqual({ isolationLevel: 'Serializable' });
          return work(transaction);
        },
      ),
    };

    const result = await new PrismaReaderSummaryProductionIdentityStore(
      prisma,
    ).ensureScope();

    expect(result).toEqual({
      tenantId:
        '00000000-0000-7000-8000-000000006101' as TenantId,
      workspaceId:
        '00000000-0000-7000-8000-000000006102' as WorkspaceId,
      userId: '00000000-0000-7000-8000-000000006103',
    });
    expect(transaction.tenant.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { slug: 'reader-summary-production' },
        create: expect.objectContaining({
          id: '00000000-0000-7000-8000-000000006101',
        }),
      }),
    );
    expect(transaction.workspace.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_slug: {
            tenantId: '00000000-0000-7000-8000-000000006101',
            slug: 'ai-developer-signal',
          },
        },
      }),
    );
    expect(transaction.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_email: {
            tenantId: '00000000-0000-7000-8000-000000006101',
            email: 'reader-summary-production@social-monitor.invalid',
          },
        },
      }),
    );
    expect(transaction.membership.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { role: 'OWNER' },
        create: expect.objectContaining({ role: 'OWNER' }),
      }),
    );
  });
});

const createFixture = (overrides: {
  readonly sourceCatalog?: FakeSourceCatalogAdapter;
  readonly catalogCapabilities?: ReaderSummaryProductionCatalogCapabilityReader;
} = {}) => {
  const identities = new TestIdentityStore();
  const interests = new InMemoryInterestRepository();
  const sourceBindings = new InMemorySourceBindingRepository();
  const scanPolicies = new InMemoryScanPolicyRepository();
  const dependencies: ReaderSummaryProductionSourceBootstrapDependencies = {
    identities,
    interests,
    sourceBindings,
    scanPolicies,
    sourceCatalog:
      overrides.sourceCatalog ?? new FakeSourceCatalogAdapter({
        includeFixtureProviders: false,
        includeXTwitterProvider: true,
      }),
    catalogCapabilities:
      overrides.catalogCapabilities ?? new TestCatalogCapabilityReader(),
    configProtector: new PassThroughConfigProtector(),
    clock: new FixedClock(now),
  };

  return {
    dependencies,
    identities,
    interests,
    sourceBindings,
    scanPolicies,
  };
};

class TestIdentityStore implements ReaderSummaryProductionIdentityStore {
  calls = 0;

  async ensureScope(): Promise<ReaderSummaryProductionScope> {
    this.calls += 1;
    return scope;
  }
}

class TestCatalogCapabilityReader
  implements ReaderSummaryProductionCatalogCapabilityReader
{
  constructor(
    private readonly missing: ReadonlySet<
      ReaderSummaryProductionProviderKey
    > = new Set(),
  ) {}

  async findCapability(params: {
    readonly providerKey: ReaderSummaryProductionProviderKey;
    readonly version: number;
  }): Promise<{ readonly productionSafe: boolean } | null> {
    expect(params.version).toBe(1);
    return this.missing.has(params.providerKey)
      ? null
      : { productionSafe: true };
  }
}

class PassThroughConfigProtector
  implements SourceBindingConfigProtectorPort
{
  async protect(config: SourceBindingConfig): Promise<SourceBindingConfig> {
    return config;
  }

  async unprotect(config: SourceBindingConfig): Promise<SourceBindingConfig> {
    return config;
  }
}

const recordingIdentityTransaction = () => ({
  tenant: {
    upsert: jest.fn(async () => ({
      id: '00000000-0000-7000-8000-000000006101',
    })),
  },
  workspace: {
    upsert: jest.fn(async () => ({
      id: '00000000-0000-7000-8000-000000006102',
    })),
  },
  user: {
    upsert: jest.fn(async () => ({
      id: '00000000-0000-7000-8000-000000006103',
    })),
  },
  membership: {
    upsert: jest.fn(async () => undefined),
  },
});
