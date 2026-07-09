import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import type { SourceQueryPlan, SourceQueryPlannerIntent } from '../../domain';
import type {
  FetchedSourceItem,
  ProviderFailure,
  SourceCapabilityProfile,
  SourceCursorModel,
  SourceConfigReaderPort,
  SourceProviderPort,
  SourceProviderScanContext,
  SourceProviderScanPlan,
  SourceProviderScanResult,
  SourceProviderValidationResult,
  SourceQuery,
  SourceQueryPlannerPort,
  SourceRuntimeConfig,
} from '../../ports';

import { FakeSourceProvider } from './fake-source.provider';
import { InMemorySourceProviderRegistry } from './in-memory-source-provider.registry';
import { RegistrySourceFetcherAdapter } from './registry-source-fetcher.adapter';

describe('RegistrySourceFetcherAdapter', () => {
  it('resolves the requested provider and scans with queue source query metadata', async () => {
    const fetcher = new RegistrySourceFetcherAdapter(
      new InMemorySourceProviderRegistry([new FakeSourceProvider()], []),
    );

    const result = await fetcher.fetch({
      tenantId: tenantId('tenant-registry-fetcher'),
      workspaceId: workspaceId('workspace-registry-fetcher'),
      sourceBindingId: 'source-binding-registry-fetcher',
      scanJobId: 'scan-job-registry-fetcher',
      providerKey: 'fake-source',
      sourceQuery: { mode: 'search', query: 'registry monitoring' },
      correlationId: 'correlation-registry-fetcher',
      cursor: 'cursor-before-registry-fetcher',
    });

    expect(result.items).toHaveLength(2);
    expect(result.warnings).toEqual([]);
    expect(result.items[0]).toMatchObject({
      externalId: 'source-binding-registry-fetcher:fake-post-1',
      body: 'First deterministic item for registry monitoring',
    });
  });

  it('merges source query parameters over source binding config', async () => {
    let observedConfig: SourceRuntimeConfig | undefined;
    class CapturingFakeSourceProvider extends FakeSourceProvider {
      override planScan(
        query: Parameters<FakeSourceProvider['planScan']>[0],
        context: SourceProviderScanContext,
      ): ReturnType<FakeSourceProvider['planScan']> {
        observedConfig = context.config;

        return super.planScan(query, context);
      }
    }
    const fetcher = new RegistrySourceFetcherAdapter(
      new InMemorySourceProviderRegistry([new CapturingFakeSourceProvider()], []),
      {
        async readConfig() {
          return {
            listing: 'hot',
            accessToken: 'binding-token',
          };
        },
      } satisfies SourceConfigReaderPort,
    );

    await fetcher.fetch({
      tenantId: tenantId('tenant-registry-fetcher'),
      workspaceId: workspaceId('workspace-registry-fetcher'),
      sourceBindingId: 'source-binding-registry-fetcher',
      scanJobId: 'scan-job-registry-fetcher',
      providerKey: 'fake-source',
      sourceQuery: {
        mode: 'listing',
        query: 'ClaudeAI:top',
        parameters: {
          listing: 'top',
          topTime: 'week',
        },
      },
      correlationId: 'correlation-registry-fetcher',
    });

    expect(observedConfig).toEqual({
      accessToken: 'binding-token',
      listing: 'top',
      topTime: 'week',
    });
  });

  it('filters scanned items and conversation units to the requested published window', async () => {
    const provider = new WindowedProvider();
    const fetcher = new RegistrySourceFetcherAdapter(
      new InMemorySourceProviderRegistry([provider], []),
      {
        async readConfig() {
          return {
            targetPublishedWindow: {
              startInclusive: '2026-07-07T00:00:00.000Z',
              endExclusive: '2026-07-08T00:00:00.000Z',
            },
          };
        },
      } satisfies SourceConfigReaderPort,
    );

    const result = await fetcher.fetch({
      tenantId: tenantId('tenant-registry-fetcher'),
      workspaceId: workspaceId('workspace-registry-fetcher'),
      sourceBindingId: 'source-binding-registry-fetcher',
      scanJobId: 'scan-job-registry-fetcher',
      providerKey: 'windowed-source',
      sourceQuery: { mode: 'search', query: 'AI agents' },
      correlationId: 'correlation-registry-fetcher',
    });

    expect(result.items.map((item) => item.externalId)).toEqual([
      'inside-window',
    ]);
    expect(
      result.conversationUnits?.map((unit) => unit.rootExternalId),
    ).toEqual(['inside-window']);
    expect(result.warnings).toContain(
      'target_published_window.filtered;kept=1;dropped=1',
    );
  });

  it('does not call the source query planner when the runtime flag is disabled', async () => {
    class ThrowingPlanner implements SourceQueryPlannerPort {
      async compilePlan(): Promise<SourceQueryPlan> {
        throw new Error('planner should not be called');
      }
    }
    const fetcher = new RegistrySourceFetcherAdapter(
      new InMemorySourceProviderRegistry([new FakeSourceProvider()], []),
      {
        async readConfig() {
          return {
            sourceQueryPlanner: {
              enabled: false,
            },
          };
        },
      } satisfies SourceConfigReaderPort,
      new ThrowingPlanner(),
    );

    const result = await fetcher.fetch({
      tenantId: tenantId('tenant-registry-fetcher'),
      workspaceId: workspaceId('workspace-registry-fetcher'),
      sourceBindingId: 'source-binding-registry-fetcher',
      scanJobId: 'scan-job-registry-fetcher',
      providerKey: 'fake-source',
      sourceQuery: { mode: 'search', query: 'registry monitoring' },
      correlationId: 'correlation-registry-fetcher',
    });

    expect(result.items[0]?.body).toBe(
      'First deterministic item for registry monitoring',
    );
  });

  it('compiles enabled X/Twitter query plans into provider search queries', async () => {
    const provider = new CapturingProvider('x-twitter');
    const planner = new StaticPlanner({
      plannerId: 'test-planner',
      intent: {
        topic: 'AI agents MCP Claude Code',
        sourceKeys: ['x-twitter'],
      },
      warnings: ['planner warning'],
      lanes: [
        lane({
          laneId: 'x-general',
          sourceKey: 'x-twitter',
          kind: 'general',
          operation: 'search',
          query: 'AI agents MCP Claude Code',
          priority: 100,
          maxItems: 10,
        }),
        lane({
          laneId: 'x-from-openai',
          sourceKey: 'x-twitter',
          kind: 'account_posts',
          operation: 'account_feed',
          query: 'from:OpenAI',
          priority: 95,
          maxItems: 5,
        }),
        lane({
          laneId: 'x-mention-openai',
          sourceKey: 'x-twitter',
          kind: 'account_mentions',
          operation: 'mention_search',
          query: '@OpenAI',
          priority: 85,
          maxItems: 5,
        }),
      ],
    });
    const fetcher = new RegistrySourceFetcherAdapter(
      new InMemorySourceProviderRegistry([provider], []),
      {
        async readConfig() {
          return {
            sourceQueryPlanner: {
              enabled: true,
              handles: ['OpenAI'],
              products: ['Claude Code'],
            },
          };
        },
      } satisfies SourceConfigReaderPort,
      planner,
    );

    const result = await fetcher.fetch({
      tenantId: tenantId('tenant-registry-fetcher'),
      workspaceId: workspaceId('workspace-registry-fetcher'),
      sourceBindingId: 'source-binding-registry-fetcher',
      scanJobId: 'scan-job-registry-fetcher',
      providerKey: 'x-twitter',
      sourceQuery: { mode: 'search', query: 'AI agents MCP Claude Code' },
      correlationId: 'correlation-registry-fetcher',
    });

    expect(planner.observedIntent).toMatchObject({
      topic: 'AI agents MCP Claude Code',
      sourceKeys: ['x-twitter'],
      products: ['Claude Code'],
      handles: [
        {
          handle: 'OpenAI',
          sourceKey: 'x-twitter',
          includePosts: true,
          includeMentions: true,
        },
      ],
    });
    expect(provider.observedQuery).toEqual({
      mode: 'search',
      query: 'AI agents MCP Claude Code',
      parameters: {
        maxItems: 20,
        maxSearchQueries: 3,
        searchQueries: [
          'AI agents MCP Claude Code',
          'from:OpenAI',
          '@OpenAI',
        ],
        searchQueryBudgets: [
          { query: 'AI agents MCP Claude Code', maxItems: 10 },
          { query: 'from:OpenAI', maxItems: 5 },
          { query: '@OpenAI', maxItems: 5 },
        ],
      },
    });
    expect(provider.observedContext?.config).toMatchObject({
      searchQueries: ['AI agents MCP Claude Code', 'from:OpenAI', '@OpenAI'],
    });
    expect(result.warnings).toEqual(['planner warning', 'provider warning']);
  });

  it('compiles enabled Reddit query plans into scan passes and comment enrichment', async () => {
    const provider = new CapturingProvider('reddit');
    const planner = new StaticPlanner({
      plannerId: 'test-planner',
      intent: {
        topic: 'AI agents MCP Claude Code',
        sourceKeys: ['reddit'],
      },
      warnings: [],
      lanes: [
        lane({
          laneId: 'reddit-general',
          sourceKey: 'reddit',
          kind: 'general',
          operation: 'search',
          query: 'AI agents MCP Claude Code',
          priority: 100,
          maxItems: 15,
          parameters: {
            allowedSubreddits: ['LocalLLaMA', 'MachineLearning'],
          },
        }),
        lane({
          laneId: 'reddit-top',
          sourceKey: 'reddit',
          kind: 'community_listing',
          operation: 'listing',
          query: 'LocalLLaMA:top',
          priority: 88,
          maxItems: 20,
          parameters: {
            topTime: 'week',
          },
        }),
        lane({
          laneId: 'reddit-hot',
          sourceKey: 'reddit',
          kind: 'community_listing',
          operation: 'listing',
          query: 'MachineLearning:hot',
          priority: 72,
          maxItems: 20,
        }),
        lane({
          laneId: 'reddit-comments',
          sourceKey: 'reddit',
          kind: 'thread_enrichment',
          operation: 'enrichment',
          query: 'AI agents MCP Claude Code',
          priority: 40,
          maxItems: 10,
          parameters: {
            maxCommentsPerPost: 20,
            commentSort: 'confidence',
          },
        }),
      ],
    });
    const fetcher = new RegistrySourceFetcherAdapter(
      new InMemorySourceProviderRegistry([provider], []),
      {
        async readConfig() {
          return {
            sourceQueryPlanner: {
              enabled: true,
              communities: ['LocalLLaMA', 'MachineLearning'],
            },
          };
        },
      } satisfies SourceConfigReaderPort,
      planner,
    );

    await fetcher.fetch({
      tenantId: tenantId('tenant-registry-fetcher'),
      workspaceId: workspaceId('workspace-registry-fetcher'),
      sourceBindingId: 'source-binding-registry-fetcher',
      scanJobId: 'scan-job-registry-fetcher',
      providerKey: 'reddit',
      sourceQuery: { mode: 'search', query: 'AI agents MCP Claude Code' },
      correlationId: 'correlation-registry-fetcher',
    });

    expect(provider.observedQuery).toMatchObject({
      mode: 'search',
      query: 'AI agents MCP Claude Code',
    });
    expect(provider.observedContext?.config).toMatchObject({
      maxItems: 55,
      includeComments: true,
      maxCommentedPosts: 10,
      maxCommentsPerPost: 20,
      commentSort: 'confidence',
      scanPasses: [
        {
          mode: 'search',
          query: 'AI agents MCP Claude Code',
          maxItems: 15,
          allowedSubreddits: ['LocalLLaMA', 'MachineLearning'],
        },
        {
          mode: 'listing',
          subreddit: 'LocalLLaMA',
          listing: 'top',
          maxItems: 20,
          topTime: 'week',
        },
        {
          mode: 'listing',
          subreddit: 'MachineLearning',
          listing: 'hot',
          maxItems: 20,
        },
      ],
    });
  });

  it('adaptively reads additional cursor pages until enough unique items are collected', async () => {
    const provider = new PagingProvider('opaque');
    const result = await fetchPagingSource(provider);
    expect(provider.observedCursors).toEqual([undefined, 'page-2']);
    expect(result.items.map((item) => item.externalId)).toEqual([
      'paging:1',
      'paging:2',
      'paging:3',
      'paging:4',
    ]);
    expect(result.nextCursor).toBe('page-3');
    expect(result.warnings).toContain(
      'adaptive_pagination.stats;pages=2;items=4;duplicates=1;stop=target_items',
    );
  });

  it('does not adaptively paginate time-cursor providers', async () => {
    const provider = new PagingProvider('time');
    const result = await fetchPagingSource(provider);
    expect(provider.observedCursors).toEqual([undefined]);
    expect(result.items.map((item) => item.externalId)).toEqual([
      'paging:1',
      'paging:2',
    ]);
    expect(result.warnings).toContain(
      'adaptive_pagination.disabled:unsupported_cursor_model:time',
    );
  });

  it('rejects unknown providers before scanning', async () => {
    const fetcher = new RegistrySourceFetcherAdapter(new InMemorySourceProviderRegistry([], []));

    await expect(fetcher.fetch({
      tenantId: tenantId('tenant-registry-fetcher'),
      workspaceId: workspaceId('workspace-registry-fetcher'),
      sourceBindingId: 'source-binding-registry-fetcher',
      scanJobId: 'scan-job-registry-fetcher',
      providerKey: 'missing-source',
      sourceQuery: { mode: 'search', query: 'registry monitoring' },
      correlationId: 'correlation-registry-fetcher',
    })).rejects.toThrow('Source provider not registered: missing-source');
  });

  it('rejects invalid provider queries before scanning', async () => {
    const fetcher = new RegistrySourceFetcherAdapter(
      new InMemorySourceProviderRegistry([new FakeSourceProvider()], []),
    );
    await expect(fetcher.fetch({
      tenantId: tenantId('tenant-registry-fetcher'),
      workspaceId: workspaceId('workspace-registry-fetcher'),
      sourceBindingId: 'source-binding-registry-fetcher',
      scanJobId: 'scan-job-registry-fetcher',
      providerKey: 'fake-source',
      sourceQuery: { mode: 'thread', query: 'registry monitoring' },
      correlationId: 'correlation-registry-fetcher',
    })).rejects.toThrow('Unsupported query mode: thread');
  });
});

