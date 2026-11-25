import { z } from 'zod';

import { socialAccountLaneRecipeSelectors } from '../../domain/policies/social-source-lane-recipes';
import {
  socialSearchLaneKinds,
  socialSearchLaneOperations,
} from '../../domain/value-objects/social-search-plan';
import {
  explainSourceReadinessToolInputSchema,
  fetchThreadToolInputSchema,
  listSocialSourcesToolInputSchema,
  plannerOptionsInputSchema,
  rankResultsToolInputSchema,
  socialQueryStrategyRecipeInputSchema,
  socialItemQualityRecipeInputSchema,
  socialRankingRecipeInputSchema,
  socialResearchExecutionInputSchema,
  socialResearchRequestInputSchema,
  socialSearchIntentInputSchema,
  socialSearchItemInputSchema,
  socialSourceCapabilityProfileInputSchema,
  sourceKeySchema,
} from '../tools/social-research-tool-schemas';
import type { SocialResearchToolJsonSchema } from '../tools/social-research-tool-json-schemas';
import { socialResearchFailureCodes } from '../../application/social-research-sdk';
import { socialResearchCacheTraceStatuses } from '../../application/contracts/social-research-gateway';
import {
  laneParameterSchema,
  socialSearchPlanErrorSchema,
  socialSearchPlanResultSchema,
  socialSearchPlanSchema,
  socialSearchPlanTraceSchema,
} from './social-research-plan-model-schemas';
import {
  socialSourceReadinessExplanationSchema,
  socialSourceRegistryEntryListSchema,
} from './social-research-source-discovery-model-schemas';
import { socialSourceRegistryEntrySchema } from './social-research-source-registry-model-schemas';

export type SocialResearchModelDefinition = {
  readonly name: string;
  readonly description: string;
  readonly schema: z.ZodType;
};

export type SocialResearchSdkOperationDefinition = {
  readonly operationId: string;
  readonly description: string;
  readonly inputModel: string;
  readonly optionsModel?: string;
  readonly outputModel: string;
  readonly failureModel?: string;
  readonly safeOperationId?: string;
  readonly safeOutputModel?: string;
  readonly requiresGateway: boolean;
  readonly requiresExecutionScope: boolean;
  readonly sideEffects: 'none' | 'provider_read';
};

const socialResearchFailureSchema = z.object({
  code: z.enum(socialResearchFailureCodes),
  message: z.string(),
  details: z.array(socialSearchPlanErrorSchema),
  retryAfterMs: z.number().int().nonnegative().optional(),
  causeName: z.string().trim().min(1).optional(),
});

const rankedSocialSearchItemSchema = z.object({
  item: socialSearchItemInputSchema,
  ranking: z.object({
    recipeId: z.string().trim().min(1),
    score: z.number(),
    relevanceScore: z.number(),
    engagementScore: z.number(),
    recencyScore: z.number(),
    qualityScore: z.number(),
    qualitySignals: z.array(z.string()),
    reasons: z.array(z.string()),
  }),
});

const rankedSocialSearchItemListSchema = z.array(rankedSocialSearchItemSchema);

const socialResearchResultSchema = (valueSchema: z.ZodType) =>
  z.union([
    z.object({
      ok: z.literal(true),
      value: valueSchema,
    }),
    z.object({
      ok: z.literal(false),
      error: socialResearchFailureSchema,
    }),
  ]);

const socialSearchRunTraceSchema = z.object({
  cache: z.object({
    status: z.enum(socialResearchCacheTraceStatuses),
    cacheKeyAvailable: z.boolean(),
    scope: z
      .object({
        tenantId: z.string().trim().min(1),
        workspaceId: z.string().trim().min(1),
      })
      .optional(),
  }),
  execution: z.object({
    gatewayInvoked: z.boolean(),
    authorizedLaneCount: z.number().int().nonnegative(),
    sourceKeys: z.array(sourceKeySchema),
  }),
});

const socialSearchRunSchema = z.object({
  plan: socialSearchPlanSchema,
  items: z.array(socialSearchItemInputSchema),
  rankedItems: z.array(rankedSocialSearchItemSchema).optional(),
  warnings: z.array(z.string()),
  partial: z.boolean(),
  trace: socialSearchRunTraceSchema.optional(),
});

