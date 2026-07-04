import {
  SocialResearchSdk,
  SocialResearchSdkError,
  toSocialResearchFailure,
  type SocialResearchFailure,
} from '../../application/social-research-sdk';
import {
  createSocialSearchIntent,
  type SocialResearchRequestInput,
} from '../../application/social-research-request';
import {
  explainSocialSearchPlan,
  planSocialSearch,
  type SocialSearchPlannerOptions,
} from '../../domain/policies/social-search-planner';
import {
  createAccountLaneStrategyFromRecipes,
  type SocialAccountLaneStrategyRecipe,
} from '../../domain/policies/social-source-lane-recipes';
import type { SocialSearchIntent } from '../../domain/value-objects/social-search-intent';
import type {
  SocialSearchPlan,
  SocialSearchPlanResult,
} from '../../domain/value-objects/social-search-plan';
import type { SocialSourceCapabilityProfile } from '../../domain/value-objects/social-source-capability-profile';
import type { RankedSocialSearchItem } from '../../domain/entities/social-search-item';
import type { RankSocialItemsInput } from '../../domain/policies/social-item-ranker';

export type SocialResearchSdkCaseSet = {
  readonly schemaVersion: 1;
  readonly artifactId: 'social-research.sdk-cases.v1';
  readonly generatedFrom: readonly string[];
  readonly sdkOperationsCovered: readonly string[];
  readonly sourceExtensionContracts: readonly SocialResearchSourceExtensionContract[];
  readonly cases: readonly SocialResearchSdkCase[];
};

export type SocialResearchSdkCase =
  | SocialResearchRequestToPlanCase
  | SocialResearchSourceExtensionPlanCase
  | SocialResearchRankResultsCase
  | SocialResearchSafeFailureCase;

export type SocialResearchSourceExtensionContract = {
  readonly sourceKey: string;
  readonly capabilityProfile: SocialSourceCapabilityProfile;
  readonly laneStrategy: {
    readonly contract: 'SocialSourceLaneStrategy';
    readonly strategyId: string;
    readonly supportsSourceKey: string;
    readonly emittedLaneKinds: readonly string[];
    readonly emittedOperations: readonly string[];
    readonly recipes: readonly SocialAccountLaneStrategyRecipe[];
  };
  readonly transportPolicy: 'strategy_code_is_sdk_runtime_extension_not_transport_json';
  readonly goldenCaseId: string;
};

export type SocialResearchRequestToPlanCase = {
  readonly caseId: string;
  readonly kind: 'request_to_plan';
  readonly description: string;
  readonly requestInput: SocialResearchRequestInput;
  readonly expectedIntent: SocialSearchIntent;
  readonly expectedPlan: SocialSearchPlan;
  readonly expectedExplanation: string;
};

export type SocialResearchSourceExtensionPlanCase = {
  readonly caseId: string;
  readonly kind: 'source_extension_request_to_plan';
  readonly description: string;
  readonly sourceExtensionContract: SocialResearchSourceExtensionContract;
  readonly requestInput: SocialResearchRequestInput;
  readonly expectedIntent: SocialSearchIntent;
  readonly expectedPlan: SocialSearchPlan;
  readonly expectedExplanation: string;
};

export type SocialResearchRankResultsCase = {
  readonly caseId: string;
  readonly kind: 'rank_results';
  readonly description: string;
  readonly rankInput: RankSocialItemsInput;
  readonly expectedRankedItems: readonly RankedSocialSearchItem[];
};

export type SocialResearchSafeFailureCase = {
  readonly caseId: string;
  readonly kind: 'safe_failure';
  readonly description: string;
  readonly requestInput: SocialResearchRequestInput;
  readonly expectedIntent: SocialSearchIntent;
  readonly expectedPlanResult: SocialSearchPlanResult;
  readonly expectedFailure: SocialResearchFailure;
};