class StaticPlanner implements SourceQueryPlannerPort {
  observedIntent: SourceQueryPlannerIntent | undefined;

  constructor(private readonly plan: SourceQueryPlan) {}

  async compilePlan(params: {
    readonly intent: SourceQueryPlannerIntent;
  }): Promise<SourceQueryPlan> {
    this.observedIntent = params.intent;

    return {
      ...this.plan,
      intent: params.intent,
    };
  }
}

class CapturingProvider implements SourceProviderPort {
  observedQuery: SourceQuery | undefined;
  observedContext: SourceProviderScanContext | undefined;

  constructor(private readonly providerKey: string) {}

  key(): string {
    return this.providerKey;
  }

  capabilityProfile(): SourceCapabilityProfile {
    return {
      providerKey: this.providerKey,
      displayName: this.providerKey,
      version: 1,
      productionSafe: true,
      supportedContentUnits: ['post'],
      supportedQueryModes: ['search'],
      cursorModel: 'opaque',
      stableIdentity: ['externalId'],
      quotaModel: 'none',
      limitations: [],
    };
  }

  validateBinding(query: SourceQuery): SourceProviderValidationResult {
    return query.mode === 'search'
      ? { ok: true }
      : { ok: false, reason: `Unsupported query mode: ${query.mode}` };
  }

