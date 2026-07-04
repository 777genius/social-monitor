import type {
  SocialSearchDepth,
  SocialSearchIntent,
  SocialSearchWindow,
  SocialSourceKey,
} from '../value-objects/social-search-intent';
import { builtInSocialSourceKeys } from '../value-objects/social-search-intent';
import {
  builtInSocialSourceCapabilityProfiles,
  type SocialSourceCapabilityProfile,
  type SocialSourceRuntimeReadinessState,
} from '../value-objects/social-source-capability-profile';
import type {
  SocialSearchPlan,
  SocialSearchPlanError,
  SocialSearchPlanResult,
  SocialSearchPlanSourceTrace,
  SocialSearchPlanWarning,
  SocialSourceBudget,
} from '../value-objects/social-search-plan';
import {
  compactUnique,
  normalizeAccounts,
  normalizeCommunities,
  normalizeQueryText,
} from './social-search-planner-normalization';
import {
  compileSocialQueryStrategyRecipe,
  type SocialQueryStrategy,
  type SocialQueryStrategyInput,
  type SocialQueryStrategyRecipe,
} from './social-query-strategy';
import { dedupeLanes } from './social-search-lane-factory';
import {
  builtInSocialSourceLaneStrategies,
  buildSourceLanes,
  hasSourceLaneStrategy,
  type SocialSourceLaneStrategy,
} from './social-source-lane-strategies';
import {
  filterLanesBySourceCapability,
  sourceCapabilityBySource,
  warningsForSourceReadiness,
} from './social-source-capability-policy';

export type SocialSearchPlannerOptions = {
  readonly defaultSources?: readonly SocialSourceKey[];
  readonly maxLanes?: number;
  readonly sourceLimits?: readonly SocialSourceLimit[];
  readonly sourceCapabilities?: readonly SocialSourceCapabilityProfile[];
  readonly disableBuiltInSourceCapabilities?: boolean;
  readonly executionAllowedRuntimeReadiness?: readonly SocialSourceRuntimeReadinessState[];
  readonly warnWhenSourceReadinessMissing?: boolean;
  readonly queryStrategyRecipe?: SocialQueryStrategyRecipe;
  readonly queryStrategy?: SocialQueryStrategy;
  readonly additionalSourceLaneStrategies?: readonly SocialSourceLaneStrategy[];
  readonly sourceLaneStrategies?: readonly SocialSourceLaneStrategy[];
};

export type SocialSourceLimit = {
  readonly sourceKey: SocialSourceKey;
  readonly maxLanes?: number;
  readonly maxItemsPerLane?: number;
  readonly includeEnrichment?: boolean;
};

type DepthProfile = {
  readonly maxLanesPerSource: number;
  readonly maxItemsPerLane: number;
  readonly includeEnrichment: boolean;
};

const defaultSources: readonly SocialSourceKey[] = [
  'reddit',
  'x-twitter',
  'hacker-news',
  'github',
  'rss',
];

const depthProfiles: Record<SocialSearchDepth, DepthProfile> = {
  light: {
    maxLanesPerSource: 3,
    maxItemsPerLane: 20,
    includeEnrichment: false,
  },
  balanced: {
    maxLanesPerSource: 6,
    maxItemsPerLane: 40,
    includeEnrichment: true,
  },
  deep: {
    maxLanesPerSource: 10,
    maxItemsPerLane: 80,
    includeEnrichment: true,
  },
};

