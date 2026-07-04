import type {
  SocialSearchDepth,
  SocialSearchGoal,
  SocialSearchIntent,
  SocialSearchWindow,
  SocialSourceKey,
} from './social-search-intent';

export const socialSearchLaneKinds = [
  'general',
  'search_variant',
  'product_or_group',
  'keyword_group',
  'account_posts',
  'account_mentions',
  'community_listing',
  'thread_enrichment',
  'transcript_enrichment',
  'url_feed',
  'fallback_short_query',
] as const;

export type SocialSearchLaneKind = (typeof socialSearchLaneKinds)[number];

export const socialSearchLaneOperations = [
  'search',
  'listing',
  'account_feed',
  'mention_search',
  'enrichment',
  'url',
] as const;

export type SocialSearchLaneOperation =
  (typeof socialSearchLaneOperations)[number];

export type SocialSearchLaneParameter =
  string | number | boolean | readonly string[] | undefined;

export type SocialSearchLane = {
  readonly laneId: string;
  readonly sourceKey: SocialSourceKey;
  readonly kind: SocialSearchLaneKind;
  readonly operation: SocialSearchLaneOperation;
  readonly query: string;
  readonly priority: number;
  readonly maxItems: number;
  readonly budgetWeight: number;
  readonly reason: string;
  readonly parameters?: Readonly<Record<string, SocialSearchLaneParameter>>;
  readonly dependsOnLaneIds?: readonly string[];
};

export type SocialSourceBudget = {
  readonly sourceKey: SocialSourceKey;
  readonly maxLanes: number;
  readonly maxItemsPerLane: number;
  readonly includeEnrichment: boolean;
};

export type SocialSearchPlanWarning = {
  readonly code: SocialSearchPlanWarningCode;
  readonly message: string;
  readonly sourceKey?: SocialSourceKey;
};

export const socialSearchPlanWarningCodes = [
  'source_lanes_capped',
  'global_lanes_capped',
  'empty_entities_ignored',
  'unknown_source_strategy',
  'unsupported_source_capability',
  'source_runtime_not_ready',
  'source_readiness_missing',
] as const;

export type SocialSearchPlanWarningCode =
  (typeof socialSearchPlanWarningCodes)[number];

export const socialSearchPlanSourceSelections = ['explicit', 'default'] as const;

export type SocialSearchPlanSourceSelection =
  (typeof socialSearchPlanSourceSelections)[number];

export type SocialSearchPlanTrace = {
  readonly planner: {
    readonly defaultSourcesUsed: boolean;
    readonly maxLanes: number;
    readonly queryStrategyId: string;
    readonly queryStrategyRecipeId: string;
    readonly sourceStrategyMode: 'built_in_plus_extensions' | 'custom_only';
    readonly sourceCapabilityMode: 'built_in_plus_overrides' | 'custom_only';
  };
  readonly sources: readonly SocialSearchPlanSourceTrace[];
  readonly lanes: {
    readonly planned: number;
    readonly afterDedupe: number;
    readonly emitted: number;
    readonly cappedByGlobalLimit: boolean;
    readonly byKind: readonly SocialSearchPlanLaneKindCount[];
  };
  readonly warnings: {
    readonly total: number;
    readonly byCode: readonly SocialSearchPlanWarningCodeCount[];
  };
};

export type SocialSearchPlanSourceTrace = {
  readonly sourceKey: SocialSourceKey;
  readonly selection: SocialSearchPlanSourceSelection;
  readonly budget: SocialSourceBudget;
  readonly strategyAvailable: boolean;
  readonly capabilityProfileAvailable: boolean;
  readonly plannedLaneCount: number;
  readonly capabilityFilteredLaneCount: number;
  readonly emittedLaneCount: number;
  readonly cappedBySourceLimit: boolean;
  readonly warningCodes: readonly SocialSearchPlanWarningCode[];
};

export type SocialSearchPlanLaneKindCount = {
  readonly kind: SocialSearchLaneKind;
  readonly count: number;
};

export type SocialSearchPlanWarningCodeCount = {
  readonly code: SocialSearchPlanWarningCode;
  readonly count: number;
};

export type SocialSearchPlan = {
  readonly intent: SocialSearchIntent;
  readonly normalizedTopic: string;
  readonly window: SocialSearchWindow;
  readonly depth: SocialSearchDepth;
  readonly goal: SocialSearchGoal;
  readonly lanes: readonly SocialSearchLane[];
  readonly budgets: readonly SocialSourceBudget[];
  readonly warnings: readonly SocialSearchPlanWarning[];
  readonly trace?: SocialSearchPlanTrace;
};

export type SocialSearchPlanError = {
  readonly code: 'topic_required' | 'source_required' | 'invalid_window';
  readonly message: string;
};

export type SocialSearchPlanResult =
  | { readonly ok: true; readonly plan: SocialSearchPlan }
  | { readonly ok: false; readonly errors: readonly SocialSearchPlanError[] };