  planScan(
    query: SourceQuery,
    context: SourceProviderScanContext,
  ): SourceProviderScanPlan {
    this.observedQuery = query;
    this.observedContext = context;

    return {
      query,
      maxItems: 1,
    };
  }

  async scan(): Promise<SourceProviderScanResult> {
    return {
      items: [],
      warnings: ['provider warning'],
    };
  }

  classifyError(error: unknown): ProviderFailure {
    return {
      kind: 'unknown',
      retryable: false,
      message: error instanceof Error ? error.message : 'Unknown provider error',
    };
  }
}

class PagingProvider implements SourceProviderPort {
  readonly observedCursors: Array<string | undefined> = [];

  constructor(private readonly cursorModel: SourceCursorModel) {}

  key(): string {
    return 'paging-source';
  }

  capabilityProfile(): SourceCapabilityProfile {
    return {
      providerKey: 'paging-source',
      displayName: 'Paging Source',
      version: 1,
      productionSafe: true,
      supportedContentUnits: ['post'],
      supportedQueryModes: ['search'],
      cursorModel: this.cursorModel,
      stableIdentity: ['externalId', 'canonicalUrl'],
      quotaModel: 'none',
      limitations: [],
    };
  }

  validateBinding(query: SourceQuery): SourceProviderValidationResult {
    return query.mode === 'search'
      ? { ok: true }
      : { ok: false, reason: `Unsupported query mode: ${query.mode}` };
  }