export const planSocialSearch = (
  intent: SocialSearchIntent,
  options: SocialSearchPlannerOptions = {},
): SocialSearchPlanResult => {
  const normalizedTopic = normalizeQueryText(intent.topic);
  const errors = validateIntent(intent, normalizedTopic);

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const depth = intent.depth ?? 'balanced';
  const goal = intent.goal ?? 'research';
  const window = intent.window ?? '30d';
  const sources = compactUnique([
    ...(intent.sources?.length
      ? intent.sources
      : (options.defaultSources ?? defaultSources)),
  ]);
  const products = compactUnique(
    (intent.entities?.products ?? []).map(normalizeQueryText).filter(Boolean),
  );
  const keywords = compactUnique(
    (intent.entities?.keywords ?? []).map(normalizeQueryText).filter(Boolean),
  );
  const urls = compactUnique(
    (intent.entities?.urls ?? []).map((url) => url.trim()).filter(Boolean),
  );
  const handles = normalizeAccounts(intent.entities?.handles ?? []);
  const communities = normalizeCommunities(intent.entities?.communities ?? []);
  const queryPlan = compileQueryPlan(
    {
      topic: normalizedTopic,
      urls,
      products,
      keywords,
    },
    options,
  );
  const budgets = sources.map((sourceKey) =>
    budgetForSource(sourceKey, depth, options.sourceLimits ?? []),
  );
  const sourceLaneStrategies = resolveSourceLaneStrategies(options);
  const capabilities = sourceCapabilityBySource(
    resolveSourceCapabilities(options),
  );
  const warnings: SocialSearchPlanWarning[] = [];
  const sourceTraces: SocialSearchPlanSourceTrace[] = [];
  const explicitSourceKeys = intent.sources === undefined ? [] : intent.sources;
  const lanes = sources.flatMap((sourceKey) => {
    const budget = requireBudget(
      budgets.find((item) => item.sourceKey === sourceKey),
      sourceKey,
    );
    const sourceWarnings: SocialSearchPlanWarning[] = [];
    const planned = buildSourceLanes({
      sourceKey,
      topic: normalizedTopic,
      handles,
      communities,
      queryPlan,
      budget,
      strategies: sourceLaneStrategies,
    });
    const capability = capabilities.get(sourceKey);
    const capabilityFiltered = filterLanesBySourceCapability(
      sourceKey,
      planned,
      capability,
    );
    sourceWarnings.push(...capabilityFiltered.warnings);
    sourceWarnings.push(
      ...warningsForSourceReadiness(sourceKey, capability, {
        executionAllowedRuntimeReadiness:
          options.executionAllowedRuntimeReadiness,
        warnWhenReadinessMissing: options.warnWhenSourceReadinessMissing,
      }),
    );

    if (
      !builtInSocialSourceKeys.includes(sourceKey as never) &&
      !hasSourceLaneStrategy(sourceKey, sourceLaneStrategies) &&
      hasSourceSpecificEntities(sourceKey, handles, communities)
    ) {
      sourceWarnings.push({
        code: 'unknown_source_strategy',
        sourceKey,
        message: `${sourceKey} has source-specific entities but no lane strategy`,
      });
    }

    const emittedLanes = capabilityFiltered.lanes.slice(0, budget.maxLanes);
    if (capabilityFiltered.lanes.length > emittedLanes.length) {
      sourceWarnings.push({
        code: 'source_lanes_capped',
        sourceKey,
        message: `${sourceKey} lanes capped at ${budget.maxLanes}`,
      });
    }

    warnings.push(...sourceWarnings);
    sourceTraces.push({
      sourceKey,
      selection: explicitSourceKeys.includes(sourceKey) ? 'explicit' : 'default',
      budget,
      strategyAvailable: hasSourceLaneStrategy(sourceKey, sourceLaneStrategies),
      capabilityProfileAvailable: capability !== undefined,
      plannedLaneCount: planned.length,
      capabilityFilteredLaneCount: capabilityFiltered.lanes.length,
      emittedLaneCount: emittedLanes.length,
      cappedBySourceLimit: capabilityFiltered.lanes.length > emittedLanes.length,
      warningCodes: compactUnique(sourceWarnings.map((warning) => warning.code)),
    });

    return emittedLanes;
  });
  const dedupedLanes = dedupeLanes(lanes);
  const maxLanes = options.maxLanes ?? 40;
  const cappedLanes = dedupedLanes.slice(0, maxLanes);

  if (dedupedLanes.length > cappedLanes.length) {
    warnings.push({
      code: 'global_lanes_capped',
      message: `Search plan lanes capped at ${maxLanes}`,
    });
  }

  return {
    ok: true,
    plan: {
      intent,
      normalizedTopic,
      window,
      depth,
      goal,
      lanes: cappedLanes,
      budgets,
      warnings,
      trace: {
        planner: {
          defaultSourcesUsed: intent.sources === undefined,
          maxLanes,
          queryStrategyId: queryPlan.strategyId,
          queryStrategyRecipeId: queryPlan.recipeId,
          sourceStrategyMode:
            options.sourceLaneStrategies === undefined
              ? 'built_in_plus_extensions'
              : 'custom_only',
          sourceCapabilityMode:
            options.disableBuiltInSourceCapabilities === true
              ? 'custom_only'
              : 'built_in_plus_overrides',
        },
        sources: sourceTraces,
        lanes: {
          planned: lanes.length,
          afterDedupe: dedupedLanes.length,
          emitted: cappedLanes.length,
          cappedByGlobalLimit: dedupedLanes.length > cappedLanes.length,
          byKind: countByLaneKind(cappedLanes),
        },
        warnings: {
          total: warnings.length,
          byCode: countByWarningCode(warnings),
        },
      },
    },
  };
};

