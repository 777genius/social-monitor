import { buildSocialResearchSdkCases } from './social-research-sdk-cases';

describe('buildSocialResearchSdkCases', () => {
  it('exports polyglot SDK golden cases from the real SDK planner path', () => {
    const artifact = buildSocialResearchSdkCases();

    expect(artifact).toMatchObject({
      schemaVersion: 1,
      artifactId: 'social-research.sdk-cases.v1',
      sdkOperationsCovered: expect.arrayContaining([
        'createSearchPlanFromRequest',
        'searchRequest',
        'trySearchRequest',
        'rankResults',
        'tryRankResults',
      ]),
    });
    expect(artifact.cases.map((item) => item.caseId)).toEqual([
      'reddit_research_request_v1',
      'x_account_recall_request_v1',
      'mastodon_extension_request_v1',
      'ranking_quality_recipe_request_v1',
      'invalid_empty_topic_failure_v1',
    ]);
    expect(artifact.sourceExtensionContracts).toEqual([
      expect.objectContaining({
        sourceKey: 'mastodon',
        laneStrategy: expect.objectContaining({
          contract: 'SocialSourceLaneStrategy',
          emittedLaneKinds: ['account_mentions'],
          emittedOperations: ['mention_search'],
          recipes: [
            expect.objectContaining({
              recipeKind: 'account_lane_template',
              queryTemplate: '@{handle}',
              parameters: { topicForRanking: '{topic}' },
            }),
          ],
        }),
        transportPolicy:
          'strategy_code_is_sdk_runtime_extension_not_transport_json',
        goldenCaseId: 'mastodon_extension_request_v1',
      }),
    ]);

    const redditCase = artifact.cases.find(
      (item) => item.caseId === 'reddit_research_request_v1',
    );
    expect(redditCase).toMatchObject({
      kind: 'request_to_plan',
      expectedIntent: {
        topic: 'AI agents MCP Claude Code reliability',
        sources: ['reddit'],
      },
    });
    if (redditCase?.kind !== 'request_to_plan') {
      throw new Error('expected request_to_plan case');
    }
    expect(redditCase.expectedPlan.lanes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceKey: 'reddit',
          kind: 'community_listing',
          query: 'claudeai:top',
        }),
      ]),
    );
    expect(redditCase.expectedExplanation).toContain('reddit/general');

    const mastodonCase = artifact.cases.find(
      (item) => item.caseId === 'mastodon_extension_request_v1',
    );
    expect(mastodonCase).toMatchObject({
      kind: 'source_extension_request_to_plan',
      expectedIntent: {
        sources: ['mastodon'],
      },
      sourceExtensionContract: {
        sourceKey: 'mastodon',
      },
    });
    if (mastodonCase?.kind !== 'source_extension_request_to_plan') {
      throw new Error('expected source_extension_request_to_plan case');
    }
    expect(mastodonCase.expectedPlan.warnings).toEqual([
      expect.objectContaining({
        code: 'source_runtime_not_ready',
        sourceKey: 'mastodon',
      }),
    ]);
    expect(mastodonCase.expectedPlan.lanes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceKey: 'mastodon',
          kind: 'account_mentions',
          operation: 'mention_search',
          query: '@openai.social',
        }),
      ]),
    );

    const rankingCase = artifact.cases.find(
      (item) => item.caseId === 'ranking_quality_recipe_request_v1',
    );
    expect(rankingCase).toMatchObject({
      kind: 'rank_results',
      rankInput: {
        rankingRecipe: {
          recipeId: 'sdk-golden-quality-ranking-v1',
        },
      },
    });
    if (rankingCase?.kind !== 'rank_results') {
      throw new Error('expected rank_results case');
    }
    expect(rankingCase.expectedRankedItems[0]).toMatchObject({
      item: {
        itemId: 'useful',
      },
      ranking: {
        recipeId: 'sdk-golden-quality-ranking-v1',
        qualityScore: 100,
        qualitySignals: [],
      },
    });
    expect(rankingCase.expectedRankedItems[1]?.ranking).toMatchObject({
      qualitySignals: expect.arrayContaining([
        'engagement_bait',
        'promo_offer',
      ]),
    });

    const failureCase = artifact.cases.find(
      (item) => item.caseId === 'invalid_empty_topic_failure_v1',
    );
    expect(failureCase).toMatchObject({
      kind: 'safe_failure',
      expectedFailure: {
        code: 'invalid_search_intent',
        details: [
          {
            code: 'topic_required',
          },
        ],
      },
    });
  });
});
