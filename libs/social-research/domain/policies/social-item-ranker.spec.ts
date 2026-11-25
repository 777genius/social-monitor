import {
  defaultSocialRankingRecipe,
  rankSocialItems,
} from '@social-monitor/social-research';

describe('rankSocialItems', () => {
  it('keeps relevance above raw engagement for research goals', () => {
    const ranked = rankSocialItems({
      intent: {
        topic: 'Claude Code MCP server',
        goal: 'research',
      },
      items: [
        {
          itemId: 'viral',
          sourceKey: 'reddit',
          canonicalUrl: 'https://example.test/viral',
          title: 'Funny AI meme',
          body: 'general developer humor',
          metrics: { likes: 20_000, comments: 800 },
        },
        {
          itemId: 'relevant',
          sourceKey: 'reddit',
          canonicalUrl: 'https://example.test/relevant',
          title: 'Claude Code MCP server regression',
          body: 'Detailed reproduction for MCP tool calls in Claude Code.',
          metrics: { likes: 30, comments: 5 },
        },
      ],
    });

    expect(ranked[0]?.item.itemId).toBe('relevant');
    expect(ranked[0]?.ranking.recipeId).toBe(
      defaultSocialRankingRecipe.recipeId,
    );
    expect(ranked[0]?.ranking.qualityScore).toBeGreaterThan(0);
    expect(ranked[0]?.ranking.reasons).toContain('strong_topic_match');
  });

  it('uses engagement more strongly for trend goals', () => {
    const ranked = rankSocialItems({
      intent: {
        topic: 'AI agents',
        goal: 'trend',
      },
      items: [
        {
          itemId: 'small',
          sourceKey: 'x-twitter',
          canonicalUrl: 'https://example.test/small',
          title: 'AI agents release notes',
          body: 'AI agents AI agents AI agents',
          metrics: { likes: 3 },
        },
        {
          itemId: 'large',
          sourceKey: 'x-twitter',
          canonicalUrl: 'https://example.test/large',
          title: 'AI agents launch',
          body: 'AI agents launch discussion',
          metrics: { likes: 5_000, reposts: 400, replies: 120 },
        },
      ],
    });

    expect(ranked[0]?.item.itemId).toBe('large');
    expect(ranked[0]?.ranking.reasons).toContain('engagement_signal');
  });

  it('accepts a serializable ranking recipe for generated SDK behavior', () => {
    const ranked = rankSocialItems({
      intent: {
        topic: 'Claude Code MCP server',
        goal: 'trend',
      },
      rankingRecipe: {
        recipeKind: 'social_ranking_recipe_v1',
        recipeId: 'relevance-heavy-trend-v1',
        weightsByGoal: {
          trend: {
            relevance: 0.85,
            engagement: 0.1,
            recency: 0.05,
          },
        },
        engagement: {
          maxScore: 20,
        },
      },
      items: [
        {
          itemId: 'viral',
          sourceKey: 'x-twitter',
          canonicalUrl: 'https://example.test/viral',
          title: 'Generic AI agents thread',
          body: 'high traffic but not about the MCP server',
          metrics: { likes: 90_000, reposts: 10_000 },
        },
        {
          itemId: 'specific',
          sourceKey: 'x-twitter',
          canonicalUrl: 'https://example.test/specific',
          title: 'Claude Code MCP server rollout',
          body: 'Claude Code MCP server changes for agent workflows.',
          metrics: { likes: 15 },
        },
      ],
    });

    expect(ranked[0]?.item.itemId).toBe('specific');
    expect(ranked[0]?.ranking.recipeId).toBe('relevance-heavy-trend-v1');
    expect(ranked[1]?.ranking.engagementScore).toBeLessThanOrEqual(20);
  });

  it('downranks source-neutral engagement bait and promo content', () => {
    const ranked = rankSocialItems({
      intent: {
        topic: 'Claude Code MCP server',
        goal: 'trend',
      },
      items: [
        {
          itemId: 'promo',
          sourceKey: 'x-twitter',
          canonicalUrl: 'https://example.test/promo',
          title: 'Claude Code MCP server giveaway',
          body: 'Claude Code MCP server giveaway, like and retweet, limited time discount for a sponsored webinar.',
          metrics: { likes: 80_000, reposts: 10_000 },
        },
        {
          itemId: 'useful',
          sourceKey: 'x-twitter',
          canonicalUrl: 'https://example.test/useful',
          title: 'Claude Code MCP server incident notes',
          body: 'Claude Code MCP server regression notes with reproduction steps, affected tool calls, and mitigation details.',
          metrics: { likes: 20 },
        },
      ],
    });

    expect(ranked[0]?.item.itemId).toBe('useful');
    expect(ranked[1]?.ranking.qualitySignals).toEqual(
      expect.arrayContaining(['engagement_bait', 'promo_offer']),
    );
    expect(ranked[1]?.ranking.reasons).toEqual(
      expect.arrayContaining(['quality_engagement_bait', 'quality_promo_offer']),
    );
  });

  it('lets ranking recipes tune quality penalties for specialized SDK clients', () => {
    const ranked = rankSocialItems({
      intent: {
        topic: 'Claude Code MCP server webinar',
        goal: 'trend',
      },
      rankingRecipe: {
        recipeKind: 'social_ranking_recipe_v1',
        recipeId: 'webinar-monitor-v1',
        quality: {
          penalties: {
            promo_offer: 0,
            engagement_bait: 0,
          },
        },
      },
      items: [
        {
          itemId: 'promo',
          sourceKey: 'x-twitter',
          canonicalUrl: 'https://example.test/promo',
          title: 'Claude Code MCP server webinar',
          body: 'Claude Code MCP server webinar, like and retweet, limited time discount for registered teams.',
          metrics: { likes: 80_000, reposts: 10_000 },
        },
        {
          itemId: 'quiet',
          sourceKey: 'x-twitter',
          canonicalUrl: 'https://example.test/quiet',
          title: 'Claude Code MCP server notes',
          body: 'Claude Code MCP server short implementation note.',
          metrics: { likes: 10 },
        },
      ],
    });

    expect(ranked[0]?.item.itemId).toBe('promo');
    expect(ranked[0]?.ranking.recipeId).toBe('webinar-monitor-v1');
    expect(ranked[0]?.ranking.qualitySignals).toEqual(
      expect.arrayContaining(['engagement_bait', 'promo_offer']),
    );
  });
});
