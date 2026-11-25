import { z } from 'zod';

import {
  socialSearchDepths,
  socialSearchGoals,
} from '../../domain/value-objects/social-search-intent';
import {
  socialSearchLaneKinds,
  socialSearchLaneOperations,
  socialSearchPlanSourceSelections,
  socialSearchPlanWarningCodes,
} from '../../domain/value-objects/social-search-plan';
import {
  socialSearchIntentInputSchema,
  sourceKeySchema,
} from '../tools/social-research-tool-schemas';

export const laneParameterSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
]);

export const socialSearchLaneSchema = z.object({
  laneId: z.string().trim().min(1),
  sourceKey: z.string().trim().min(1),
  kind: z.enum(socialSearchLaneKinds),
  operation: z.enum(socialSearchLaneOperations),
  query: z.string(),
  priority: z.number(),
  maxItems: z.number().int().nonnegative(),
  budgetWeight: z.number().positive(),
  reason: z.string(),
  parameters: z
    .record(z.string().trim().min(1), laneParameterSchema)
    .optional(),
  dependsOnLaneIds: z.array(z.string().trim().min(1)).optional(),
});

export const socialSourceBudgetSchema = z.object({
  sourceKey: z.string().trim().min(1),
  maxLanes: z.number().int().positive(),
  maxItemsPerLane: z.number().int().positive(),
  includeEnrichment: z.boolean(),
});

export const socialSearchPlanWarningSchema = z.object({
  code: z.enum(socialSearchPlanWarningCodes),
  message: z.string(),
  sourceKey: z.string().trim().min(1).optional(),
});

export const socialSearchPlanTraceSchema = z.object({
  planner: z.object({
    defaultSourcesUsed: z.boolean(),
    maxLanes: z.number().int().positive(),
    queryStrategyId: z.string().trim().min(1),
    queryStrategyRecipeId: z.string().trim().min(1),
    sourceStrategyMode: z.enum(['built_in_plus_extensions', 'custom_only']),
    sourceCapabilityMode: z.enum(['built_in_plus_overrides', 'custom_only']),
  }),
  sources: z.array(
    z.object({
      sourceKey: sourceKeySchema,
      selection: z.enum(socialSearchPlanSourceSelections),
      budget: socialSourceBudgetSchema,
      strategyAvailable: z.boolean(),
      capabilityProfileAvailable: z.boolean(),
      plannedLaneCount: z.number().int().nonnegative(),
      capabilityFilteredLaneCount: z.number().int().nonnegative(),
      emittedLaneCount: z.number().int().nonnegative(),
      cappedBySourceLimit: z.boolean(),
      warningCodes: z.array(z.enum(socialSearchPlanWarningCodes)),
    }),
  ),
  lanes: z.object({
    planned: z.number().int().nonnegative(),
    afterDedupe: z.number().int().nonnegative(),
    emitted: z.number().int().nonnegative(),
    cappedByGlobalLimit: z.boolean(),
    byKind: z.array(
      z.object({
        kind: z.enum(socialSearchLaneKinds),
        count: z.number().int().nonnegative(),
      }),
    ),
  }),
  warnings: z.object({
    total: z.number().int().nonnegative(),
    byCode: z.array(
      z.object({
        code: z.enum(socialSearchPlanWarningCodes),
        count: z.number().int().nonnegative(),
      }),
    ),
  }),
});

export const socialSearchPlanSchema = z.object({
  intent: socialSearchIntentInputSchema,
  normalizedTopic: z.string(),
  window: socialSearchIntentInputSchema.shape.window.unwrap(),
  depth: z.enum(socialSearchDepths),
  goal: z.enum(socialSearchGoals),
  lanes: z.array(socialSearchLaneSchema),
  budgets: z.array(socialSourceBudgetSchema),
  warnings: z.array(socialSearchPlanWarningSchema),
  trace: socialSearchPlanTraceSchema.optional(),
});

export const socialSearchPlanErrorSchema = z.object({
  code: z.enum(['topic_required', 'source_required', 'invalid_window']),
  message: z.string(),
});

export const socialSearchPlanResultSchema = z.union([
  z.object({
    ok: z.literal(true),
    plan: socialSearchPlanSchema,
  }),
  z.object({
    ok: z.literal(false),
    errors: z.array(socialSearchPlanErrorSchema),
  }),
]);