  planScan(query: SourceQuery): SourceProviderScanPlan {
    return {
      query,
      maxItems: 2,
    };
  }

  async scan(plan: SourceProviderScanPlan): Promise<SourceProviderScanResult> {
    this.observedCursors.push(plan.cursor);

    if (plan.cursor === undefined) {
      return {
        items: [fetchedItem('paging:1'), fetchedItem('paging:2')],
        nextCursor: 'page-2',
        warnings: ['first page warning'],
      };
    }

    if (plan.cursor === 'page-2') {
      return {
        items: [
          fetchedItem('paging:2'),
          fetchedItem('paging:3'),
          fetchedItem('paging:4'),
        ],
        nextCursor: 'page-3',
        warnings: ['second page warning'],
      };
    }

    return {
      items: [fetchedItem('paging:5')],
      warnings: [],
    };
  }

  classifyError(error: unknown): ProviderFailure {
    return {
      kind: 'unknown',
      retryable: false,
      message: error instanceof Error ? error.message : 'Unknown provider error',
    };
  }
}

class WindowedProvider implements SourceProviderPort {
  key(): string {
    return 'windowed-source';
  }

  capabilityProfile(): SourceCapabilityProfile {
    return {
      providerKey: 'windowed-source',
      displayName: 'Windowed Source',
      version: 1,
      productionSafe: true,
      supportedContentUnits: ['post', 'comment'],
      supportedQueryModes: ['search'],
      cursorModel: 'opaque',
      stableIdentity: ['externalId', 'canonicalUrl'],
      quotaModel: 'none',
      limitations: [],
    };
  }