export const buildSocialResearchSdkCases = (): SocialResearchSdkCaseSet => ({
  schemaVersion: 1,
  artifactId: 'social-research.sdk-cases.v1',
  generatedFrom: [
    'libs/social-research/application/social-research-request.ts',
    'libs/social-research/application/social-research-sdk.ts',
    'libs/social-research/domain/policies/social-search-planner.ts',
    'libs/social-research/domain/policies/social-item-ranker.ts',
    'libs/social-research/domain/policies/social-item-quality-policy.ts',
  ],
  sdkOperationsCovered: [
    'createSearchPlanFromRequest',
    'explainSearchRequest',
    'searchRequest',
    'trySearchRequest',
    'rankResults',
    'tryRankResults',
  ],
  sourceExtensionContracts: [mastodonExtensionContract],
  cases: [
    requestToPlanCase({
      caseId: 'reddit_research_request_v1',
      description:
        'Ergonomic Reddit research request compiles to canonical intent, lanes and explanation.',
      requestInput: {
        topic: 'AI agents MCP Claude Code reliability',
        preset: 'broad_research',
        sources: 'reddit',
        products: ['Claude Code', 'MCP'],
        keywords: ['agent reliability'],
        communities: {
          name: 'ClaudeAI',
          sourceKey: 'reddit',
          listings: ['top', 'hot'],
        },
      },
    }),
    requestToPlanCase({
      caseId: 'x_account_recall_request_v1',
      description:
        'Account-centered X request keeps from: and mention lanes source-neutral at SDK level.',
      requestInput: {
        topic: 'OpenAI Codex launch',
        preset: 'trend_scan',
        sources: 'x-twitter',
        accounts: {
          handle: '@OpenAI',
          sourceKey: 'x-twitter',
          includePosts: true,
          includeMentions: true,
        },
        products: ['Codex'],
      },
    }),
    sourceExtensionRequestToPlanCase({
      caseId: mastodonExtensionContract.goldenCaseId,
      description:
        'Unknown Mastodon-compatible source compiles through capability profile and lane strategy extension points.',
      sourceExtensionContract: mastodonExtensionContract,
      requestInput: {
        topic: 'AI agent launch on Mastodon',
        preset: 'trend_scan',
        sources: mastodonExtensionContract.sourceKey,
        accounts: {
          handle: '@openai.social',
          sourceKey: mastodonExtensionContract.sourceKey,
          includePosts: false,
          includeMentions: true,
        },
      },
      plannerOptions: mastodonExtensionPlannerOptions,
    }),
    rankResultsCase({
      caseId: 'ranking_quality_recipe_request_v1',
      description:
        'Rank-only SDK workflow applies serializable ranking and quality recipes without provider calls.',
      rankInput: {
        intent: {
          topic: 'Claude Code MCP server',
          goal: 'trend',
        },
        rankingRecipe: {
          recipeKind: 'social_ranking_recipe_v1',
          recipeId: 'sdk-golden-quality-ranking-v1',
          weightsByGoal: {
            trend: {
              relevance: 0.9,
              engagement: 0.1,
            },
          },
          engagement: {
            maxScore: 15,
          },
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
      },
    }),
    safeFailureCase({
      caseId: 'invalid_empty_topic_failure_v1',
      description:
        'Invalid request input maps to stable non-throwing SDK failure envelope.',
      requestInput: {
        topic: '   ',
        sources: 'reddit',
      },
    }),
  ],
});

const rankResultsCase = (params: {
  readonly caseId: string;
  readonly description: string;
  readonly rankInput: RankSocialItemsInput;
}): SocialResearchRankResultsCase => ({
  caseId: params.caseId,
  kind: 'rank_results',
  description: params.description,
  rankInput: params.rankInput,
  expectedRankedItems: new SocialResearchSdk().rankResults(params.rankInput),
});

const requestToPlanCase = (params: {
  readonly caseId: string;
  readonly description: string;
  readonly requestInput: SocialResearchRequestInput;
  readonly plannerOptions?: SocialSearchPlannerOptions;
}): SocialResearchRequestToPlanCase => {
  const expectedIntent = createSocialSearchIntent(params.requestInput);
  const planResult = planSocialSearch(expectedIntent, params.plannerOptions);

  if (!planResult.ok) {
    throw new Error(`Expected valid SDK case plan: ${params.caseId}`);
  }

  return {
    caseId: params.caseId,
    kind: 'request_to_plan',
    description: params.description,
    requestInput: params.requestInput,
    expectedIntent,
    expectedPlan: planResult.plan,
    expectedExplanation: explainSocialSearchPlan(planResult.plan),
  };
};

const sourceExtensionRequestToPlanCase = (params: {
  readonly caseId: string;
  readonly description: string;
  readonly sourceExtensionContract: SocialResearchSourceExtensionContract;
  readonly requestInput: SocialResearchRequestInput;
  readonly plannerOptions: SocialSearchPlannerOptions;
}): SocialResearchSourceExtensionPlanCase => {
  const expected = requestToPlanCase(params);

  return {
    ...expected,
    kind: 'source_extension_request_to_plan',
    sourceExtensionContract: params.sourceExtensionContract,
  };
};

const safeFailureCase = (params: {
  readonly caseId: string;
  readonly description: string;
  readonly requestInput: SocialResearchRequestInput;
}): SocialResearchSafeFailureCase => {
  const expectedIntent = createSocialSearchIntent(params.requestInput);
  const expectedPlanResult = planSocialSearch(expectedIntent);

  if (expectedPlanResult.ok) {
    throw new Error(`Expected invalid SDK case plan: ${params.caseId}`);
  }

  return {
    caseId: params.caseId,
    kind: 'safe_failure',
    description: params.description,
    requestInput: params.requestInput,
    expectedIntent,
    expectedPlanResult,
    expectedFailure: toSocialResearchFailure(
      new SocialResearchSdkError(
        'invalid_search_intent',
        'Cannot execute an invalid social search intent.',
        expectedPlanResult.errors,
      ),
    ),
  };
};

const mastodonExtensionSourceKey = 'mastodon';

const mastodonCapabilityProfile: SocialSourceCapabilityProfile = {
  sourceKey: mastodonExtensionSourceKey,
  displayName: 'Mastodon-compatible network',
  version: 1,
  productionSafe: false,
  supportedOperations: ['search', 'mention_search'],
  supportedLaneKinds: ['general', 'account_mentions', 'fallback_short_query'],
  supportedContentUnits: ['post', 'profile', 'link'],
  cursorModel: 'opaque',
  quotaModel: 'per_credential',
  readiness: {
    state: 'research_only',
    runtimeReadiness: 'deferred',
  },
  limitations: [
    'Golden case proves SDK extension shape only; runtime provider readiness is source-specific.',
  ],
};

const mastodonAccountMentionRecipe: SocialAccountLaneStrategyRecipe = {
  recipeKind: 'account_lane_template',
  recipeId: 'mastodon-account-mention-template-v1',
  sourceKey: mastodonExtensionSourceKey,
  accountSelector: 'same_source_include_mentions',
  laneKind: 'account_mentions',
  operation: 'mention_search',
  queryTemplate: '@{handle}',
  priority: 85,
  reason: 'custom Mastodon-compatible account mention lane',
  parameters: { topicForRanking: '{topic}' },
};

const mastodonLaneStrategy = createAccountLaneStrategyFromRecipes({
  strategyId: 'mastodon-account-mentions-v1',
  sourceKey: mastodonExtensionSourceKey,
  recipes: [mastodonAccountMentionRecipe],
});

const mastodonExtensionContract: SocialResearchSourceExtensionContract = {
  sourceKey: mastodonExtensionSourceKey,
  capabilityProfile: mastodonCapabilityProfile,
  laneStrategy: {
    contract: 'SocialSourceLaneStrategy',
    strategyId: mastodonLaneStrategy.strategyId,
    supportsSourceKey: mastodonExtensionSourceKey,
    emittedLaneKinds: ['account_mentions'],
    emittedOperations: ['mention_search'],
    recipes: [mastodonAccountMentionRecipe],
  },
  transportPolicy: 'strategy_code_is_sdk_runtime_extension_not_transport_json',
  goldenCaseId: 'mastodon_extension_request_v1',
};

const mastodonExtensionPlannerOptions: SocialSearchPlannerOptions = {
  sourceCapabilities: [mastodonCapabilityProfile],
  additionalSourceLaneStrategies: [mastodonLaneStrategy],
};
