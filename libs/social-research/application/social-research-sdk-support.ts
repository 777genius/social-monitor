import type { SocialSearchRunTrace } from './contracts/social-research-gateway';
import type { SocialSearchPlannerOptions } from '../domain/policies/social-search-planner';
import type { SocialSourceKey } from '../domain/value-objects/social-search-intent';
import type { SocialSearchPlan } from '../domain/value-objects/social-search-plan';
import type { SocialSourceProfileInput } from './social-source-discovery';

export const mergePlannerOptions = (
  defaults: SocialSearchPlannerOptions | undefined,
  overrides: SocialSearchPlannerOptions | undefined,
): SocialSearchPlannerOptions | undefined => {
  if (defaults === undefined) {
    return overrides;
  }
  if (overrides === undefined) {
    return defaults;
  }

  return {
    defaultSources: overrides.defaultSources ?? defaults.defaultSources,
    maxLanes: overrides.maxLanes ?? defaults.maxLanes,
    sourceLimits: overrides.sourceLimits ?? defaults.sourceLimits,
    sourceCapabilities: [
      ...(defaults.sourceCapabilities ?? []),
      ...(overrides.sourceCapabilities ?? []),
    ],
    disableBuiltInSourceCapabilities:
      overrides.disableBuiltInSourceCapabilities ??
      defaults.disableBuiltInSourceCapabilities,
    executionAllowedRuntimeReadiness:
      overrides.executionAllowedRuntimeReadiness ??
      defaults.executionAllowedRuntimeReadiness,
    warnWhenSourceReadinessMissing:
      overrides.warnWhenSourceReadinessMissing ??
      defaults.warnWhenSourceReadinessMissing,
    queryStrategyRecipe:
      overrides.queryStrategyRecipe ?? defaults.queryStrategyRecipe,
    queryStrategy: overrides.queryStrategy ?? defaults.queryStrategy,
    sourceLaneStrategies:
      overrides.sourceLaneStrategies ?? defaults.sourceLaneStrategies,
    additionalSourceLaneStrategies: [
      ...(defaults.additionalSourceLaneStrategies ?? []),
      ...(overrides.additionalSourceLaneStrategies ?? []),
    ],
  };
};

export const searchRunTrace = (params: {
  readonly plan: SocialSearchPlan;
  readonly cacheStatus: SocialSearchRunTrace['cache']['status'];
  readonly cacheKeyAvailable: boolean;
  readonly cacheScope?: SocialSearchRunTrace['cache']['scope'];
  readonly gatewayInvoked: boolean;
}): SocialSearchRunTrace => ({
  cache: {
    status: params.cacheStatus,
    cacheKeyAvailable: params.cacheKeyAvailable,
    ...(params.cacheScope === undefined ? {} : { scope: params.cacheScope }),
  },
  execution: {
    gatewayInvoked: params.gatewayInvoked,
    authorizedLaneCount: params.plan.lanes.length,
    sourceKeys: compactUnique(
      params.plan.lanes.map((laneItem) => laneItem.sourceKey),
    ),
  },
});

export const sourceKeyFromProfileInput = (
  input: SocialSourceProfileInput | SocialSourceKey,
): SocialSourceKey => (typeof input === 'string' ? input : input.sourceKey);

const compactUnique = <T>(values: readonly T[]): readonly T[] => [
  ...new Set(values),
];
