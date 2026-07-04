import { z } from 'zod';

import {
  socialCommunityListings,
  socialSearchDepths,
  socialSearchGoals,
  socialSearchWindowPresets,
} from '../../domain/value-objects/social-search-intent';
import { socialResearchRequestPresetIds } from '../../application/social-research-request';
import {
  socialSourceContentUnits,
  socialSourceCursorModels,
  socialSourceQuotaModels,
  socialSourceReadinessStates,
  socialSourceRuntimeReadinessStates,
} from '../../domain/value-objects/social-source-capability-profile';
import {
  socialSearchLaneKinds,
  socialSearchLaneOperations,
} from '../../domain/value-objects/social-search-plan';
import {
  semanticQueryLaneKinds,
  socialQueryPhraseModes,
  socialQueryStrategyRecipeKinds,
} from '../../domain/policies/social-query-strategy';
import { socialRankingRecipeKinds } from '../../domain/policies/social-item-ranker';
import { socialItemQualitySignals } from '../../domain/policies/social-item-quality-policy';

export const sourceKeySchema = z.string().trim().min(1);

const scalarOrArraySchema = <TSchema extends z.ZodType>(schema: TSchema) =>
  z.union([schema, z.array(schema)]);

const socialSearchWindowSchema = z.union([
  z.enum(socialSearchWindowPresets),
  z.object({
    since: z.string().trim().min(1).optional(),
    until: z.string().trim().min(1).optional(),
    hours: z.number().int().positive().optional(),
    days: z.number().int().positive().optional(),
  }),
]);

export const socialAccountRefSchema = z.union([
  z.string().trim().min(1),
  z.object({
    handle: z.string().trim().min(1),
    sourceKey: sourceKeySchema.optional(),
    includePosts: z.boolean().optional(),
    includeMentions: z.boolean().optional(),
  }),
]);

export const socialCommunityRefSchema = z.union([
  z.string().trim().min(1),
  z.object({
    name: z.string().trim().min(1),
    sourceKey: sourceKeySchema.optional(),
    listings: z.array(z.enum(socialCommunityListings)).optional(),
  }),
]);

export const socialSearchEntitiesSchema = z.object({
  handles: z.array(socialAccountRefSchema).optional(),
  products: z.array(z.string().trim().min(1)).optional(),
  keywords: z.array(z.string().trim().min(1)).optional(),
  communities: z.array(socialCommunityRefSchema).optional(),
  urls: z.array(z.url()).optional(),
});

export const socialSearchIntentInputSchema = z.object({
  topic: z.string().trim().min(1),
  sources: z.array(sourceKeySchema).optional(),
  window: socialSearchWindowSchema.optional(),
  depth: z.enum(socialSearchDepths).optional(),
  goal: z.enum(socialSearchGoals).optional(),
  entities: socialSearchEntitiesSchema.optional(),
});

export const socialResearchRequestInputSchema = z.object({
  topic: z.string().trim().min(1),
  preset: z.enum(socialResearchRequestPresetIds).optional(),
  sources: scalarOrArraySchema(sourceKeySchema).optional(),
  window: socialSearchWindowSchema.optional(),
  depth: z.enum(socialSearchDepths).optional(),
  goal: z.enum(socialSearchGoals).optional(),
  accounts: scalarOrArraySchema(socialAccountRefSchema).optional(),
  handles: scalarOrArraySchema(socialAccountRefSchema).optional(),
  products: scalarOrArraySchema(z.string().trim().min(1)).optional(),
  keywords: scalarOrArraySchema(z.string().trim().min(1)).optional(),
  communities: scalarOrArraySchema(socialCommunityRefSchema).optional(),
  urls: scalarOrArraySchema(z.url()).optional(),
});

export const socialResearchToolRequestInputSchema =
  socialResearchRequestInputSchema.extend({
    entities: socialSearchEntitiesSchema.optional(),
  });

export const socialResearchExecutionInputSchema = z.object({
  tenantId: z.string().trim().min(1),
  workspaceId: z.string().trim().min(1),
  scanJobId: z.string().trim().min(1),
  correlationId: z.string().trim().min(1).optional(),
  sourceBindingIdBySource: z.record(
    z.string().trim().min(1),
    z.string().trim().min(1),
  ),
  cursorByLaneId: z
    .record(z.string().trim().min(1), z.string().trim().min(1))
    .optional(),
});

export const sourceLimitInputSchema = z.object({
  sourceKey: sourceKeySchema,
  maxLanes: z.number().int().positive().optional(),
  maxItemsPerLane: z.number().int().positive().optional(),
  includeEnrichment: z.boolean().optional(),
});

