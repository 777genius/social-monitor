import { assertRuntimeProfileAllowsMode } from '@social-monitor/platform-config';
import type {
  DefaultSocialResearchExecutionPolicyOptions,
  SocialSearchPlannerOptions,
  SocialResearchResultCachePort,
} from '@social-monitor/social-research';
import {
  socialSourceRuntimeReadinessStates,
  type SocialSourceKey,
  type SocialSourceRuntimeReadinessState,
} from '@social-monitor/social-research';
import type { PrismaSocialResearchResultCacheClient } from '@social-monitor/social-research/cache';

export const SOCIAL_RESEARCH_RUNTIME_SETTINGS = Symbol(
  'SOCIAL_RESEARCH_RUNTIME_SETTINGS',
);
export const SOCIAL_RESEARCH_RUNTIME_RESULT_CACHE = Symbol(
  'SOCIAL_RESEARCH_RUNTIME_RESULT_CACHE',
);
export const SOCIAL_RESEARCH_RUNTIME_PRISMA_CLIENT = Symbol(
  'SOCIAL_RESEARCH_RUNTIME_PRISMA_CLIENT',
);
export const SOCIAL_RESEARCH_RUNTIME_PLANNER_OPTIONS = Symbol(
  'SOCIAL_RESEARCH_RUNTIME_PLANNER_OPTIONS',
);

export type SocialResearchResultCacheMode = 'disabled' | 'ephemeral' | 'prisma';

export type SocialResearchRuntimeSettings = {
  readonly executionPolicy: DefaultSocialResearchExecutionPolicyOptions;
  readonly resultCache: {
    readonly mode: SocialResearchResultCacheMode;
    readonly ttlMs: number;
    readonly maxEntries: number;
  };
};

export type SocialResearchRuntimeProviderTokenMap = {
  readonly [SOCIAL_RESEARCH_RUNTIME_SETTINGS]: SocialResearchRuntimeSettings;
  readonly [SOCIAL_RESEARCH_RUNTIME_RESULT_CACHE]:
    SocialResearchResultCachePort | undefined;
  readonly [SOCIAL_RESEARCH_RUNTIME_PRISMA_CLIENT]:
    PrismaSocialResearchResultCacheClient | undefined;
  readonly [SOCIAL_RESEARCH_RUNTIME_PLANNER_OPTIONS]: SocialSearchPlannerOptions;
};

export const resolveSocialResearchRuntimeSettings = (
  env: NodeJS.ProcessEnv,
): SocialResearchRuntimeSettings => {
  const resultCacheMode = parseResultCacheMode(env);
  assertRuntimeProfileAllowsMode({
    env,
    settingName: 'SOCIAL_RESEARCH_RESULT_CACHE',
    selectedMode: resultCacheMode,
    durableModes: ['disabled', 'prisma'],
  });

  return {
    executionPolicy: {
      requireExecutionScope: parseBoolean(
        env.SOCIAL_RESEARCH_REQUIRE_EXECUTION_SCOPE,
        true,
      ),
      requireSourceBindings: parseBoolean(
        env.SOCIAL_RESEARCH_REQUIRE_SOURCE_BINDINGS,
        true,
      ),
      requireSourceRuntimeReadiness: parseBoolean(
        env.SOCIAL_RESEARCH_REQUIRE_SOURCE_RUNTIME_READINESS,
        true,
      ),
      allowedRuntimeReadiness:
        parseRuntimeReadinessCsv(
          env.SOCIAL_RESEARCH_ALLOWED_RUNTIME_READINESS,
        ) ?? defaultAllowedRuntimeReadiness(env),
      allowedSources: parseCsv(env.SOCIAL_RESEARCH_ALLOWED_SOURCES),
      maxLanes: parsePositiveInteger(env.SOCIAL_RESEARCH_MAX_LANES),
      maxItemsPerLane: parsePositiveInteger(
        env.SOCIAL_RESEARCH_MAX_ITEMS_PER_LANE,
      ),
      includeCacheKeys: parseBoolean(
        env.SOCIAL_RESEARCH_INCLUDE_CACHE_KEYS,
        resultCacheMode !== 'disabled',
      ),
    },
    resultCache: {
      mode: resultCacheMode,
      ttlMs:
        parsePositiveInteger(env.SOCIAL_RESEARCH_RESULT_CACHE_TTL_MS) ??
        300_000,
      maxEntries:
        parsePositiveInteger(env.SOCIAL_RESEARCH_RESULT_CACHE_MAX_ENTRIES) ??
        250,
    },
  };
};

const parseResultCacheMode = (
  env: NodeJS.ProcessEnv,
): SocialResearchResultCacheMode => {
  const value = (env.SOCIAL_RESEARCH_RESULT_CACHE ?? 'disabled').trim();

  if (value === 'disabled' || value === 'ephemeral' || value === 'prisma') {
    return value;
  }

  throw new Error(
    'SOCIAL_RESEARCH_RESULT_CACHE must be "disabled", "ephemeral", or "prisma"',
  );
};

const parseBoolean = (
  value: string | undefined,
  fallback: boolean,
): boolean => {
  if (value === undefined || value.trim().length === 0) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') {
    return true;
  }
  if (normalized === 'false' || normalized === '0') {
    return false;
  }

  throw new Error(`Expected boolean value, got ${value}`);
};

const parsePositiveInteger = (
  value: string | undefined,
): number | undefined => {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Expected positive integer value, got ${value}`);
  }

  return parsed;
};

const parseCsv = (
  value: string | undefined,
): readonly SocialSourceKey[] | undefined => {
  const values = (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return values.length === 0 ? undefined : values;
};

const parseRuntimeReadinessCsv = (
  value: string | undefined,
): readonly SocialSourceRuntimeReadinessState[] | undefined => {
  const values = (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (values.length === 0) {
    return undefined;
  }

  const allowed = new Set<string>(socialSourceRuntimeReadinessStates);
  const invalid = values.find((item) => !allowed.has(item));
  if (invalid !== undefined) {
    throw new Error(
      `SOCIAL_RESEARCH_ALLOWED_RUNTIME_READINESS contains unsupported value ${invalid}`,
    );
  }

  return values as readonly SocialSourceRuntimeReadinessState[];
};

const defaultAllowedRuntimeReadiness = (
  env: NodeJS.ProcessEnv,
): readonly SocialSourceRuntimeReadinessState[] =>
  env.SOCIAL_MONITOR_RUNTIME_PROFILE === 'beta'
    ? ['live_beta_ready']
    : ['fixture_ready', 'live_beta_ready'];
