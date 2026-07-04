import {
  SocialResearchSdk,
  SocialResearchSdkError,
  type SocialResearchExecutionPolicyPort,
  type SocialResearchResultCachePort,
  type SocialResearchGateway,
  type SocialSourceLaneStrategy,
} from '@social-monitor/social-research';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

describe('SocialResearchSdk', () => {
  it('delegates executable searches to an injected gateway', async () => {
    const calls: string[] = [];
    const gateway: SocialResearchGateway = {
      async executeSearchPlan(command) {
        calls.push(command.plan.normalizedTopic);

        return {
          plan: command.plan,
          items: [],
          warnings: [],
          partial: false,
        };
      },
      async fetchThread() {
        throw new Error('not used');
      },
    };
    const sdk = new SocialResearchSdk({ gateway });

    await sdk.search({
      topic: 'AI coding agents',
      sources: ['reddit'],
    });

    expect(calls).toEqual(['AI coding agents']);
  });

  it('attaches execution trace metadata to uncached searches', async () => {
    const sdk = new SocialResearchSdk({
      gateway: {
        async executeSearchPlan(command) {
          return {
            plan: command.plan,
            items: [],
            warnings: [],
            partial: false,
          };
        },
        async fetchThread() {
          throw new Error('not used');
        },
      },
    });

    const run = await sdk.search({
      topic: 'AI coding agents',
      sources: ['reddit'],
    });

    expect(run.trace).toEqual({
      cache: {
        status: 'disabled',
        cacheKeyAvailable: false,
      },
      execution: {
        gatewayInvoked: true,
        authorizedLaneCount: run.plan.lanes.length,
        sourceKeys: ['reddit'],
      },
    });
  });

  it('executes ergonomic request input through the canonical search use case', async () => {
    const calls: string[] = [];
    const gateway: SocialResearchGateway = {
      async executeSearchPlan(command) {
        calls.push(command.plan.lanes.map((lane) => lane.query).join('|'));

        return {
          plan: command.plan,
          items: [],
          warnings: [],
          partial: false,
        };
      },
      async fetchThread() {
        throw new Error('not used');
      },
    };
    const sdk = new SocialResearchSdk({ gateway });

    await sdk.searchRequest({
      topic: 'AI agents MCP Claude Code reliability',
      preset: 'broad_research',
      sources: 'reddit',
      communities: {
        name: 'ClaudeAI',
        sourceKey: 'reddit',
        listings: ['top'],
      },
    });

    expect(calls[0]).toContain('AI agents MCP Claude Code reliability');
    expect(calls[0]).toContain('claudeai:top');
  });

  it('throws a typed SDK error before execution when intent is invalid', async () => {
    const sdk = new SocialResearchSdk({
      gateway: {
        async executeSearchPlan() {
          throw new Error('should not execute');
        },
        async fetchThread() {
          throw new Error('not used');
        },
      },
    });

    await expect(sdk.search({ topic: ' ' })).rejects.toMatchObject({
      name: 'SocialResearchSdkError',
      code: 'invalid_search_intent',
      details: [
        {
          code: 'topic_required',
        },
      ],
    });
  });

  it('returns a typed failure result for invalid safe searches', async () => {
    const sdk = new SocialResearchSdk({
      gateway: {
        async executeSearchPlan() {
          throw new Error('should not execute');
        },
        async fetchThread() {
          throw new Error('not used');
        },
      },
    });

    const result = await sdk.trySearch({ topic: ' ' });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error).toMatchObject({
      code: 'invalid_search_intent',
      details: [
        {
          code: 'topic_required',
        },
      ],
    });
  });

  it('returns a typed failure result for invalid safe request searches', async () => {
    const sdk = new SocialResearchSdk();

    const result = await sdk.trySearchRequest({ topic: ' ' });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error).toMatchObject({
      code: 'invalid_search_intent',
      details: [
        {
          code: 'topic_required',
        },
      ],
    });
  });

  it('keeps execution methods unavailable without a gateway', async () => {
    const sdk = new SocialResearchSdk();

    await expect(
      sdk.search({
        topic: 'AI coding agents',
        sources: ['reddit'],
      }),
    ).rejects.toBeInstanceOf(SocialResearchSdkError);
  });

  it('ranks results with an optional serializable ranking recipe', () => {
    const sdk = new SocialResearchSdk();

    const ranked = sdk.rankResults({
      intent: {
        topic: 'Claude Code MCP server',
        goal: 'trend',
      },
      rankingRecipe: {
        recipeKind: 'social_ranking_recipe_v1',
        recipeId: 'sdk-relevance-heavy-v1',
        weightsByGoal: {
          trend: {
            relevance: 0.9,
            engagement: 0.1,
          },
        },
        engagement: {
          maxScore: 10,
        },
      },
      items: [
        {
          itemId: 'viral',
          sourceKey: 'reddit',
          canonicalUrl: 'https://example.test/viral',
          title: 'Generic AI discussion',
          body: 'high engagement thread',
          metrics: { likes: 100_000 },
        },
        {
          itemId: 'specific',
          sourceKey: 'reddit',
          canonicalUrl: 'https://example.test/specific',
          title: 'Claude Code MCP server',
          body: 'Claude Code MCP server workflow notes.',
          metrics: { likes: 3 },
        },
      ],
    });

    expect(ranked[0]?.item.itemId).toBe('specific');
    expect(ranked[0]?.ranking.recipeId).toBe('sdk-relevance-heavy-v1');
  });

  it('lists and filters source registry profiles without a gateway', () => {
    const sdk = new SocialResearchSdk();

    const sources = sdk.listSources({
      sourceKeys: ['reddit', 'x-twitter'],
    });

    expect(sources.map((source) => source.sourceKey)).toEqual([
      'reddit',
      'x-twitter',
    ]);
    expect(sources[0]?.certification).toMatchObject({
      level: 'fixture_certified',
      runtimeReadiness: 'fixture_ready',
    });
  });

  it('explains provider-gated source readiness without provider execution', () => {
    const sdk = new SocialResearchSdk();

    const readiness = sdk.explainSourceReadiness('x-twitter');

    expect(readiness).toMatchObject({
      canPlan: true,
      canExecuteWithDefaultPolicy: false,
      source: {
        sourceKey: 'x-twitter',
        certification: {
          level: 'provider_runtime_gated',
          runtimeAdapterPolicy: 'private_service_required',
        },
      },
    });
    expect(readiness.warnings).toEqual(
      expect.arrayContaining([
        'Provider runtime is gated and must not be enabled implicitly.',
      ]),
    );
  });

  it('returns a typed failure when a source profile is missing', () => {
    const sdk = new SocialResearchSdk();

    const result = sdk.tryGetSourceProfile({ sourceKey: 'unknown-source' });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error).toMatchObject({
      code: 'source_not_found',
      message: 'Social source is not registered: unknown-source.',
      details: [],
    });
  });

  it('passes the default execution scope to thread fetches', async () => {
    const calls: string[] = [];
    const gateway: SocialResearchGateway = {
      async executeSearchPlan() {
        throw new Error('not used');
      },
      async fetchThread(command) {
        calls.push(command.execution?.sourceBindingIdBySource.reddit ?? 'none');

        return {
          root: {
            itemId: 'reddit:t3_thread',
            sourceKey: 'reddit',
            canonicalUrl: 'https://www.reddit.com/r/test/comments/thread',
            title: 'Thread',
            body: 'Thread body',
          },
          units: [],
          warnings: [],
        };
      },
    };
    const sdk = new SocialResearchSdk({
      gateway,
      defaultExecutionScope: {
        tenantId: tenantId('tenant-sdk-test'),
        workspaceId: workspaceId('workspace-sdk-test'),
        scanJobId: 'scan-sdk-test',
        sourceBindingIdBySource: {
          reddit: 'binding-reddit',
        },
      },
    });

    await sdk.fetchThread({
      sourceKey: 'reddit',
      externalId: 'reddit:t3_thread',
    });

    expect(calls).toEqual(['binding-reddit']);
  });

  it('blocks provider execution when the execution policy denies a search', async () => {
    const sdk = new SocialResearchSdk({
      gateway: {
        async executeSearchPlan() {
          throw new Error('should not execute');
        },
        async fetchThread() {
          throw new Error('not used');
        },
      },
      executionPolicy: {
        async authorizeSearch() {
          return {
            allowed: false,
            reason: 'manual research quota exceeded',
          };
        },
        async authorizeThreadFetch() {
          return { allowed: true };
        },
      } satisfies SocialResearchExecutionPolicyPort,
    });

    await expect(
      sdk.search({
        topic: 'AI coding agents',
        sources: ['reddit'],
      }),
    ).rejects.toMatchObject({
      code: 'execution_denied',
      message: 'manual research quota exceeded',
    });
  });

  it('preserves retry metadata for denied safe searches', async () => {
    const sdk = new SocialResearchSdk({
      gateway: {
        async executeSearchPlan() {
          throw new Error('should not execute');
        },
        async fetchThread() {
          throw new Error('not used');
        },
      },
      executionPolicy: {
        async authorizeSearch() {
          return {
            allowed: false,
            reason: 'manual research quota exceeded',
            retryAfterMs: 30_000,
          };
        },
        async authorizeThreadFetch() {
          return { allowed: true };
        },
      } satisfies SocialResearchExecutionPolicyPort,
    });

    const result = await sdk.trySearch({
      topic: 'AI coding agents',
      sources: ['reddit'],
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.error).toMatchObject({
      code: 'execution_denied',
      message: 'manual research quota exceeded',
      retryAfterMs: 30_000,
    });
  });

  it('returns cached search results when policy provides a cache key', async () => {
    const gatewayCalls: string[] = [];
    const cacheReadScopes: unknown[] = [];
    const cachedRun = {
      plan: validPlan(),
      items: [],
      warnings: ['cached'],
      partial: false,
    };
    const sdk = new SocialResearchSdk({
      gateway: {
        async executeSearchPlan() {
          gatewayCalls.push('search');
          throw new Error('should not execute on cache hit');
        },
        async fetchThread() {
          throw new Error('not used');
        },
      },
      executionPolicy: {
        async authorizeSearch() {
          return {
            allowed: true,
            cacheKey: 'search:ai-coding-agents',
            cacheScope: {
              tenantId: tenantId('tenant-sdk-test'),
              workspaceId: workspaceId('workspace-sdk-test'),
            },
          };
        },
        async authorizeThreadFetch() {
          return { allowed: true };
        },
      } satisfies SocialResearchExecutionPolicyPort,
      resultCache: {
        async readSearch(_cacheKey, scope) {
          cacheReadScopes.push(scope);

          return cachedRun;
        },
        async writeSearch() {
          throw new Error('should not write on cache hit');
        },
        async readThread() {
          return null;
        },
        async writeThread() {
          return undefined;
        },
      } satisfies SocialResearchResultCachePort,
    });

    const result = await sdk.search({
      topic: 'AI coding agents',
      sources: ['reddit'],
    });

    expect(result.warnings).toEqual(['cached']);
    expect(result.trace).toEqual({
      cache: {
        status: 'hit',
        cacheKeyAvailable: true,
        scope: {
          tenantId: tenantId('tenant-sdk-test'),
          workspaceId: workspaceId('workspace-sdk-test'),
        },
      },
      execution: {
        gatewayInvoked: false,
        authorizedLaneCount: result.plan.lanes.length,
        sourceKeys: ['reddit'],
      },
    });
    expect(gatewayCalls).toEqual([]);
    expect(cacheReadScopes).toEqual([
      {
        tenantId: tenantId('tenant-sdk-test'),
        workspaceId: workspaceId('workspace-sdk-test'),
      },
    ]);
  });

  it('marks cache write-through after a policy cache miss', async () => {
    const cacheWrites: string[] = [];
    const sdk = new SocialResearchSdk({
      gateway: {
        async executeSearchPlan(command) {
          return {
            plan: command.plan,
            items: [],
            warnings: [],
            partial: false,
          };
        },
        async fetchThread() {
          throw new Error('not used');
        },
      },
      executionPolicy: {
        async authorizeSearch() {
          return {
            allowed: true,
            cacheKey: 'search:ai-coding-agents',
            cacheScope: {
              tenantId: tenantId('tenant-sdk-test'),
              workspaceId: workspaceId('workspace-sdk-test'),
            },
          };
        },
        async authorizeThreadFetch() {
          return { allowed: true };
        },
      } satisfies SocialResearchExecutionPolicyPort,
      resultCache: {
        async readSearch() {
          return null;
        },
        async writeSearch(cacheKey) {
          cacheWrites.push(cacheKey);
        },
        async readThread() {
          return null;
        },
        async writeThread() {
          return undefined;
        },
      } satisfies SocialResearchResultCachePort,
    });

    const run = await sdk.search({
      topic: 'AI coding agents',
      sources: ['reddit'],
    });

    expect(cacheWrites).toEqual(['search:ai-coding-agents']);
    expect(run.trace).toEqual({
      cache: {
        status: 'write_through',
        cacheKeyAvailable: true,
        scope: {
          tenantId: tenantId('tenant-sdk-test'),
          workspaceId: workspaceId('workspace-sdk-test'),
        },
      },
      execution: {
        gatewayInvoked: true,
        authorizedLaneCount: run.plan.lanes.length,
        sourceKeys: ['reddit'],
      },
    });
  });

  it('applies default planner options from SDK construction', () => {
    const mastodonStrategy: SocialSourceLaneStrategy = {
      strategyId: 'mastodon-account-search',
      supports: (sourceKey) => sourceKey === 'mastodon',
      buildLanes: ({ sourceKey, handles, budget }) =>
        handles
          .filter((handle) => handle.sourceKey === sourceKey)
          .map((handle) => ({
            laneId: `${sourceKey}:account_mentions:${handle.handle}`,
            sourceKey,
            kind: 'account_mentions',
            operation: 'mention_search',
            query: `@${handle.handle}`,
            priority: 85,
            maxItems: budget.maxItemsPerLane,
            budgetWeight: 1,
            reason: 'custom mastodon account mention lane',
          })),
    };
    const sdk = new SocialResearchSdk({
      defaultPlannerOptions: {
        additionalSourceLaneStrategies: [mastodonStrategy],
      },
    });

    const result = sdk.createSearchPlan({
      topic: 'AI agent launch',
      sources: ['mastodon'],
      entities: {
        handles: [{ handle: 'openai', sourceKey: 'mastodon' }],
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.plan.warnings).toEqual([]);
    expect(result.plan.lanes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceKey: 'mastodon',
          kind: 'account_mentions',
          query: '@openai',
        }),
      ]),
    );
  });

  it('applies default source capability planner options from SDK construction', () => {
    const sdk = new SocialResearchSdk({
      defaultPlannerOptions: {
        disableBuiltInSourceCapabilities: true,
        sourceCapabilities: [
          {
            sourceKey: 'reddit',
            version: 1,
            supportedOperations: ['listing'],
            supportedLaneKinds: ['community_listing'],
          },
        ],
      },
    });

    const result = sdk.createSearchPlan({
      topic: 'AI coding agents',
      sources: ['reddit'],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.plan.lanes).toEqual([]);
    expect(result.plan.warnings).toEqual([
      expect.objectContaining({
        code: 'unsupported_source_capability',
        sourceKey: 'reddit',
      }),
    ]);
  });
});

const validPlan = () => {
  const sdk = new SocialResearchSdk();
  const result = sdk.createSearchPlan({
    topic: 'AI coding agents',
    sources: ['reddit'],
  });

  if (!result.ok) {
    throw new Error('expected valid plan');
  }

  return result.plan;
};
