import type { SocialSearchItem } from '../entities/social-search-item';

export const socialItemQualitySignals = [
  'engagement_bait',
  'promo_offer',
  'low_context',
  'weak_topic_match',
] as const;

export type SocialItemQualitySignal =
  (typeof socialItemQualitySignals)[number];

export type SocialItemQualityRecipe = {
  readonly enabled?: boolean;
  readonly minTextCharacters?: number;
  readonly weakMatchRelevanceThreshold?: number;
  readonly penalties?: Partial<Record<SocialItemQualitySignal, number>>;
};

export type SocialItemQualityAssessment = {
  readonly score: number;
  readonly signals: readonly SocialItemQualitySignal[];
};

export const defaultSocialItemQualityRecipe = {
  enabled: true,
  minTextCharacters: 80,
  weakMatchRelevanceThreshold: 20,
  penalties: {
    engagement_bait: 28,
    promo_offer: 35,
    low_context: 10,
    weak_topic_match: 25,
  },
} as const satisfies SocialItemQualityRecipe;

export const assessSocialItemQuality = (params: {
  readonly item: SocialSearchItem;
  readonly relevanceScore: number;
  readonly recipe?: SocialItemQualityRecipe;
}): SocialItemQualityAssessment => {
  const recipe = resolveQualityRecipe(params.recipe);
  if (!recipe.enabled) {
    return { score: 100, signals: [] };
  }

  const text = `${params.item.title} ${params.item.body}`.trim();
  const signals = qualitySignalsFor({
    text,
    relevanceScore: params.relevanceScore,
    minTextCharacters: recipe.minTextCharacters,
    weakMatchRelevanceThreshold: recipe.weakMatchRelevanceThreshold,
  });
  const penalty = signals.reduce(
    (total, signal) => total + recipe.penaltyFor(signal),
    0,
  );

  return {
    score: roundScore(clamp(100 - penalty, 0, 100)),
    signals,
  };
};

type ResolvedSocialItemQualityRecipe = {
  readonly enabled: boolean;
  readonly minTextCharacters: number;
  readonly weakMatchRelevanceThreshold: number;
  readonly penaltyFor: (signal: SocialItemQualitySignal) => number;
};

const resolveQualityRecipe = (
  recipe: SocialItemQualityRecipe = defaultSocialItemQualityRecipe,
): ResolvedSocialItemQualityRecipe => ({
  enabled: recipe.enabled ?? defaultSocialItemQualityRecipe.enabled,
  minTextCharacters: finiteNumber(
    recipe.minTextCharacters,
    defaultSocialItemQualityRecipe.minTextCharacters,
    0,
    1_000,
  ),
  weakMatchRelevanceThreshold: finiteNumber(
    recipe.weakMatchRelevanceThreshold,
    defaultSocialItemQualityRecipe.weakMatchRelevanceThreshold,
    0,
    100,
  ),
  penaltyFor: (signal) =>
    finiteNumber(
      recipe.penalties?.[signal],
      defaultSocialItemQualityRecipe.penalties[signal],
      0,
      100,
    ),
});

const qualitySignalsFor = (params: {
  readonly text: string;
  readonly relevanceScore: number;
  readonly minTextCharacters: number;
  readonly weakMatchRelevanceThreshold: number;
}): readonly SocialItemQualitySignal[] => {
  const signals: SocialItemQualitySignal[] = [];
  const textWithoutUrls = params.text.replace(/https?:\/\/\S+/giu, ' ');
  const normalized = textWithoutUrls.toLowerCase();
  const contentCharacters = textWithoutUrls.replace(/[^a-z0-9]+/giu, '')
    .length;

  if (engagementBaitPattern.test(normalized) || promoPattern.test(normalized)) {
    signals.push('engagement_bait');
  }
  if (promoPattern.test(normalized)) {
    signals.push('promo_offer');
  }
  if (contentCharacters < params.minTextCharacters) {
    signals.push('low_context');
  }
  if (params.relevanceScore <= params.weakMatchRelevanceThreshold) {
    signals.push('weak_topic_match');
  }

  return signals;
};

const engagementBaitPattern =
  /\b(?:like and retweet|like\s*&\s*retweet|retweet if|comment below|reply below|follow me|follow for|what do you think)\b/iu;

const promoPattern =
  /\b(?:airdrop|book a call|buy now|coupon|crypto|discount|giveaway|limited time|memecoin|sponsored|token|trading|webinar)\b/iu;

const finiteNumber = (
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? clamp(value, minimum, maximum)
    : fallback;

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const roundScore = (value: number): number => Math.round(value * 100) / 100;
