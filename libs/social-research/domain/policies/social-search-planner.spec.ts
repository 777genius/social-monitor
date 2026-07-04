import {
  createAccountLaneStrategyFromRecipes,
  planSocialSearch,
  type SocialSourceCapabilityProfile,
  type SocialSourceLaneStrategy,
} from '@social-monitor/social-research';

describe('planSocialSearch', () => {
  it('builds X account, mention, product and fallback lanes from one intent', () => {
    const result = planSocialSearch({
      topic: 'AI coding agents MCP',
      sources: ['x-twitter'],
      depth: 'balanced',
      entities: {
        handles: ['openai'],
        products: ['Claude Code', 'OpenAI Codex'],
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.plan.lanes.map((lane) => lane.kind)).toEqual([
      'general',
      'account_posts',
      'product_or_group',
      'account_mentions',
      'fallback_short_query',
    ]);
    expect(result.plan.trace).toMatchObject({
      planner: {
        defaultSourcesUsed: false,
        queryStrategyRecipeId: 'default-social-query-strategy-v1',
      },
      sources: [
        expect.objectContaining({
          sourceKey: 'x-twitter',
          selection: 'explicit',
          strategyAvailable: true,
          capabilityProfileAvailable: true,
          plannedLaneCount: 5,
          emittedLaneCount: 5,
          warningCodes: ['source_runtime_not_ready'],
        }),
      ],
      lanes: {
        emitted: 5,
        cappedByGlobalLimit: false,
        byKind: expect.arrayContaining([
          { kind: 'account_mentions', count: 1 },
          { kind: 'account_posts', count: 1 },
        ]),
      },
    });
    expect(result.plan.lanes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceKey: 'x-twitter',
          kind: 'account_posts',
          query: 'from:openai',
        }),
        expect.objectContaining({
          sourceKey: 'x-twitter',
          kind: 'account_mentions',
          query: '@openai',
        }),
        expect.objectContaining({
          sourceKey: 'x-twitter',
          kind: 'product_or_group',
          query: '"Claude Code" OR "OpenAI Codex"',
        }),
      ]),
    );
  });

  it('uses a serializable query strategy recipe for common semantic lanes', () => {
    const result = planSocialSearch(
      {
        topic: 'AI coding agents MCP',
        sources: ['reddit'],
        entities: {
          products: ['Claude Code', 'OpenAI Codex'],
        },
      },
      {
        queryStrategyRecipe: {
          recipeKind: 'semantic_query_strategy_v1',
          recipeId: 'plain-two-token-fallback-v1',
          phraseMode: 'plain',
          fallback: {
            maxTokens: 2,
          },
        },
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.plan.lanes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'product_or_group',
          query: 'Claude Code OR OpenAI Codex',
        }),
        expect.objectContaining({
          kind: 'fallback_short_query',
          query: 'coding agents',
        }),
      ]),
    );
  });

  it('builds Reddit community listings and bounded comment enrichment', () => {
    const result = planSocialSearch({
      topic: 'AI developer tools',
      sources: ['reddit'],
      depth: 'balanced',
      entities: {
        communities: ['r/ClaudeAI'],
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.plan.lanes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'community_listing',
          operation: 'listing',
          query: 'claudeai:top',
          parameters: { topTime: 'week' },
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
          kind: 'search_variant',
          operation: 'search',
          parameters: { searchSort: 'top', searchTime: 'week' },
        }),
        expect.objectContaining({
          kind: 'thread_enrichment',
          operation: 'enrichment',
          maxItems: 10,
          parameters: { maxCommentsPerPost: 20, commentSort: 'top' },
        }),
      ]),
    );
  });

  it('uses light depth to skip enrichment lanes', () => {
    const result = planSocialSearch({
      topic: 'AI video tools',
      sources: ['youtube', 'reddit'],
      depth: 'light',
      entities: {
        communities: ['LocalLLaMA'],
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(
      result.plan.lanes.some((lane) => lane.operation === 'enrichment'),
    ).toBe(false);
    expect(result.plan.budgets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceKey: 'youtube',
          maxLanes: 3,
          includeEnrichment: false,
        }),
      ]),
    );
  });

  it('uses source capability profiles to plan explicit URL lanes for feed sources', () => {
    const result = planSocialSearch({
      topic: 'AI developer tools',
      sources: ['rss'],
      entities: {
        urls: ['https://example.com/feed.xml'],
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.plan.lanes).toEqual([
      expect.objectContaining({
        sourceKey: 'rss',
        kind: 'url_feed',
        operation: 'url',
        query: 'https://example.com/feed.xml',
      }),
    ]);
    expect(result.plan.warnings).toEqual([
      expect.objectContaining({
        code: 'unsupported_source_capability',
        sourceKey: 'rss',
      }),
    ]);
  });

  it('warns when planned source runtime readiness is not execution-ready by default', () => {
    const result = planSocialSearch({
      topic: 'OpenAI Codex launch',
      sources: ['x-twitter'],
      entities: {
        handles: ['openai'],
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.plan.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'source_runtime_not_ready',
          sourceKey: 'x-twitter',
        }),
      ]),
    );
  });

  it('does not warn when planner readiness matches the execution policy override', () => {
    const result = planSocialSearch(
      {
        topic: 'OpenAI Codex launch',
        sources: ['x-twitter'],
        entities: {
          handles: ['openai'],
        },
      },
      {
        executionAllowedRuntimeReadiness: ['deferred'],
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(
      result.plan.warnings.some(
        (warning) => warning.code === 'source_runtime_not_ready',
      ),
    ).toBe(false);
  });

  it('warns when runtime requires readiness but a custom capability omits it', () => {
    const sourceCapability: SocialSourceCapabilityProfile = {
      sourceKey: 'mastodon',
      version: 1,
      supportedOperations: ['search'],
      supportedLaneKinds: ['general', 'fallback_short_query'],
    };

    const result = planSocialSearch(
      {
        topic: 'AI agent launch',
        sources: ['mastodon'],
      },
      {
        sourceCapabilities: [sourceCapability],
        warnWhenSourceReadinessMissing: true,
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.plan.warnings).toEqual([
      expect.objectContaining({
        code: 'source_readiness_missing',
        sourceKey: 'mastodon',
      }),
    ]);
  });

  it('returns typed validation errors for an empty topic', () => {
    const result = planSocialSearch({
      topic: '   ',
      sources: ['reddit'],
    });

    expect(result).toEqual({
      ok: false,
      errors: [
        {
          code: 'topic_required',
          message: 'Social search topic must be non-empty.',
        },
      ],
    });
  });

  it('accepts a custom source lane strategy without changing the core planner', () => {
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

    const result = planSocialSearch(
      {
        topic: 'AI agent launch',
        sources: ['mastodon'],
        entities: {
          handles: [{ handle: 'openai', sourceKey: 'mastodon' }],
        },
      },
      { additionalSourceLaneStrategies: [mastodonStrategy] },
    );

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

  it('lets custom source capabilities allow extension lanes without changing the planner', () => {
    const mastodonProfile: SocialSourceCapabilityProfile = {
      sourceKey: 'mastodon',
      version: 1,
      supportedOperations: ['search', 'mention_search'],
      supportedLaneKinds: [
        'general',
        'account_mentions',
        'fallback_short_query',
      ],
    };
    const mastodonStrategy: SocialSourceLaneStrategy = {
      strategyId: 'mastodon-account-search',
      supports: (sourceKey) => sourceKey === 'mastodon',
      buildLanes: ({ sourceKey, handles, budget }) =>
        handles.map((handle) => ({
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

    const result = planSocialSearch(
      {
        topic: 'AI agent launch',
        sources: ['mastodon'],
        entities: {
          handles: [{ handle: 'openai', sourceKey: 'mastodon' }],
        },
      },
      {
        additionalSourceLaneStrategies: [mastodonStrategy],
        sourceCapabilities: [mastodonProfile],
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.plan.warnings).toEqual([]);
    expect(result.plan.lanes.map((lane) => lane.kind)).toEqual([
      'general',
      'account_mentions',
      'fallback_short_query',
    ]);
    expect(result.plan.trace?.sources).toEqual([
      expect.objectContaining({
        sourceKey: 'mastodon',
        selection: 'explicit',
        strategyAvailable: true,
        capabilityProfileAvailable: true,
        plannedLaneCount: 3,
        capabilityFilteredLaneCount: 3,
        emittedLaneCount: 3,
      }),
    ]);
  });

  it('builds custom source lanes from a declarative account recipe', () => {
    const mastodonProfile: SocialSourceCapabilityProfile = {
      sourceKey: 'mastodon',
      version: 1,
      supportedOperations: ['search', 'mention_search'],
      supportedLaneKinds: [
        'general',
        'account_mentions',
        'fallback_short_query',
      ],
    };
    const mastodonStrategy = createAccountLaneStrategyFromRecipes({
      strategyId: 'mastodon-account-mentions-v1',
      sourceKey: 'mastodon',
      recipes: [
        {
          recipeKind: 'account_lane_template',
          recipeId: 'mastodon-account-mention-template-v1',
          sourceKey: 'mastodon',
          accountSelector: 'same_source_include_mentions',
          laneKind: 'account_mentions',
          operation: 'mention_search',
          queryTemplate: '@{handle}',
          priority: 85,
          reason: 'custom Mastodon-compatible account mention lane',
          parameters: { topicForRanking: '{topic}' },
        },
      ],
    });

    const result = planSocialSearch(
      {
        topic: 'AI agent launch',
        sources: ['mastodon'],
        entities: {
          handles: [
            {
              handle: '@openai.social',
              sourceKey: 'mastodon',
              includePosts: false,
              includeMentions: true,
            },
          ],
        },
      },
      {
        additionalSourceLaneStrategies: [mastodonStrategy],
        sourceCapabilities: [mastodonProfile],
      },
    );

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
          operation: 'mention_search',
          query: '@openai.social',
          parameters: { topicForRanking: 'AI agent launch' },
        }),
      ]),
    );
  });

  it('warns when a custom source has source-specific entities but no strategy', () => {
    const result = planSocialSearch({
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

    expect(result.plan.warnings).toEqual([
      {
        code: 'unknown_source_strategy',
        sourceKey: 'mastodon',
        message: 'mastodon has source-specific entities but no lane strategy',
      },
    ]);
    expect(result.plan.trace?.sources).toEqual([
      expect.objectContaining({
        sourceKey: 'mastodon',
        strategyAvailable: false,
        capabilityProfileAvailable: false,
        warningCodes: ['unknown_source_strategy'],
      }),
    ]);
    expect(result.plan.trace?.warnings).toEqual({
      total: 1,
      byCode: [{ code: 'unknown_source_strategy', count: 1 }],
    });
    expect(result.plan.lanes.map((lane) => lane.kind)).toEqual([
      'general',
      'fallback_short_query',
    ]);
    expect(
      result.plan.lanes.some((lane) => lane.kind === 'account_mentions'),
    ).toBe(false);
  });
});