const socialThreadSchema = z.object({
  root: socialSearchItemInputSchema,
  units: z.array(
    z.object({
      unitId: z.string().trim().min(1),
      parentUnitId: z.string().trim().min(1).optional(),
      authorHandle: z.string().trim().min(1).optional(),
      body: z.string(),
      publishedAt: z.string().datetime().optional(),
    }),
  ),
  warnings: z.array(z.string()),
});

const socialResearchTextResultSchema = socialResearchResultSchema(z.string());
const socialSearchRunResultSchema = socialResearchResultSchema(
  socialSearchRunSchema,
);
const socialThreadResultSchema = socialResearchResultSchema(socialThreadSchema);
const rankedSocialSearchItemListResultSchema = socialResearchResultSchema(
  rankedSocialSearchItemListSchema,
);
const socialSourceProfileResultSchema = socialResearchResultSchema(
  socialSourceRegistryEntrySchema,
);
const socialSourceReadinessExplanationResultSchema = socialResearchResultSchema(
  socialSourceReadinessExplanationSchema,
);

const socialResearchSearchOptionsSchema = plannerOptionsInputSchema.extend({
  execution: socialResearchExecutionInputSchema.optional(),
});

const socialAccountLaneStrategyRecipeSchema = z.object({
  recipeKind: z.literal('account_lane_template'),
  recipeId: z.string().trim().min(1),
  sourceKey: sourceKeySchema,
  accountSelector: z.enum(socialAccountLaneRecipeSelectors),
  laneKind: z.enum(socialSearchLaneKinds),
  operation: z.enum(socialSearchLaneOperations),
  queryTemplate: z.string().trim().min(1),
  priority: z.number(),
  reason: z.string().trim().min(1),
  budgetWeight: z.number().positive().optional(),
  parameters: z
    .record(z.string().trim().min(1), laneParameterSchema)
    .optional(),
});

