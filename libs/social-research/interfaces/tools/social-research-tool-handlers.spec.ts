import type { SocialResearchGateway } from '../../application/contracts/social-research-gateway';
import { SocialResearchToolHandlers } from './social-research-tool-handlers';
import { socialResearchToolDefinitions } from './social-research-tool-schemas';

describe('SocialResearchToolHandlers', () => {
  it('exposes the MCP-facing tool names without requiring the MCP SDK', () => {
    expect(socialResearchToolDefinitions.map((tool) => tool.name)).toEqual([
      'search_social',
      'explain_search_plan',
      'fetch_thread',
      'rank_results',
      'list_social_sources',
      'explain_source_readiness',
    ]);
  });

  it('explains a social search plan with account and mention lanes', () => {
    const handlers = new SocialResearchToolHandlers();

    const result = handlers.explainSearchPlan({
      topic: 'AI coding agents',
      sources: 'x-twitter',
      accounts: '@openai',
      products: 'OpenAI Codex',
      depth: 'balanced',
    });

    expect(result.plan.lanes.map((lane) => lane.kind)).toEqual(
      expect.arrayContaining([
        'general',
        'account_posts',
        'account_mentions',
        'product_or_group',
      ]),
    );
    expect(result.explanation).toContain(
      'x-twitter/account_posts: from:openai',
    );
    expect(result.plan.trace).toMatchObject({
      planner: {
        defaultSourcesUsed: false,
      },
      sources: [
        expect.objectContaining({
          sourceKey: 'x-twitter',
          selection: 'explicit',
          plannedLaneCount: 5,
        }),
      ],
    });
  });

  it('keeps canonical entities input compatible for existing callers', () => {
    const handlers = new SocialResearchToolHandlers();

    const result = handlers.explainSearchPlan({
      topic: 'Claude Code MCP',
      sources: ['reddit'],
      entities: {
        communities: ['ClaudeAI'],
        keywords: ['MCP'],
      },
    });

    expect(result.plan.lanes.map((lane) => lane.kind)).toEqual(
      expect.arrayContaining(['community_listing', 'keyword_group']),
    );
  });

  it('passes readiness planner options through MCP-facing inputs', () => {
    const handlers = new SocialResearchToolHandlers();

    const result = handlers.explainSearchPlan({
      topic: 'OpenAI Codex launch',
      sources: 'x-twitter',
      executionAllowedRuntimeReadiness: ['deferred'],
    });

    expect(
      result.plan.warnings.some(
        (warning) => warning.code === 'source_runtime_not_ready',
      ),
    ).toBe(false);
  });

  it('executes search_social through the SDK gateway and serializes dates', async () => {
    const calls: string[] = [];
    const handlers = new SocialResearchToolHandlers({
      gateway: fakeGateway(calls),
    });

    const result = await handlers.searchSocial({
      topic: 'AI coding agents',
      sources: ['reddit'],
      depth: 'light',
      execution: serializableExecutionScope(),
    });

    expect(calls).toEqual(['AI coding agents']);
    expect(result.items[0]?.publishedAt).toBe('2026-07-04T00:00:00.000Z');
    expect(result.rankedItems?.[0]?.item.publishedAt).toBe(
      '2026-07-04T00:00:00.000Z',
    );
    expect(result.trace).toMatchObject({
      cache: {
        status: 'disabled',
      },
      execution: {
        gatewayInvoked: true,
        sourceKeys: ['reddit'],
      },
    });
  });

  it('delegates fetch_thread through the SDK gateway', async () => {
    const threadCalls: string[] = [];
    const handlers = new SocialResearchToolHandlers({
      gateway: fakeGateway([], threadCalls),
    });

    const result = await handlers.fetchThread({
      canonicalUrl: 'https://example.test/thread',
      maxDepth: 2,
      execution: serializableExecutionScope(),
    });

    expect(threadCalls).toEqual(['binding-reddit']);
    expect(result.root.itemId).toBe('thread-root');
    expect(result.units[0]?.publishedAt).toBe('2026-07-04T01:00:00.000Z');
  });

  it('ranks normalized items with relevance-first behavior', () => {
    const handlers = new SocialResearchToolHandlers();

    const result = handlers.rankResults({
      topic: 'Claude Code MCP server',
      goal: 'research',
      items: [
        {
          itemId: 'viral',
          sourceKey: 'reddit',
          canonicalUrl: 'https://example.test/viral',
          title: 'Funny AI meme',
          body: 'general humor',
          metrics: { likes: 20_000 },
        },
        {
          itemId: 'relevant',
          sourceKey: 'reddit',
          canonicalUrl: 'https://example.test/relevant',
          title: 'Claude Code MCP server regression',
          body: 'MCP server tool call issue in Claude Code',
          metrics: { likes: 5 },
        },
      ],
    });

    expect(result[0]?.item.itemId).toBe('relevant');
    expect(result[0]?.ranking.recipeId).toBe(
      'default-relevance-first-social-ranking-v1',
    );
  });

  it('passes ranking recipes through rank_results', () => {
    const handlers = new SocialResearchToolHandlers();

    const result = handlers.rankResults({
      topic: 'Claude Code MCP server',
      goal: 'trend',
      rankingRecipe: {
        recipeKind: 'social_ranking_recipe_v1',
        recipeId: 'mcp-relevance-first-v1',
        weightsByGoal: {
          trend: {
            relevance: 0.9,
            engagement: 0.1,
          },
        },
        engagement: {
          maxScore: 15,
        },
        quality: {
          penalties: {
            low_context: 0,
          },
        },
      },
      items: [
        {
          itemId: 'viral',
          sourceKey: 'reddit',
          canonicalUrl: 'https://example.test/viral',
          title: 'AI discussion',
          body: 'not much detail',
          metrics: { likes: 50_000 },
        },
        {
          itemId: 'specific',
          sourceKey: 'reddit',
          canonicalUrl: 'https://example.test/specific',
          title: 'Claude Code MCP server issue',
          body: 'Claude Code MCP server details',
          metrics: { likes: 5 },
        },
      ],
    });

    expect(result[0]?.item.itemId).toBe('specific');
    expect(result[0]?.ranking.recipeId).toBe('mcp-relevance-first-v1');
    expect(result[0]?.ranking.qualityScore).toBeGreaterThan(0);
  });

  it('lists source registry profiles without provider execution', () => {
    const handlers = new SocialResearchToolHandlers();

    const result = handlers.listSocialSources({
      sourceKeys: ['reddit', 'x-twitter'],
    });

    expect(result.sources.map((source) => source.sourceKey)).toEqual([
      'reddit',
      'x-twitter',
    ]);
    expect(result.sources[0]?.certification.level).toBe('fixture_certified');
    expect(result.sources[1]?.certification.level).toBe(
      'provider_runtime_gated',
    );
  });

  it('explains source readiness from the SDK registry', () => {
    const handlers = new SocialResearchToolHandlers();

    const result = handlers.explainSourceReadiness({
      sourceKey: 'x-twitter',
    });

    expect(result.source.sourceKey).toBe('x-twitter');
    expect(result.canPlan).toBe(true);
    expect(result.canExecuteWithDefaultPolicy).toBe(false);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        'Provider runtime is gated and must not be enabled implicitly.',
      ]),
    );
  });
});

