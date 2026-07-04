import { SocialResearchSourceQueryPlannerAdapter } from './social-research-source-query-planner.adapter';

describe('SocialResearchSourceQueryPlannerAdapter', () => {
  it('maps social-research X lanes to ingestion source query lanes', async () => {
    const planner = new SocialResearchSourceQueryPlannerAdapter();

    const plan = await planner.compilePlan({
      intent: {
        topic: 'OpenAI Codex CLI release MCP',
        sourceKeys: ['x-twitter'],
        products: ['Codex CLI', 'MCP'],
        handles: [{ handle: 'OpenAI', sourceKey: 'x-twitter' }],
        maxLanesPerSource: 8,
        maxItemsPerLane: 25,
        includeEnrichment: false,
      },
    });

    expect(plan.plannerId).toBe('experiment:social-research-query-planner');
    expect(plan.lanes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceKey: 'x-twitter',
          kind: 'account_posts',
          operation: 'account_feed',
          query: 'from:openai',
        }),
        expect.objectContaining({
          sourceKey: 'x-twitter',
          kind: 'account_mentions',
          operation: 'mention_search',
          query: '@openai',
        }),
        expect.objectContaining({
          kind: 'product_or_group',
          query: '"Codex CLI" OR MCP',
        }),
      ]),
    );
  });

  it('maps Reddit community listing lanes and bounded enrichment', async () => {
    const planner = new SocialResearchSourceQueryPlannerAdapter();

    const plan = await planner.compilePlan({
      intent: {
        topic: 'AI agents MCP Claude Code reliability',
        sourceKeys: ['reddit'],
        communities: [
          {
            name: 'ClaudeAI',
            sourceKey: 'reddit',
            listings: ['top', 'hot', 'new'],
          },
        ],
        maxLanesPerSource: 8,
        maxItemsPerLane: 25,
        includeEnrichment: true,
      },
    });

    expect(plan.lanes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'community_listing',
          operation: 'listing',
          query: 'claudeai:top',
          parameters: {
            topTime: 'week',
          },
        }),
        expect.objectContaining({
          kind: 'community_listing',
          operation: 'listing',
          query: 'claudeai:hot',
        }),
        expect.objectContaining({
          kind: 'community_listing',
          operation: 'listing',
          query: 'claudeai:new',
        }),
        expect.objectContaining({
          kind: 'thread_enrichment',
          operation: 'enrichment',
          maxItems: 10,
        }),
      ]),
    );
    expect(plan.lanes.find((lane) => lane.query === 'claudeai:hot')).toEqual(
      expect.objectContaining({
        parameters: undefined,
      }),
    );
  });
});
