import {
  compileSocialQueryStrategyRecipe,
  defaultSocialQueryStrategyRecipe,
} from './social-query-strategy';

describe('compileSocialQueryStrategyRecipe', () => {
  it('builds deterministic semantic query lanes from one research request', () => {
    const plan = compileSocialQueryStrategyRecipe({
      topic: 'AI agents MCP Claude Code',
      urls: ['https://example.com/feed.xml'],
      products: ['Claude Code', 'OpenAI Codex'],
      keywords: ['agent reliability'],
    });

    expect(plan).toMatchObject({
      strategyId: 'default-social-query-strategy',
      recipeId: defaultSocialQueryStrategyRecipe.recipeId,
      fallbackQuery: 'agents mcp claude code',
    });
    expect(plan.lanes).toEqual([
      expect.objectContaining({
        kind: 'general',
        query: 'AI agents MCP Claude Code',
      }),
      expect.objectContaining({
        kind: 'url_feed',
        operation: 'url',
        query: 'https://example.com/feed.xml',
      }),
      expect.objectContaining({
        kind: 'product_or_group',
        query: '"Claude Code" OR "OpenAI Codex"',
      }),
      expect.objectContaining({
        kind: 'keyword_group',
        query: '"agent reliability"',
      }),
      expect.objectContaining({
        kind: 'fallback_short_query',
        query: 'agents mcp claude code',
        maxItemsPolicy: 'fallback_half_min_10',
      }),
    ]);
  });

  it('accepts a serializable recipe for generated SDK query behavior', () => {
    const plan = compileSocialQueryStrategyRecipe(
      {
        topic: 'AI agents MCP Claude Code',
        urls: [],
        products: ['Claude Code', 'OpenAI Codex'],
        keywords: [],
      },
      {
        recipeKind: 'semantic_query_strategy_v1',
        recipeId: 'plain-short-fallback-v1',
        phraseMode: 'plain',
        fallback: {
          maxTokens: 2,
          excludedTokens: ['agents'],
        },
      },
    );

    expect(plan.recipeId).toBe('plain-short-fallback-v1');
    expect(plan.lanes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'product_or_group',
          query: 'Claude Code OR OpenAI Codex',
        }),
        expect.objectContaining({
          kind: 'fallback_short_query',
          query: 'mcp claude',
        }),
      ]),
    );
  });
});
