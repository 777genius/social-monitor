import {
  createSocialSearchIntent,
  planSocialSearch,
} from '@social-monitor/social-research';

describe('createSocialSearchIntent', () => {
  it('builds a canonical intent from ergonomic SDK request input', () => {
    const intent = createSocialSearchIntent({
      topic: '  AI agents MCP Claude Code reliability  ',
      preset: 'trend_scan',
      sources: ['reddit', 'x-twitter', 'reddit'],
      accounts: '@OpenAI',
      handles: [
        {
          handle: ' Anthropic ',
          sourceKey: 'x-twitter',
          includePosts: false,
          includeMentions: true,
        },
      ],
      products: ['Claude Code', 'MCP', 'Claude Code'],
      keywords: 'agent reliability',
      communities: [
        'r/ClaudeAI',
        {
          name: ' LocalLLaMA ',
          sourceKey: 'reddit',
          listings: ['top', 'new'],
        },
      ],
      urls: ' https://example.com/feed.xml ',
    });

    expect(intent).toEqual({
      topic: 'AI agents MCP Claude Code reliability',
      sources: ['reddit', 'x-twitter'],
      window: '7d',
      depth: 'light',
      goal: 'trend',
      entities: {
        handles: [
          '@OpenAI',
          {
            handle: 'Anthropic',
            sourceKey: 'x-twitter',
            includePosts: false,
            includeMentions: true,
          },
        ],
        products: ['Claude Code', 'MCP'],
        keywords: ['agent reliability'],
        communities: [
          'r/ClaudeAI',
          {
            name: 'LocalLLaMA',
            sourceKey: 'reddit',
            listings: ['top', 'new'],
          },
        ],
        urls: ['https://example.com/feed.xml'],
      },
    });
  });

  it('keeps canonical intent compatible with the source-agnostic planner', () => {
    const intent = createSocialSearchIntent({
      topic: 'AI agents MCP Claude Code reliability',
      preset: 'broad_research',
      sources: 'reddit',
      communities: {
        name: 'ClaudeAI',
        sourceKey: 'reddit',
        listings: ['top', 'hot'],
      },
    });

    const result = planSocialSearch(intent);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.plan).toMatchObject({
      window: '30d',
      depth: 'balanced',
      goal: 'research',
    });
    expect(result.plan.lanes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceKey: 'reddit',
          kind: 'community_listing',
          query: 'claudeai:top',
        }),
        expect.objectContaining({
          sourceKey: 'reddit',
          kind: 'community_listing',
          query: 'claudeai:hot',
        }),
        expect.objectContaining({
          sourceKey: 'reddit',
          kind: 'thread_enrichment',
        }),
      ]),
    );
  });

  it('lets explicit fields override preset defaults', () => {
    const intent = createSocialSearchIntent({
      topic: 'AI agents',
      preset: 'competitor_scan',
      window: '7d',
      depth: 'light',
      goal: 'security',
    });

    expect(intent).toMatchObject({
      window: '7d',
      depth: 'light',
      goal: 'security',
    });
  });
});
