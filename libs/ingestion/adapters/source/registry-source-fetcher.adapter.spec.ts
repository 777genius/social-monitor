import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import type { SourceQueryPlan, SourceQueryPlannerIntent } from '../../domain';
import type {
  ProviderFailure,
  SourceCapabilityProfile,
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

const lane = (
  params: Omit<SourceQueryPlan['lanes'][number], 'reason'> & {
    readonly reason?: string;
  },
): SourceQueryPlan['lanes'][number] => ({
  reason: 'test lane',
  ...params,
});
