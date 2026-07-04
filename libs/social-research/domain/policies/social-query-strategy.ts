import type {
  SocialSearchLaneKind,
  SocialSearchLaneOperation,
} from '../value-objects/social-search-plan';
import { compactUnique } from './social-search-planner-normalization';

export const socialQueryPhraseModes = ['quote_when_needed', 'plain'] as const;

export type SocialQueryPhraseMode = (typeof socialQueryPhraseModes)[number];

export const socialQueryStrategyRecipeKinds = [
  'semantic_query_strategy_v1',
] as const;

export type SocialQueryStrategyRecipeKind =
  (typeof socialQueryStrategyRecipeKinds)[number];

export type SocialQueryStrategyRecipe = {
  readonly recipeKind: SocialQueryStrategyRecipeKind;
  readonly recipeId: string;
  readonly phraseMode?: SocialQueryPhraseMode;
  readonly disjunctionOperator?: string;
  readonly fallback?: {
    readonly enabled?: boolean;
    readonly maxTokens?: number;
    readonly minTokenLength?: number;
    readonly excludedTokens?: readonly string[];
  };
  readonly lanePriorities?: Partial<Record<SemanticQueryLaneKind, number>>;
};

export const semanticQueryLaneKinds = [
  'general',
  'url_feed',
  'product_or_group',
  'keyword_group',
  'fallback_short_query',
] as const;

export type SocialQueryStrategyInput = {
  readonly topic: string;
  readonly urls: readonly string[];
  readonly products: readonly string[];
  readonly keywords: readonly string[];
};

export type SemanticQueryLaneKind = Extract<
  SocialSearchLaneKind,
  | 'general'
  | 'url_feed'
  | 'product_or_group'
  | 'keyword_group'
  | 'fallback_short_query'
>;

export type SocialCompiledQueryLane = {
  readonly kind: SemanticQueryLaneKind;
  readonly operation: SocialSearchLaneOperation;
  readonly query: string;
  readonly priority: number;
  readonly maxItemsPolicy: 'full_budget' | 'fallback_half_min_10';
  readonly reason: string;
};

export type SocialCompiledQueryPlan = {
  readonly strategyId: string;
  readonly recipeId: string;
  readonly lanes: readonly SocialCompiledQueryLane[];
  readonly fallbackQuery?: string;
};

export type SocialQueryStrategy = {
  readonly strategyId: string;
  readonly compile: (
    input: SocialQueryStrategyInput,
    recipe?: SocialQueryStrategyRecipe,
  ) => SocialCompiledQueryPlan;
};

export const defaultSocialQueryStrategyRecipe = {
  recipeKind: 'semantic_query_strategy_v1',
  recipeId: 'default-social-query-strategy-v1',
  phraseMode: 'quote_when_needed',
  disjunctionOperator: 'OR',
  fallback: {
    enabled: true,
    maxTokens: 4,
    minTokenLength: 3,
    excludedTokens: ['the'],
  },
  lanePriorities: {
    general: 100,
    url_feed: 92,
    product_or_group: 90,
    keyword_group: 80,
    fallback_short_query: 30,
  },
} as const satisfies SocialQueryStrategyRecipe;

export const defaultSocialQueryStrategy: SocialQueryStrategy = {
  strategyId: 'default-social-query-strategy',
  compile: (input, recipe) => compileSocialQueryStrategyRecipe(input, recipe),
};

