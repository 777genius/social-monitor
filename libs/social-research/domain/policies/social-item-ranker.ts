import type {
  RankedSocialSearchItem,
  SocialItemMetrics,
  SocialSearchItem,
} from '../entities/social-search-item';
import type {
  SocialSearchGoal,
  SocialSearchIntent,
} from '../value-objects/social-search-intent';
import {
  assessSocialItemQuality,
  defaultSocialItemQualityRecipe,
  type SocialItemQualityRecipe,
} from './social-item-quality-policy';

export type RankSocialItemsInput = {
  readonly intent: SocialSearchIntent;
  readonly items: readonly SocialSearchItem[];
  readonly rankingRecipe?: SocialRankingRecipe;
  readonly now?: Date;
  readonly limit?: number;
};

export const socialRankingRecipeKinds = ['social_ranking_recipe_v1'] as const;

export type SocialRankingRecipeKind =
  (typeof socialRankingRecipeKinds)[number];

export type SocialRankingScoreWeights = {
  readonly relevance: number;
  readonly engagement: number;
  readonly recency: number;
};

export type SocialRankingRecipe = {
  readonly recipeKind: SocialRankingRecipeKind;
  readonly recipeId: string;
  readonly weightsByGoal?: Partial<
    Record<SocialSearchGoal, Partial<SocialRankingScoreWeights>>
  >;
  readonly engagement?: {
    readonly maxScore?: number;
    readonly logMultiplier?: number;
  };
  readonly relevance?: {
    readonly matchedTermWeight?: number;
    readonly titleMatchBonus?: number;
    readonly maxScore?: number;
  };
  readonly quality?: SocialItemQualityRecipe;
};

const defaultGoalWeights: Record<SocialSearchGoal, SocialRankingScoreWeights> = {
  research: { relevance: 0.7, engagement: 0.2, recency: 0.1 },
  trend: { relevance: 0.35, engagement: 0.5, recency: 0.15 },
  support: { relevance: 0.65, engagement: 0.15, recency: 0.2 },
  competitor: { relevance: 0.6, engagement: 0.25, recency: 0.15 },
  security: { relevance: 0.75, engagement: 0.1, recency: 0.15 },
};

export const defaultSocialRankingRecipe = {
  recipeKind: 'social_ranking_recipe_v1',
  recipeId: 'default-relevance-first-social-ranking-v1',
  weightsByGoal: defaultGoalWeights,
  engagement: {
    maxScore: 100,
    logMultiplier: 22,
  },
  relevance: {
    matchedTermWeight: 80,
    titleMatchBonus: 8,
    maxScore: 100,
  },
  quality: defaultSocialItemQualityRecipe,
} as const satisfies SocialRankingRecipe;

export const rankSocialItems = (
  input: RankSocialItemsInput,
): readonly RankedSocialSearchItem[] => {
  const goal = input.intent.goal ?? 'research';
  const recipe = resolveRankingRecipe(input.rankingRecipe);
  const weights = recipe.weightsFor(goal);
  const terms = rankingTerms(input.intent);
  const ranked = input.items.map((item) => {
    const relevanceScore = scoreRelevance(item, terms, recipe);
    const engagementScore = scoreEngagement(item.metrics, recipe);
    const recencyScore = scoreRecency(item.publishedAt, input.now);
    const quality = assessSocialItemQuality({
      item,
      relevanceScore,
      recipe: recipe.quality,
    });
    const baseScore =
      relevanceScore * weights.relevance +
      engagementScore * weights.engagement +
      recencyScore * weights.recency;
    const score = baseScore * (quality.score / 100);

    return {
      item,
      ranking: {
        recipeId: recipe.recipeId,
        score: roundScore(score),
        relevanceScore: roundScore(relevanceScore),
        engagementScore: roundScore(engagementScore),
        recencyScore: roundScore(recencyScore),
        qualityScore: roundScore(quality.score),
        qualitySignals: quality.signals,
        reasons: rankingReasons({
          relevanceScore,
          engagementScore,
          recencyScore,
          qualitySignals: quality.signals,
          goal,
        }),
      },
    };
  });

  return ranked
    .sort((left, right) => {
      const scoreDiff = right.ranking.score - left.ranking.score;
      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      return right.item.itemId.localeCompare(left.item.itemId);
    })
    .slice(0, input.limit);
};

type ResolvedSocialRankingRecipe = {
  readonly recipeId: string;
  readonly engagement: {
    readonly maxScore: number;
    readonly logMultiplier: number;
  };
  readonly relevance: {
    readonly matchedTermWeight: number;
    readonly titleMatchBonus: number;
    readonly maxScore: number;
  };
  readonly quality: SocialItemQualityRecipe | undefined;
  readonly weightsFor: (goal: SocialSearchGoal) => SocialRankingScoreWeights;
};