export const explainSocialSearchPlan = (plan: SocialSearchPlan): string =>
  plan.lanes
    .map(
      (lane) =>
        `${lane.sourceKey}/${lane.kind}: ${lane.query} (${lane.reason})`,
    )
    .join('\n');

const validateIntent = (
  intent: SocialSearchIntent,
  normalizedTopic: string,
): readonly SocialSearchPlanError[] => {
  const errors: SocialSearchPlanError[] = [];

  if (normalizedTopic.length === 0) {
    errors.push({
      code: 'topic_required',
      message: 'Social search topic must be non-empty.',
    });
  }

  if (intent.sources !== undefined && intent.sources.length === 0) {
    errors.push({
      code: 'source_required',
      message: 'At least one source is required when sources are provided.',
    });
  }

  return errors;
};

const budgetForSource = (
  sourceKey: SocialSourceKey,
  depth: SocialSearchDepth,
  limits: readonly SocialSourceLimit[],
): SocialSourceBudget => {
  const profile = depthProfiles[depth];
  const override = limits.find((limit) => limit.sourceKey === sourceKey);

  return {
    sourceKey,
    maxLanes: override?.maxLanes ?? profile.maxLanesPerSource,
    maxItemsPerLane: override?.maxItemsPerLane ?? profile.maxItemsPerLane,
    includeEnrichment: override?.includeEnrichment ?? profile.includeEnrichment,
  };
};

const requireBudget = (
  budget: SocialSourceBudget | undefined,
  sourceKey: SocialSourceKey,
): SocialSourceBudget => {
  if (budget !== undefined) {
    return budget;
  }

  return budgetForSource(sourceKey, 'balanced', []);
};

export const supportedPlannerSources = builtInSocialSourceKeys;

const resolveSourceLaneStrategies = (
  options: SocialSearchPlannerOptions,
): readonly SocialSourceLaneStrategy[] =>
  options.sourceLaneStrategies ?? [
    ...builtInSocialSourceLaneStrategies,
    ...(options.additionalSourceLaneStrategies ?? []),
  ];

const resolveSourceCapabilities = (
  options: SocialSearchPlannerOptions,
): readonly SocialSourceCapabilityProfile[] => {
  const builtIn =
    options.disableBuiltInSourceCapabilities === true
      ? []
      : builtInSocialSourceCapabilityProfiles;

  return [...builtIn, ...(options.sourceCapabilities ?? [])];
};

const compileQueryPlan = (
  input: SocialQueryStrategyInput,
  options: SocialSearchPlannerOptions,
) =>
  options.queryStrategy?.compile(input, options.queryStrategyRecipe) ??
  compileSocialQueryStrategyRecipe(input, options.queryStrategyRecipe);

const hasSourceSpecificEntities = (
  sourceKey: SocialSourceKey,
  handles: ReturnType<typeof normalizeAccounts>,
  communities: ReturnType<typeof normalizeCommunities>,
): boolean =>
  handles.some((handle) => handle.sourceKey === sourceKey) ||
  communities.some((community) => community.sourceKey === sourceKey);

const countByLaneKind = (lanes: readonly SocialSearchPlan['lanes'][number][]) =>
  countBy(lanes.map((lane) => lane.kind)).map(([kind, count]) => ({
    kind,
    count,
  }));

const countByWarningCode = (warnings: readonly SocialSearchPlanWarning[]) =>
  countBy(warnings.map((warning) => warning.code)).map(([code, count]) => ({
    code,
    count,
  }));

const countBy = <TValue extends string>(
  values: readonly TValue[],
): readonly (readonly [TValue, number])[] => {
  const counts = new Map<TValue, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()];
};

export type { SocialSearchWindow };