  validateBinding(query: SourceQuery): SourceProviderValidationResult {
    return query.mode === 'search'
      ? { ok: true }
      : { ok: false, reason: `Unsupported query mode: ${query.mode}` };
  }

  planScan(query: SourceQuery): SourceProviderScanPlan {
    return {
      query,
      maxItems: 2,
    };
  }

  async scan(): Promise<SourceProviderScanResult> {
    return {
      items: [
        fetchedItem('inside-window', '2026-07-07T12:00:00.000Z'),
        fetchedItem('outside-window', '2026-07-06T12:00:00.000Z'),
      ],
      conversationUnits: [
        conversationUnit('inside-window'),
        conversationUnit('outside-window'),
      ],
      warnings: [],
    };
  }

  classifyError(error: unknown): ProviderFailure {
    return {
      kind: 'unknown',
      retryable: false,
      message: error instanceof Error ? error.message : 'Unknown provider error',
    };
  }
}

const fetchPagingSource = async (provider: PagingProvider) => {
  const fetcher = new RegistrySourceFetcherAdapter(
    new InMemorySourceProviderRegistry([provider], []),
    {
      async readConfig() {
        return {
          adaptivePagination: {
            enabled: true,
            targetItems: 4,
            maxPages: 3,
            minNewItemsPerPage: 1,
            maxDuplicateRate: 0.9,
          },
        };
      },
    } satisfies SourceConfigReaderPort,
  );

  return fetcher.fetch({
    tenantId: tenantId('tenant-registry-fetcher'),
    workspaceId: workspaceId('workspace-registry-fetcher'),
    sourceBindingId: 'source-binding-registry-fetcher',
    scanJobId: 'scan-job-registry-fetcher',
    providerKey: 'paging-source',
    sourceQuery: { mode: 'search', query: 'AI agents' },
    correlationId: 'correlation-registry-fetcher',
  });
};

const lane = (
  params: Omit<SourceQueryPlan['lanes'][number], 'reason'> & {
    readonly reason?: string;
  },
): SourceQueryPlan['lanes'][number] => ({
  reason: 'test lane',
  ...params,
});

const fetchedItem = (
  externalId: string,
  publishedAt = '2026-01-01T00:00:00.000Z',
): FetchedSourceItem => ({
  externalId,
  canonicalUrl: `https://example.test/${externalId}`,
  title: externalId,
  body: externalId,
  publishedAt: new Date(publishedAt),
});

const conversationUnit = (rootExternalId: string) => ({
  rootExternalId,
  rootProviderItemId: rootExternalId,
  providerUnitId: `${rootExternalId}:comment`,
  canonicalUrl: `https://example.test/${rootExternalId}#comment`,
  body: `Comment for ${rootExternalId}`,
  publishedAt: new Date('2026-07-07T12:30:00.000Z'),
  threadExternalId: rootExternalId,
  depth: 0,
  role: 'top_level_comment' as const,
});