const resolveRankingRecipe = (
  recipe: SocialRankingRecipe = defaultSocialRankingRecipe,
): ResolvedSocialRankingRecipe => ({
  recipeId: recipe.recipeId,
  engagement: {
    maxScore: finiteNumber(
      recipe.engagement?.maxScore,
      defaultSocialRankingRecipe.engagement.maxScore,
      0,
      100,
    ),
    logMultiplier: finiteNumber(
      recipe.engagement?.logMultiplier,
      defaultSocialRankingRecipe.engagement.logMultiplier,
      1,
      100,
    ),
  },
  relevance: {
    matchedTermWeight: finiteNumber(
      recipe.relevance?.matchedTermWeight,
      defaultSocialRankingRecipe.relevance.matchedTermWeight,
      0,
      100,
    ),
    titleMatchBonus: finiteNumber(
      recipe.relevance?.titleMatchBonus,
      defaultSocialRankingRecipe.relevance.titleMatchBonus,
      0,
      100,
    ),
    maxScore: finiteNumber(
      recipe.relevance?.maxScore,
      defaultSocialRankingRecipe.relevance.maxScore,
      0,
      100,
    ),
  },
  quality: recipe.quality ?? defaultSocialRankingRecipe.quality,
  weightsFor: (goal) =>
    normalizeWeights(
      {
        ...defaultGoalWeights[goal],
        ...(recipe.weightsByGoal?.[goal] ?? {}),
      },
      defaultGoalWeights[goal],
    ),
});

const rankingTerms = (intent: SocialSearchIntent): readonly string[] => {
  const products = intent.entities?.products ?? [];
  const keywords = intent.entities?.keywords ?? [];

  return compactUnique([
    ...termsFromText(intent.topic),
    ...products.flatMap(termsFromText),
    ...keywords.flatMap(termsFromText),
  ]);
};

const scoreRelevance = (
  item: SocialSearchItem,
  terms: readonly string[],
  recipe: ResolvedSocialRankingRecipe,
): number => {
  if (terms.length === 0) {
    return 0;
  }

  const haystack = `${item.title} ${item.body}`.toLowerCase();
  const matched = terms.filter((term) => haystack.includes(term));
  const titleMatches = terms.filter((term) =>
    item.title.toLowerCase().includes(term),
  );

  return Math.min(
    recipe.relevance.maxScore,
    (matched.length / terms.length) * recipe.relevance.matchedTermWeight +
      titleMatches.length * recipe.relevance.titleMatchBonus,
  );
};

const scoreEngagement = (
  metrics: SocialItemMetrics | undefined,
  recipe: ResolvedSocialRankingRecipe,
): number => {
  if (metrics === undefined) {
    return 0;
  }

  const weighted =
    safeMetric(metrics.likes) +
    safeMetric(metrics.score) +
    safeMetric(metrics.stars) * 2 +
    safeMetric(metrics.reposts) * 3 +
    safeMetric(metrics.forks) * 3 +
    safeMetric(metrics.replies) * 2 +
    safeMetric(metrics.comments) * 2 +
    safeMetric(metrics.quotes) * 3 +
    safeMetric(metrics.views) * 0.01;

  return Math.min(
    recipe.engagement.maxScore,
    Math.log10(weighted + 1) * recipe.engagement.logMultiplier,
  );
};

const scoreRecency = (
  publishedAt: Date | undefined,
  now: Date | undefined,
): number => {
  if (publishedAt === undefined || now === undefined) {
    return 0;
  }

  const ageHours = Math.max(
    0,
    (now.getTime() - publishedAt.getTime()) / (1000 * 60 * 60),
  );

  if (ageHours <= 24) {
    return 100;
  }
  if (ageHours <= 24 * 7) {
    return 70;
  }
  if (ageHours <= 24 * 30) {
    return 40;
  }

  return 10;
};

const rankingReasons = (params: {
  readonly relevanceScore: number;
  readonly engagementScore: number;
  readonly recencyScore: number;
  readonly qualitySignals: readonly string[];
  readonly goal: SocialSearchGoal;
}): readonly string[] => {
  const reasons = [`goal:${params.goal}`];

  if (params.relevanceScore >= 60) {
    reasons.push('strong_topic_match');
  }
  if (params.engagementScore >= 45) {
    reasons.push('engagement_signal');
  }
  if (params.recencyScore >= 70) {
    reasons.push('fresh_item');
  }
  if (params.qualitySignals.length === 0) {
    reasons.push('quality_pass');
  } else {
    reasons.push(
      ...params.qualitySignals.map((signal) => `quality_${signal}`),
    );
  }

  return reasons;
};

const termsFromText = (value: string): readonly string[] =>
  value
    .toLowerCase()
    .replace(/["()]/g, ' ')
    .split(/[^a-z0-9+#.]+/i)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3 && term !== 'the');

const compactUnique = (values: readonly string[]): readonly string[] => [
  ...new Set(values),
];

const safeMetric = (value: number | undefined): number =>
  value === undefined || value < 0 ? 0 : value;

const roundScore = (value: number): number => Math.round(value * 100) / 100;

const finiteNumber = (
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;

const normalizeWeights = (
  weights: Partial<SocialRankingScoreWeights>,
  fallback: SocialRankingScoreWeights,
): SocialRankingScoreWeights => {
  const relevance = nonNegativeWeight(weights.relevance);
  const engagement = nonNegativeWeight(weights.engagement);
  const recency = nonNegativeWeight(weights.recency);
  const total = relevance + engagement + recency;

  if (total <= 0) {
    return fallback;
  }

  return {
    relevance: relevance / total,
    engagement: engagement / total,
    recency: recency / total,
  };
};

const nonNegativeWeight = (value: number | undefined): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
