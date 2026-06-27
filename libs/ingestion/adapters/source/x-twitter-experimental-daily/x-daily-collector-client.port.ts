import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type XDailySearchProduct = 'top' | 'latest';

export type XDailyCollectorRequest = {
  readonly requestId: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly sourceBindingId: string;
  readonly scanJobId: string;
  readonly correlationId: string;
  readonly query: string;
  readonly language?: string;
  readonly windowHours: number;
  readonly windowEnd: Date;
  readonly searchProducts: readonly XDailySearchProduct[];
  readonly limitPerProduct: number;
  readonly maxItems: number;
  readonly minLikes?: number;
  readonly minRetweets?: number;
  readonly minReplies?: number;
  readonly cursor?: string;
};

export type XDailyCollectorResult = {
  readonly posts: readonly XDailyCollectedPost[];
  readonly nextCursor?: string;
  readonly warnings: readonly XDailyCollectorWarning[];
  readonly run?: XDailyCollectorRun;
};

export type XDailyCollectedPost = {
  readonly tweetId: string;
  readonly canonicalUrl: string;
  readonly text: string;
  readonly authorHandle?: string;
  readonly authorName?: string;
  readonly publishedAt: Date;
  readonly metrics: XDailyPostMetrics;
  readonly mediaUrls: readonly string[];
  readonly sourceProduct: XDailySearchProduct;
  readonly trendScore: number;
};

export type XDailyPostMetrics = {
  readonly likes: number;
  readonly retweets: number;
  readonly replies: number;
  readonly quotes?: number;
  readonly views?: number;
};

export type XDailyCollectorWarning = {
  readonly code: string;
  readonly message: string;
};

export type XDailyCollectorRun = {
  readonly collectorEngine: string;
  readonly collectorVersion: string;
  readonly startedAt?: Date;
  readonly completedAt?: Date;
  readonly requestedLimit: number;
  readonly fetchedCount: number;
  readonly returnedCount: number;
  readonly partial: boolean;
};

export interface XDailyCollectorClientPort {
  collectDailySearch(
    request: XDailyCollectorRequest,
  ): Promise<XDailyCollectorResult>;
}