export const socialSourceCapabilityProfileInputSchema = z.object({
  sourceKey: sourceKeySchema,
  displayName: z.string().trim().min(1).optional(),
  version: z.number().int().positive(),
  productionSafe: z.boolean().optional(),
  supportedOperations: z.array(z.enum(socialSearchLaneOperations)).min(1),
  supportedLaneKinds: z.array(z.enum(socialSearchLaneKinds)).optional(),
  supportedContentUnits: z.array(z.enum(socialSourceContentUnits)).optional(),
  cursorModel: z.enum(socialSourceCursorModels).optional(),
  quotaModel: z.enum(socialSourceQuotaModels).optional(),
  readiness: z
    .object({
      state: z.enum(socialSourceReadinessStates),
      runtimeReadiness: z.enum(socialSourceRuntimeReadinessStates),
      liveBetaBlockers: z.array(z.string()).optional(),
    })
    .optional(),
  limitations: z.array(z.string()).optional(),
});

export const socialQueryStrategyRecipeInputSchema = z.object({
  recipeKind: z.enum(socialQueryStrategyRecipeKinds),
  recipeId: z.string().trim().min(1),
  phraseMode: z.enum(socialQueryPhraseModes).optional(),
  disjunctionOperator: z.string().trim().min(1).optional(),
  fallback: z
    .object({
      enabled: z.boolean().optional(),
      maxTokens: z.number().int().positive().optional(),
      minTokenLength: z.number().int().positive().optional(),
      excludedTokens: z.array(z.string().trim().min(1)).optional(),
    })
    .optional(),
  lanePriorities: z
    .partialRecord(z.enum(semanticQueryLaneKinds), z.number())
    .optional(),
});

const socialRankingScoreWeightsInputSchema = z.object({
  relevance: z.number().nonnegative().optional(),
  engagement: z.number().nonnegative().optional(),
  recency: z.number().nonnegative().optional(),
});

export const socialItemQualityRecipeInputSchema = z.object({
  enabled: z.boolean().optional(),
  minTextCharacters: z.number().int().nonnegative().optional(),
  weakMatchRelevanceThreshold: z.number().min(0).max(100).optional(),
  penalties: z
    .partialRecord(z.enum(socialItemQualitySignals), z.number().min(0).max(100))
    .optional(),
});

export const socialRankingRecipeInputSchema = z.object({
  recipeKind: z.enum(socialRankingRecipeKinds),
  recipeId: z.string().trim().min(1),
  weightsByGoal: z
    .partialRecord(z.enum(socialSearchGoals), socialRankingScoreWeightsInputSchema)
    .optional(),
  engagement: z
    .object({
      maxScore: z.number().min(0).max(100).optional(),
      logMultiplier: z.number().positive().max(100).optional(),
    })
    .optional(),
  relevance: z
    .object({
      matchedTermWeight: z.number().min(0).max(100).optional(),
      titleMatchBonus: z.number().min(0).max(100).optional(),
      maxScore: z.number().min(0).max(100).optional(),
    })
    .optional(),
  quality: socialItemQualityRecipeInputSchema.optional(),
});

export const plannerOptionsInputSchema = z.object({
  defaultSources: z.array(sourceKeySchema).optional(),
  maxLanes: z.number().int().positive().optional(),
  sourceLimits: z.array(sourceLimitInputSchema).optional(),
  sourceCapabilities: z
    .array(socialSourceCapabilityProfileInputSchema)
    .optional(),
  disableBuiltInSourceCapabilities: z.boolean().optional(),
  queryStrategyRecipe: socialQueryStrategyRecipeInputSchema.optional(),
  executionAllowedRuntimeReadiness: z
    .array(z.enum(socialSourceRuntimeReadinessStates))
    .optional(),
  warnWhenSourceReadinessMissing: z.boolean().optional(),
});

export const searchSocialToolInputSchema = socialResearchToolRequestInputSchema
  .merge(plannerOptionsInputSchema)
  .extend({
    execution: socialResearchExecutionInputSchema.optional(),
  });

export const explainSearchPlanToolInputSchema =
  socialResearchToolRequestInputSchema.merge(plannerOptionsInputSchema);

const socialMetricsInputSchema = z.object({
  likes: z.number().nonnegative().optional(),
  reposts: z.number().nonnegative().optional(),
  replies: z.number().nonnegative().optional(),
  comments: z.number().nonnegative().optional(),
  quotes: z.number().nonnegative().optional(),
  views: z.number().nonnegative().optional(),
  score: z.number().nonnegative().optional(),
  stars: z.number().nonnegative().optional(),
  forks: z.number().nonnegative().optional(),
});

const dateTimeStringSchema = z
  .string()
  .refine(
    (value) => !Number.isNaN(new Date(value).getTime()),
    'Expected a valid date-time string.',
  );

export const socialSearchItemInputSchema = z.object({
  itemId: z.string().trim().min(1),
  sourceKey: sourceKeySchema,
  canonicalUrl: z.url(),
  title: z.string(),
  body: z.string(),
  authorHandle: z.string().trim().min(1).optional(),
  publishedAt: dateTimeStringSchema.optional(),
  metrics: socialMetricsInputSchema.optional(),
  evidence: z.array(z.string()).optional(),
});