export const compileSocialQueryStrategyRecipe = (
  input: SocialQueryStrategyInput,
  recipe: SocialQueryStrategyRecipe = defaultSocialQueryStrategyRecipe,
): SocialCompiledQueryPlan => {
  const resolved = resolveRecipe(recipe);
  const lanes: SocialCompiledQueryLane[] = [
    {
      kind: 'general',
      operation: 'search',
      query: input.topic,
      priority: resolved.priority('general'),
      maxItemsPolicy: 'full_budget',
      reason: 'primary topic search',
    },
    ...input.urls.map((url) => ({
      kind: 'url_feed' as const,
      operation: 'url' as const,
      query: url,
      priority: resolved.priority('url_feed'),
      maxItemsPolicy: 'full_budget' as const,
      reason: 'explicit URL lane for feed or URL-addressed sources',
    })),
  ];

  const productQuery = disjunction(input.products, resolved);
  if (productQuery !== undefined) {
    lanes.push({
      kind: 'product_or_group',
      operation: 'search',
      query: productQuery,
      priority: resolved.priority('product_or_group'),
      maxItemsPolicy: 'full_budget',
      reason: 'product and entity recall lane',
    });
  }

  const keywordQuery = disjunction(input.keywords, resolved);
  if (keywordQuery !== undefined) {
    lanes.push({
      kind: 'keyword_group',
      operation: 'search',
      query: keywordQuery,
      priority: resolved.priority('keyword_group'),
      maxItemsPolicy: 'full_budget',
      reason: 'secondary keyword recall lane',
    });
  }

  const fallbackQuery = resolved.fallback.enabled
    ? fallbackQueryFor(input, resolved)
    : undefined;
  if (fallbackQuery !== undefined && fallbackQuery !== input.topic) {
    lanes.push({
      kind: 'fallback_short_query',
      operation: 'search',
      query: fallbackQuery,
      priority: resolved.priority('fallback_short_query'),
      maxItemsPolicy: 'fallback_half_min_10',
      reason: 'short query fallback for strict provider search syntax',
    });
  }

  return {
    strategyId: defaultSocialQueryStrategy.strategyId,
    recipeId: resolved.recipeId,
    lanes,
    ...(fallbackQuery === undefined ? {} : { fallbackQuery }),
  };
};

type ResolvedSocialQueryStrategyRecipe = {
  readonly recipeId: string;
  readonly phraseMode: SocialQueryPhraseMode;
  readonly disjunctionOperator: string;
  readonly fallback: {
    readonly enabled: boolean;
    readonly maxTokens: number;
    readonly minTokenLength: number;
    readonly excludedTokens: ReadonlySet<string>;
  };
  readonly priority: (laneKind: SemanticQueryLaneKind) => number;
};

const resolveRecipe = (
  recipe: SocialQueryStrategyRecipe,
): ResolvedSocialQueryStrategyRecipe => {
  const defaults = defaultSocialQueryStrategyRecipe;
  const fallback = recipe.fallback ?? {};

  return {
    recipeId: recipe.recipeId,
    phraseMode: recipe.phraseMode ?? defaults.phraseMode,
    disjunctionOperator:
      recipe.disjunctionOperator ?? defaults.disjunctionOperator,
    fallback: {
      enabled: fallback.enabled ?? defaults.fallback.enabled,
      maxTokens: fallback.maxTokens ?? defaults.fallback.maxTokens,
      minTokenLength:
        fallback.minTokenLength ?? defaults.fallback.minTokenLength,
      excludedTokens: new Set(
        (fallback.excludedTokens ?? defaults.fallback.excludedTokens).map(
          (token) => token.toLowerCase(),
        ),
      ),
    },
    priority: (laneKind) =>
      recipe.lanePriorities?.[laneKind] ?? defaults.lanePriorities[laneKind],
  };
};

const disjunction = (
  values: readonly string[],
  recipe: ResolvedSocialQueryStrategyRecipe,
): string | undefined => {
  const terms = compactUnique(values);

  return terms.length === 0
    ? undefined
    : terms
        .map((term) => phrase(term, recipe.phraseMode))
        .join(` ${recipe.disjunctionOperator} `);
};

const phrase = (value: string, mode: SocialQueryPhraseMode): string =>
  mode === 'quote_when_needed' && /\s/.test(value) && !/^".*"$/.test(value)
    ? `"${value}"`
    : value;

const fallbackQueryFor = (
  input: SocialQueryStrategyInput,
  recipe: ResolvedSocialQueryStrategyRecipe,
): string | undefined => {
  const tokens = compactUnique([
    ...tokensFor(input.topic, recipe),
    ...input.products.flatMap((value) => tokensFor(value, recipe)),
    ...input.keywords.flatMap((value) => tokensFor(value, recipe)),
  ]).slice(0, recipe.fallback.maxTokens);

  return tokens.length === 0 ? undefined : tokens.join(' ');
};

const tokensFor = (
  value: string,
  recipe: ResolvedSocialQueryStrategyRecipe,
): readonly string[] =>
  value
    .toLowerCase()
    .replace(/["()]/g, ' ')
    .split(/[^a-z0-9+#.]+/i)
    .map((token) => token.trim())
    .filter(
      (token) =>
        token.length >= recipe.fallback.minTokenLength &&
        !recipe.fallback.excludedTokens.has(token),
    );
