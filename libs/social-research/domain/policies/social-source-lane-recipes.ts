import type {
  NormalizedSocialAccountRef,
  SocialSourceKey,
} from '../value-objects/social-search-intent';
import type {
  SocialSearchLaneKind,
  SocialSearchLaneOperation,
  SocialSearchLaneParameter,
} from '../value-objects/social-search-plan';
import { lane } from './social-search-lane-factory';
import type {
  SocialSourceLaneStrategy,
  SocialSourceLaneStrategyContext,
} from './social-source-lane-strategies';

export const socialAccountLaneRecipeSelectors = [
  'same_source_any_account',
  'same_source_include_posts',
  'same_source_include_mentions',
] as const;

export type SocialAccountLaneRecipeSelector =
  (typeof socialAccountLaneRecipeSelectors)[number];

export type SocialAccountLaneStrategyRecipe = {
  readonly recipeKind: 'account_lane_template';
  readonly recipeId: string;
  readonly sourceKey: SocialSourceKey;
  readonly accountSelector: SocialAccountLaneRecipeSelector;
  readonly laneKind: SocialSearchLaneKind;
  readonly operation: SocialSearchLaneOperation;
  readonly queryTemplate: string;
  readonly priority: number;
  readonly reason: string;
  readonly budgetWeight?: number;
  readonly parameters?: Readonly<
    Record<string, Exclude<SocialSearchLaneParameter, undefined>>
  >;
};

export const createAccountLaneStrategyFromRecipes = (params: {
  readonly strategyId: string;
  readonly sourceKey: SocialSourceKey;
  readonly recipes: readonly SocialAccountLaneStrategyRecipe[];
}): SocialSourceLaneStrategy => ({
  strategyId: params.strategyId,
  supports: (sourceKey) => sourceKey === params.sourceKey,
  buildLanes: (context) =>
    params.recipes.flatMap((recipe) =>
      buildAccountRecipeLanes(recipe, context),
    ),
});

const buildAccountRecipeLanes = (
  recipe: SocialAccountLaneStrategyRecipe,
  context: SocialSourceLaneStrategyContext,
) =>
  context.handles
    .filter((handle) => accountMatchesRecipe(handle, recipe, context.sourceKey))
    .map((handle) => {
      const templateValues = {
        handle: handle.handle,
        sourceKey: context.sourceKey,
        topic: context.topic,
      };

      return lane({
        sourceKey: context.sourceKey,
        kind: recipe.laneKind,
        operation: recipe.operation,
        query: renderAccountLaneTemplate(recipe.queryTemplate, templateValues),
        priority: recipe.priority,
        maxItems: context.budget.maxItemsPerLane,
        budgetWeight: recipe.budgetWeight,
        reason: renderAccountLaneTemplate(recipe.reason, templateValues),
        parameters: renderAccountLaneParameters(
          recipe.parameters,
          templateValues,
        ),
      });
    });

const accountMatchesRecipe = (
  handle: NormalizedSocialAccountRef,
  recipe: SocialAccountLaneStrategyRecipe,
  sourceKey: SocialSourceKey,
): boolean => {
  if (handle.sourceKey !== sourceKey || recipe.sourceKey !== sourceKey) {
    return false;
  }

  if (recipe.accountSelector === 'same_source_include_posts') {
    return handle.includePosts;
  }

  if (recipe.accountSelector === 'same_source_include_mentions') {
    return handle.includeMentions;
  }

  return true;
};

const renderAccountLaneParameters = (
  parameters:
    | Readonly<Record<string, Exclude<SocialSearchLaneParameter, undefined>>>
    | undefined,
  values: Readonly<Record<'handle' | 'sourceKey' | 'topic', string>>,
):
  | Readonly<Record<string, Exclude<SocialSearchLaneParameter, undefined>>>
  | undefined => {
  if (parameters === undefined) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(parameters).map(([key, value]) => [
      key,
      renderAccountLaneParameterValue(value, values),
    ]),
  );
};

const renderAccountLaneParameterValue = (
  value: Exclude<SocialSearchLaneParameter, undefined>,
  values: Readonly<Record<'handle' | 'sourceKey' | 'topic', string>>,
): Exclude<SocialSearchLaneParameter, undefined> => {
  if (typeof value === 'string') {
    return renderAccountLaneTemplate(value, values);
  }

  if (Array.isArray(value)) {
    return value.map((item) => renderAccountLaneTemplate(item, values));
  }

  return value;
};

const renderAccountLaneTemplate = (
  template: string,
  values: Readonly<Record<'handle' | 'sourceKey' | 'topic', string>>,
): string =>
  template.replace(
    /\{(handle|sourceKey|topic)\}/g,
    (_match, key: keyof typeof values) => values[key],
  );