export const rankResultsToolInputSchema = z.object({
  topic: z.string().trim().min(1),
  goal: z.enum(socialSearchGoals).optional(),
  entities: socialSearchEntitiesSchema.optional(),
  rankingRecipe: socialRankingRecipeInputSchema.optional(),
  items: z.array(socialSearchItemInputSchema).min(1),
  limit: z.number().int().positive().optional(),
  now: dateTimeStringSchema.optional(),
});

export const fetchThreadToolInputSchema = z
  .object({
    canonicalUrl: z.url().optional(),
    sourceKey: sourceKeySchema.optional(),
    externalId: z.string().trim().min(1).optional(),
    maxDepth: z.number().int().nonnegative().optional(),
    execution: socialResearchExecutionInputSchema.optional(),
  })
  .refine(
    (value) =>
      value.canonicalUrl !== undefined || value.externalId !== undefined,
    'Either canonicalUrl or externalId is required.',
  );

export const listSocialSourcesToolInputSchema = z.object({
  sourceKeys: z.array(sourceKeySchema).optional(),
  includeProfileOnly: z.boolean().optional(),
  includeProviderRuntimeGated: z.boolean().optional(),
  includeRejected: z.boolean().optional(),
});

export const explainSourceReadinessToolInputSchema = z.object({
  sourceKey: sourceKeySchema,
});

export type SocialResearchToolHandlerMethod =
  | 'searchSocial'
  | 'explainSearchPlan'
  | 'fetchThread'
  | 'rankResults'
  | 'listSocialSources'
  | 'explainSourceReadiness';

export type SocialResearchToolDefinition = {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: z.ZodType;
  readonly handlerMethod: SocialResearchToolHandlerMethod;
  readonly sdkOperationId: string;
  readonly requiresExecutionScope: boolean;
  readonly sideEffects: 'none' | 'provider_read';
};

export const socialResearchToolSchemas = {
  search_social: searchSocialToolInputSchema,
  explain_search_plan: explainSearchPlanToolInputSchema,
  fetch_thread: fetchThreadToolInputSchema,
  rank_results: rankResultsToolInputSchema,
  list_social_sources: listSocialSourcesToolInputSchema,
  explain_source_readiness: explainSourceReadinessToolInputSchema,
} as const;

export const socialResearchToolDefinitions = [
  {
    name: 'search_social',
    description:
      'Execute a source-agnostic social research search through the Social Monitor SDK.',
    inputSchema: searchSocialToolInputSchema,
    handlerMethod: 'searchSocial',
    sdkOperationId: 'searchRequest',
    requiresExecutionScope: true,
    sideEffects: 'provider_read',
  },
  {
    name: 'explain_search_plan',
    description:
      'Return the planned social search lanes without executing provider calls.',
    inputSchema: explainSearchPlanToolInputSchema,
    handlerMethod: 'explainSearchPlan',
    sdkOperationId: 'explainSearchRequest',
    requiresExecutionScope: false,
    sideEffects: 'none',
  },
  {
    name: 'fetch_thread',
    description:
      'Fetch a conversation thread by URL or provider id through the Social Monitor SDK.',
    inputSchema: fetchThreadToolInputSchema,
    handlerMethod: 'fetchThread',
    sdkOperationId: 'fetchThread',
    requiresExecutionScope: true,
    sideEffects: 'provider_read',
  },
  {
    name: 'rank_results',
    description: 'Rank normalized social items for a research goal.',
    inputSchema: rankResultsToolInputSchema,
    handlerMethod: 'rankResults',
    sdkOperationId: 'rankResults',
    requiresExecutionScope: false,
    sideEffects: 'none',
  },
  {
    name: 'list_social_sources',
    description:
      'List source capability and certification profiles exposed by the Social Monitor SDK.',
    inputSchema: listSocialSourcesToolInputSchema,
    handlerMethod: 'listSocialSources',
    sdkOperationId: 'listSources',
    requiresExecutionScope: false,
    sideEffects: 'none',
  },
  {
    name: 'explain_source_readiness',
    description:
      'Explain whether a social source can plan and execute with the default SDK readiness policy.',
    inputSchema: explainSourceReadinessToolInputSchema,
    handlerMethod: 'explainSourceReadiness',
    sdkOperationId: 'explainSourceReadiness',
    requiresExecutionScope: false,
    sideEffects: 'none',
  },
] as const satisfies readonly SocialResearchToolDefinition[];

export type SearchSocialToolInput = z.infer<typeof searchSocialToolInputSchema>;
export type ExplainSearchPlanToolInput = z.infer<
  typeof explainSearchPlanToolInputSchema
>;
export type FetchThreadToolInput = z.infer<typeof fetchThreadToolInputSchema>;
export type RankResultsToolInput = z.infer<typeof rankResultsToolInputSchema>;
export type ListSocialSourcesToolInput = z.infer<
  typeof listSocialSourcesToolInputSchema
>;
export type ExplainSourceReadinessToolInput = z.infer<
  typeof explainSourceReadinessToolInputSchema
>;
export type SocialResearchExecutionToolInput = z.infer<
  typeof socialResearchExecutionInputSchema
>;
export type SocialResearchToolName = keyof typeof socialResearchToolSchemas;
