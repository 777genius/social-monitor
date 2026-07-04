import type { SocialSourceKey } from '../value-objects/social-search-intent';

export type SocialItemMetrics = {
  readonly likes?: number;
  readonly reposts?: number;
  readonly replies?: number;
  readonly comments?: number;
  readonly quotes?: number;
  readonly views?: number;
  readonly score?: number;
  readonly stars?: number;
  readonly forks?: number;
};

export type SocialSearchItem = {
  readonly itemId: string;
  readonly sourceKey: SocialSourceKey;
  readonly canonicalUrl: string;
  readonly title: string;
  readonly body: string;
  readonly authorHandle?: string;
  readonly publishedAt?: Date;
  readonly metrics?: SocialItemMetrics;
  readonly evidence?: readonly string[];
};

export type RankedSocialSearchItem = {
  readonly item: SocialSearchItem;
  readonly ranking: {
    readonly recipeId: string;
    readonly score: number;
    readonly relevanceScore: number;
    readonly engagementScore: number;
    readonly recencyScore: number;
    readonly qualityScore: number;
    readonly qualitySignals: readonly string[];
    readonly reasons: readonly string[];
  };
};
