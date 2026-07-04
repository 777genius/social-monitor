import { DefaultSourceQueryPlanRuntimeCompiler } from './source-query-plan-runtime-compiler';

describe('DefaultSourceQueryPlanRuntimeCompiler', () => {
  it('compiles Reddit query-plan lanes into bounded scan passes', () => {
    const compiler = new DefaultSourceQueryPlanRuntimeCompiler();

    const result = compiler.compile({
      providerKey: 'reddit',
      originalSourceQuery: { mode: 'search', query: 'AI agents' },
      plan: {
        plannerId: 'test-planner',
        intent: {
          topic: 'AI agents',
          sourceKeys: ['reddit'],
        },
        warnings: [],
        lanes: [
          {
            laneId: 'reddit:general:ai-agents',
            sourceKey: 'reddit',
            kind: 'general',
            operation: 'search',
            query: 'AI agents',
            priority: 100,
            maxItems: 40,
            reason: 'primary topic search',
          },
          {
            laneId: 'reddit:search_variant:ai-agents:top-week',
            sourceKey: 'reddit',
            kind: 'search_variant',
            operation: 'search',
            query: 'AI agents',
            priority: 86,
            maxItems: 20,
            reason: 'weekly high-engagement Reddit search pass',
            parameters: { searchSort: 'top', searchTime: 'week' },
          },
          {
            laneId: 'reddit:community_listing:claudeai-top',
            sourceKey: 'reddit',
            kind: 'community_listing',
            operation: 'listing',
            query: 'claudeai:top',
            priority: 88,
            maxItems: 40,
            reason: 'claudeai top listing lane',
            parameters: { topTime: 'week' },
          },
          {
            laneId: 'reddit:thread_enrichment:ai-agents',
            sourceKey: 'reddit',
            kind: 'thread_enrichment',
            operation: 'enrichment',
            query: 'AI agents',
            priority: 84,
            maxItems: 10,
            reason: 'fetch comments only for top selected posts',
            parameters: { maxCommentsPerPost: 20, commentSort: 'top' },
          },
        ],
      },
    });

    expect(result).toMatchObject({
      applied: true,
      warnings: [],
      sourceQuery: {
        mode: 'search',
        query: 'AI agents',
        parameters: expect.objectContaining({
          includeComments: true,
          maxCommentsPerPost: 20,
          commentSort: 'top',
          scanPasses: expect.arrayContaining([
            expect.objectContaining({
              mode: 'search',
              query: 'AI agents',
              searchSort: 'new',
              allowedSubreddits: ['claudeai'],
            }),
            expect.objectContaining({
              mode: 'search',
              query: 'AI agents',
              searchSort: 'top',
              searchTime: 'week',
              allowedSubreddits: ['claudeai'],
            }),
            expect.objectContaining({
              mode: 'listing',
              subreddit: 'claudeai',
              listing: 'top',
              topTime: 'week',
            }),
          ]),
        }),
      },
    });
  });

  it('compiles X query-plan lanes into one bounded multi-query search', () => {
    const compiler = new DefaultSourceQueryPlanRuntimeCompiler();

    const result = compiler.compile({
      providerKey: 'x-twitter',
      originalSourceQuery: { mode: 'search', query: 'AI coding agents MCP' },
      plan: {
        plannerId: 'test-planner',
        intent: {
          topic: 'AI coding agents MCP',
          sourceKeys: ['x-twitter'],
        },
        warnings: [],
        lanes: [
          {
            laneId: 'x-twitter:general:ai-coding-agents-mcp',
            sourceKey: 'x-twitter',
            kind: 'general',
            operation: 'search',
            query: 'AI coding agents MCP',
            priority: 100,
            maxItems: 40,
            reason: 'primary topic search',
          },
          {
            laneId: 'x-twitter:account_posts:openai',
            sourceKey: 'x-twitter',
            kind: 'account_posts',
            operation: 'account_feed',
            query: 'from:openai',
            priority: 95,
            maxItems: 40,
            reason: 'official account lane, ranked against the topic',
          },
          {
            laneId: 'x-twitter:product_or_group:claude-code-openai-codex',
            sourceKey: 'x-twitter',
            kind: 'product_or_group',
            operation: 'search',
            query: '"Claude Code" OR "OpenAI Codex"',
            priority: 90,
            maxItems: 40,
            reason: 'product and entity recall lane',
          },
          {
            laneId: 'x-twitter:account_mentions:openai',
            sourceKey: 'x-twitter',
            kind: 'account_mentions',
            operation: 'mention_search',
            query: '@openai',
            priority: 85,
            maxItems: 40,
            reason: 'public mention lane around an account or product handle',
          },
        ],
      },
    });

    expect(result).toMatchObject({
      applied: true,
      warnings: [],
      sourceQuery: {
        mode: 'search',
        query: 'AI coding agents MCP',
        parameters: expect.objectContaining({
          maxItems: 100,
          maxSearchQueries: 4,
          searchQueries: [
            'AI coding agents MCP',
            'from:openai',
            '"Claude Code" OR "OpenAI Codex"',
            '@openai',
          ],
        }),
      },
    });
  });
});