export const socialResearchModelDefinitions = [
  {
    name: 'SocialSearchIntent',
    description: 'Source-agnostic user search request.',
    schema: socialSearchIntentInputSchema,
  },
  {
    name: 'SocialResearchRequestInput',
    description: 'Ergonomic SDK request input compiled to SocialSearchIntent.',
    schema: socialResearchRequestInputSchema,
  },
  {
    name: 'SocialResearchExecutionScope',
    description: 'Tenant/workspace execution scope for provider-backed reads.',
    schema: socialResearchExecutionInputSchema,
  },
  {
    name: 'SocialSearchPlannerOptions',
    description: 'Planner limits and default source selection.',
    schema: plannerOptionsInputSchema,
  },
  {
    name: 'SocialSourceCapabilityProfile',
    description: 'SDK-neutral source capability and readiness projection.',
    schema: socialSourceCapabilityProfileInputSchema,
  },
  {
    name: 'SocialSourceRegistryEntry',
    description:
      'SDK-neutral source capability plus certification, acquisition and runtime-adapter policy metadata.',
    schema: socialSourceRegistryEntrySchema,
  },
  {
    name: 'SocialSourceRegistryEntryList',
    description: 'Stable list of SDK-neutral source registry entries.',
    schema: socialSourceRegistryEntryListSchema,
  },
  {
    name: 'SocialSourceListInput',
    description: 'Optional source registry filter input.',
    schema: listSocialSourcesToolInputSchema,
  },
  {
    name: 'SocialSourceProfileInput',
    description: 'Input for reading one source profile by source key.',
    schema: explainSourceReadinessToolInputSchema,
  },
  {
    name: 'SocialSourceReadinessExplanation',
    description:
      'Structured source readiness explanation for planning and default execution policy.',
    schema: socialSourceReadinessExplanationSchema,
  },
  {
    name: 'SocialSourceProfileResult',
    description: 'Non-throwing SDK result for source profile reads.',
    schema: socialSourceProfileResultSchema,
  },
  {
    name: 'SocialSourceReadinessExplanationResult',
    description: 'Non-throwing SDK result for source readiness explanations.',
    schema: socialSourceReadinessExplanationResultSchema,
  },
  {
    name: 'SocialAccountLaneStrategyRecipe',
    description:
      'Serializable account-lane recipe that generated SDKs can compile into a lane strategy.',
    schema: socialAccountLaneStrategyRecipeSchema,
  },
  {
    name: 'SocialQueryStrategyRecipe',
    description:
      'Serializable semantic query strategy recipe for generated SDKs and transport input.',
    schema: socialQueryStrategyRecipeInputSchema,
  },
  {
    name: 'SocialRankingRecipe',
    description:
      'Serializable ranking recipe for generated SDKs and rank-only transport input.',
    schema: socialRankingRecipeInputSchema,
  },
  {
    name: 'SocialItemQualityRecipe',
    description:
      'Serializable source-neutral quality filter recipe used by ranking.',
    schema: socialItemQualityRecipeInputSchema,
  },
  {
    name: 'SocialResearchSearchOptions',
    description: 'Search execution options including optional tenant scope.',
    schema: socialResearchSearchOptionsSchema,
  },
  {
    name: 'SocialSearchPlanTrace',
    description:
      'Machine-readable planner trace for source, lane, cap and warning decisions.',
    schema: socialSearchPlanTraceSchema,
  },
  {
    name: 'SocialSearchPlan',
    description: 'Provider-neutral lanes and budgets before execution.',
    schema: socialSearchPlanSchema,
  },
  {
    name: 'SocialSearchPlanResult',
    description: 'Plan creation result with typed validation errors.',
    schema: socialSearchPlanResultSchema,
  },
  {
    name: 'SocialResearchFailure',
    description: 'Stable SDK failure envelope for non-throwing SDK methods.',
    schema: socialResearchFailureSchema,
  },
  {
    name: 'SocialResearchTextResult',
    description: 'Non-throwing SDK result for text responses.',
    schema: socialResearchTextResultSchema,
  },
  {
    name: 'FetchSocialThreadCommand',
    description: 'Thread lookup request by canonical URL or provider id.',
    schema: fetchThreadToolInputSchema,
  },
  {
    name: 'RankSocialItemsInput',
    description: 'Normalized social items to rank for a research goal.',
    schema: rankResultsToolInputSchema,
  },
  {
    name: 'SocialSearchItem',
    description: 'Provider-normalized social item with optional metrics.',
    schema: socialSearchItemInputSchema,
  },
  {
    name: 'RankedSocialSearchItem',
    description: 'Normalized social item with score breakdown and reasons.',
    schema: rankedSocialSearchItemSchema,
  },
  {
    name: 'RankedSocialSearchItemList',
    description: 'Ranked normalized social items.',
    schema: rankedSocialSearchItemListSchema,
  },
  {
    name: 'SocialSearchRunTrace',
    description:
      'Stable SDK execution trace for cache and gateway observability.',
    schema: socialSearchRunTraceSchema,
  },
  {
    name: 'SocialSearchRun',
    description: 'Search execution result returned by SDK and transports.',
    schema: socialSearchRunSchema,
  },
  {
    name: 'SocialSearchRunResult',
    description: 'Non-throwing SDK result for search execution.',
    schema: socialSearchRunResultSchema,
  },
  {
    name: 'SocialThread',
    description: 'Conversation thread rooted at a normalized social item.',
    schema: socialThreadSchema,
  },
  {
    name: 'SocialThreadResult',
    description: 'Non-throwing SDK result for thread fetches.',
    schema: socialThreadResultSchema,
  },
  {
    name: 'RankedSocialSearchItemListResult',
    description: 'Non-throwing SDK result for rank-only workflows.',
    schema: rankedSocialSearchItemListResultSchema,
  },
] as const satisfies readonly SocialResearchModelDefinition[];

