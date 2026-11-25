import {
  createSocialResearchRequestBuilder,
  SocialResearchRequestBuilder,
} from '@social-monitor/social-research';

describe('SocialResearchRequestBuilder', () => {
  it('builds serializable request input through immutable chaining', () => {
    const base = createSocialResearchRequestBuilder(
      'AI agents MCP Claude Code reliability',
    )
      .preset('broad_research')
      .source('reddit');
    const extended = base
      .source('x-twitter')
      .account('@OpenAI', {
        sourceKey: 'x-twitter',
        includePosts: true,
        includeMentions: true,
      })
      .community('ClaudeAI', {
        sourceKey: 'reddit',
        listings: ['top', 'hot'],
      })
      .products('Claude Code', 'MCP')
      .keyword('agent reliability')
      .url('https://example.com/feed.xml');

    expect(base.build()).toEqual({
      topic: 'AI agents MCP Claude Code reliability',
      preset: 'broad_research',
      sources: ['reddit'],
    });
    expect(extended.build()).toEqual({
      topic: 'AI agents MCP Claude Code reliability',
      preset: 'broad_research',
      sources: ['reddit', 'x-twitter'],
      accounts: [
        {
          handle: '@OpenAI',
          sourceKey: 'x-twitter',
          includePosts: true,
          includeMentions: true,
        },
      ],
      communities: [
        {
          name: 'ClaudeAI',
          sourceKey: 'reddit',
          listings: ['top', 'hot'],
        },
      ],
      products: ['Claude Code', 'MCP'],
      keywords: ['agent reliability'],
      urls: ['https://example.com/feed.xml'],
    });
  });

  it('compiles builder output to canonical source-agnostic intent', () => {
    const intent = SocialResearchRequestBuilder.topic(
      '  OpenAI Codex launch  ',
    )
      .preset('trend_scan')
      .source('x-twitter')
      .source('bluesky')
      .handle(' openai ', {
        sourceKey: 'x-twitter',
        includePosts: true,
        includeMentions: true,
      })
      .product('Codex')
      .toIntent();

    expect(intent).toEqual({
      topic: 'OpenAI Codex launch',
      sources: ['x-twitter', 'bluesky'],
      window: '7d',
      depth: 'light',
      goal: 'trend',
      entities: {
        handles: [
          {
            handle: 'openai',
            sourceKey: 'x-twitter',
            includePosts: true,
            includeMentions: true,
          },
        ],
        products: ['Codex'],
      },
    });
  });

  it('clones request input when starting from an existing object', () => {
    const sources = ['reddit'];
    const builder = SocialResearchRequestBuilder.from({
      topic: 'AI agents',
      sources,
    });

    sources.push('x-twitter');

    expect(builder.build()).toEqual({
      topic: 'AI agents',
      sources: ['reddit'],
    });
  });
});