const fakeGateway = (
  calls: string[],
  threadCalls: string[] = [],
): SocialResearchGateway => ({
  async executeSearchPlan(command) {
    calls.push(command.plan.normalizedTopic);
    const item = {
      itemId: 'item-1',
      sourceKey: 'reddit',
      canonicalUrl: 'https://example.test/item-1',
      title: 'AI coding agents',
      body: 'AI coding agents are useful for research.',
      publishedAt: new Date('2026-07-04T00:00:00.000Z'),
    } as const;

    return {
      plan: command.plan,
      items: [item],
      rankedItems: [
        {
          item,
          ranking: {
            recipeId: 'default-relevance-first-social-ranking-v1',
            score: 90,
            relevanceScore: 90,
            engagementScore: 0,
            recencyScore: 0,
            qualityScore: 100,
            qualitySignals: [],
            reasons: ['strong_topic_match'],
          },
        },
      ],
      warnings: [],
      partial: false,
    };
  },
  async fetchThread(command) {
    if (command.execution !== undefined) {
      threadCalls.push(
        command.execution.sourceBindingIdBySource.reddit ?? 'missing',
      );
    }

    return {
      root: {
        itemId: 'thread-root',
        sourceKey: 'reddit',
        canonicalUrl: 'https://example.test/thread',
        title: 'Thread root',
        body: 'Root body',
        publishedAt: new Date('2026-07-04T00:00:00.000Z'),
      },
      units: [
        {
          unitId: 'comment-1',
          body: 'Comment body',
          publishedAt: new Date('2026-07-04T01:00:00.000Z'),
        },
      ],
      warnings: [],
    };
  },
});

const serializableExecutionScope = () => ({
  tenantId: 'tenant-tools-test',
  workspaceId: 'workspace-tools-test',
  scanJobId: 'scan-tools-test',
  sourceBindingIdBySource: {
    reddit: 'binding-reddit',
  },
});