export const socialResearchSdkOperationDefinitions = [
  {
    operationId: 'createSearchPlan',
    description: 'Create provider-neutral lanes without external calls.',
    inputModel: 'SocialSearchIntent',
    optionsModel: 'SocialSearchPlannerOptions',
    outputModel: 'SocialSearchPlanResult',
    requiresGateway: false,
    requiresExecutionScope: false,
    sideEffects: 'none',
  },
  {
    operationId: 'createSearchPlanFromRequest',
    description:
      'Create provider-neutral lanes from ergonomic SDK request input.',
    inputModel: 'SocialResearchRequestInput',
    optionsModel: 'SocialSearchPlannerOptions',
    outputModel: 'SocialSearchPlanResult',
    requiresGateway: false,
    requiresExecutionScope: false,
    sideEffects: 'none',
  },
  {
    operationId: 'explainSearchPlan',
    description: 'Return a human-readable explanation of a search plan.',
    inputModel: 'SocialSearchIntent',
    optionsModel: 'SocialSearchPlannerOptions',
    outputModel: 'string',
    failureModel: 'SocialResearchFailure',
    safeOperationId: 'tryExplainSearchPlan',
    safeOutputModel: 'SocialResearchTextResult',
    requiresGateway: false,
    requiresExecutionScope: false,
    sideEffects: 'none',
  },
  {
    operationId: 'explainSearchRequest',
    description:
      'Return a human-readable explanation from ergonomic SDK request input.',
    inputModel: 'SocialResearchRequestInput',
    optionsModel: 'SocialSearchPlannerOptions',
    outputModel: 'string',
    failureModel: 'SocialResearchFailure',
    safeOperationId: 'tryExplainSearchRequest',
    safeOutputModel: 'SocialResearchTextResult',
    requiresGateway: false,
    requiresExecutionScope: false,
    sideEffects: 'none',
  },
  {
    operationId: 'search',
    description: 'Execute a search plan through the configured gateway.',
    inputModel: 'SocialSearchIntent',
    optionsModel: 'SocialResearchSearchOptions',
    outputModel: 'SocialSearchRun',
    failureModel: 'SocialResearchFailure',
    safeOperationId: 'trySearch',
    safeOutputModel: 'SocialSearchRunResult',
    requiresGateway: true,
    requiresExecutionScope: true,
    sideEffects: 'provider_read',
  },
  {
    operationId: 'searchRequest',
    description:
      'Execute ergonomic SDK request input through the configured gateway.',
    inputModel: 'SocialResearchRequestInput',
    optionsModel: 'SocialResearchSearchOptions',
    outputModel: 'SocialSearchRun',
    failureModel: 'SocialResearchFailure',
    safeOperationId: 'trySearchRequest',
    safeOutputModel: 'SocialSearchRunResult',
    requiresGateway: true,
    requiresExecutionScope: true,
    sideEffects: 'provider_read',
  },
  {
    operationId: 'fetchThread',
    description: 'Fetch provider conversation units for a root item.',
    inputModel: 'FetchSocialThreadCommand',
    outputModel: 'SocialThread',
    failureModel: 'SocialResearchFailure',
    safeOperationId: 'tryFetchThread',
    safeOutputModel: 'SocialThreadResult',
    requiresGateway: true,
    requiresExecutionScope: true,
    sideEffects: 'provider_read',
  },
  {
    operationId: 'rankResults',
    description: 'Rank normalized items without provider calls.',
    inputModel: 'RankSocialItemsInput',
    outputModel: 'RankedSocialSearchItemList',
    failureModel: 'SocialResearchFailure',
    safeOperationId: 'tryRankResults',
    safeOutputModel: 'RankedSocialSearchItemListResult',
    requiresGateway: false,
    requiresExecutionScope: false,
    sideEffects: 'none',
  },
  {
    operationId: 'listSources',
    description: 'List SDK source registry profiles without provider calls.',
    inputModel: 'SocialSourceListInput',
    outputModel: 'SocialSourceRegistryEntryList',
    requiresGateway: false,
    requiresExecutionScope: false,
    sideEffects: 'none',
  },
  {
    operationId: 'getSourceProfile',
    description: 'Read one SDK source registry profile by source key.',
    inputModel: 'SocialSourceProfileInput',
    outputModel: 'SocialSourceRegistryEntry',
    failureModel: 'SocialResearchFailure',
    safeOperationId: 'tryGetSourceProfile',
    safeOutputModel: 'SocialSourceProfileResult',
    requiresGateway: false,
    requiresExecutionScope: false,
    sideEffects: 'none',
  },
  {
    operationId: 'explainSourceReadiness',
    description:
      'Explain source planning and default execution readiness without provider calls.',
    inputModel: 'SocialSourceProfileInput',
    outputModel: 'SocialSourceReadinessExplanation',
    failureModel: 'SocialResearchFailure',
    safeOperationId: 'tryExplainSourceReadiness',
    safeOutputModel: 'SocialSourceReadinessExplanationResult',
    requiresGateway: false,
    requiresExecutionScope: false,
    sideEffects: 'none',
  },
] as const satisfies readonly SocialResearchSdkOperationDefinition[];

export const buildSocialResearchModelJsonSchemas = (): Readonly<
  Record<string, SocialResearchToolJsonSchema>
> =>
  Object.fromEntries(
    socialResearchModelDefinitions.map((definition) => [
      definition.name,
      z.toJSONSchema(definition.schema) as SocialResearchToolJsonSchema,
    ]),
  );
