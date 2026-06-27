import { status } from '@grpc/grpc-js';
import { grpcStatusCodeOf } from '@social-monitor/platform-grpc';
import { normalizeJsonObject, redactSensitiveText, type JsonObject } from '@social-monitor/shared-kernel';

import type {
  FetchedSourceItem,
  ProviderFailure,
  SourceCapabilityProfile,
  SourceProviderPort,
  SourceProviderScanContext,
  SourceProviderScanPlan,
  SourceProviderScanResult,
  SourceProviderValidationResult,
  SourceQuery,
} from '../../../ports';
import type {
  XDailyCollectedPost,
  XDailyCollectorClientPort,
  XDailyCollectorRequest,
  XDailyCollectorWarning,
  XDailyPostMetrics,
  XDailySearchProduct,
} from './x-daily-collector-client.port';

export const X_TWITTER_PROVIDER_KEY = 'x-twitter';
export const X_TWITTER_EXPERIMENTAL_DAILY_PROVIDER_KEY =
  'x-twitter-experimental-daily';

export const xTwitterCapabilityProfile: SourceCapabilityProfile = {
  providerKey: X_TWITTER_PROVIDER_KEY,
  displayName: 'X/Twitter',
  version: 1,
  productionSafe: true,
  supportedContentUnits: ['post', 'link', 'media'],
  supportedQueryModes: ['search'],
  cursorModel: 'opaque',
  stableIdentity: ['providerId', 'canonicalUrl'],
  quotaModel: 'per_credential',
  limitations: [
    'Connector is backed by the private gRPC x-collector service.',
    'Search results can be reordered by X; scans use rolling windows and source-level dedupe.',
  ],
};

export class XTwitterSourceProvider implements SourceProviderPort {
  constructor(
    private readonly collector: XDailyCollectorClientPort,
    private readonly clock: { now(): Date },
  ) {}

  key(): string {
    return xTwitterCapabilityProfile.providerKey;
  }

  capabilityProfile(): SourceCapabilityProfile {
    return xTwitterCapabilityProfile;
  }

  validateBinding(query: SourceQuery): SourceProviderValidationResult {
    if (query.mode !== 'search') {
      return { ok: false, reason: `Unsupported query mode: ${query.mode}` };
    }

    const normalized = query.query.trim();
    if (normalized.length < 2 || normalized.length > 500) {
      return {
        ok: false,
        reason: 'X/Twitter search query must be 2-500 characters',
      };
    }

    return { ok: true };
  }

  planScan(
    query: SourceQuery,
    context: SourceProviderScanContext,
  ): SourceProviderScanPlan {
    return {
      query,
      maxItems: readPositiveInteger(context.config?.maxItems, 25, 1, 100),
    };
  }

  async scan(
    plan: SourceProviderScanPlan,
    context: SourceProviderScanContext,
  ): Promise<SourceProviderScanResult> {
    const config = parseConfig(plan, context, this.clock.now());
    const result = await this.collector.collectDailySearch({
      requestId: context.scanJobId,
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      sourceBindingId: context.sourceBindingId,
      scanJobId: context.scanJobId,
      correlationId: context.correlationId,
      query: plan.query.query,
      language: config.language,
      windowHours: config.windowHours,
      windowEnd: config.windowEnd,
      searchProducts: config.searchProducts,
      limitPerProduct: config.limitPerProduct,
      maxItems: plan.maxItems,
      minLikes: config.minLikes,
      minRetweets: config.minRetweets,
      minReplies: config.minReplies,
      cursor: plan.cursor,
    } satisfies XDailyCollectorRequest);

    return {
      items: result.posts.map((post) => normalizePost(post, plan.query.query)),
      nextCursor: result.nextCursor,
      warnings: result.warnings.map(formatWarning),
    };
  }

  classifyError(error: unknown): ProviderFailure {
    const code = grpcStatusCodeOf(error);
    const message = redactSensitiveText(
      error instanceof Error ? error.message : 'Unknown X collector error',
    );

    if (code === status.RESOURCE_EXHAUSTED) {
      return {
        kind: 'rate_limited',
        retryable: true,
        message,
        retryAfterMs: readGrpcMetadataPositiveInteger(error, 'retry-after-ms'),
        rateLimitResetAt: readGrpcMetadataDate(error, 'rate-limit-reset-at'),
      };
    }

    if (code === status.UNAUTHENTICATED || code === status.PERMISSION_DENIED) {
      return { kind: 'auth_failed', retryable: false, message };
    }

    if (code === status.INVALID_ARGUMENT) {
      return { kind: 'invalid_query', retryable: false, message };
    }

    if (code === status.DEADLINE_EXCEEDED || code === status.UNAVAILABLE) {
      return { kind: 'unavailable', retryable: true, message };
    }

    return { kind: 'unknown', retryable: true, message };
  }
}

type XExperimentalDailyScanConfig = {
  readonly language?: string;
  readonly windowHours: number;
  readonly windowEnd: Date;
  readonly searchProducts: readonly XDailySearchProduct[];
  readonly limitPerProduct: number;
  readonly minLikes?: number;
  readonly minRetweets?: number;
  readonly minReplies?: number;
};

const parseConfig = (
  plan: SourceProviderScanPlan,
  context: SourceProviderScanContext,
  now: Date,
): XExperimentalDailyScanConfig => ({
  language: readOptionalString(context.config?.language),
  windowHours: readPositiveInteger(context.config?.windowHours, 24, 1, 72),
  windowEnd: readDate(context.config?.windowEnd, now),
  searchProducts: readSearchProducts(context.config?.searchProducts),
  limitPerProduct: readPositiveInteger(
    context.config?.limitPerProduct,
    Math.max(plan.maxItems, 1),
    1,
    100,
  ),
  minLikes: readOptionalPositiveInteger(context.config?.minLikes, 0, 1_000_000),
  minRetweets: readOptionalPositiveInteger(context.config?.minRetweets, 0, 1_000_000),
  minReplies: readOptionalPositiveInteger(context.config?.minReplies, 0, 1_000_000),
});

const normalizePost = (
  post: XDailyCollectedPost,
  searchQuery: string,
): FetchedSourceItem => ({
  externalId: `${X_TWITTER_PROVIDER_KEY}:${post.tweetId}`,
  canonicalUrl: post.canonicalUrl,
  title: titleForPost(post),
  body: post.text,
  authorHandle: post.authorHandle,
  publishedAt: post.publishedAt,
  metadata: normalizeJsonObject({
    kind: 'x_post',
    provider: X_TWITTER_PROVIDER_KEY,
    tweetId: post.tweetId,
    ...(post.authorHandle === undefined ? {} : { authorHandle: post.authorHandle }),
    searchQuery,
    sourceProduct: post.sourceProduct,
    trendScore: post.trendScore,
    likes: post.metrics.likes,
    retweets: post.metrics.retweets,
    replies: post.metrics.replies,
    ...(post.metrics.quotes === undefined ? {} : { quotes: post.metrics.quotes }),
    ...(post.metrics.views === undefined ? {} : { impressions: post.metrics.views }),
    publicMetrics: {
      like_count: post.metrics.likes,
      retweet_count: post.metrics.retweets,
      reply_count: post.metrics.replies,
      ...(post.metrics.quotes === undefined ? {} : { quote_count: post.metrics.quotes }),
      ...(post.metrics.views === undefined ? {} : { impression_count: post.metrics.views }),
    },
    metrics: xPostMetricsMetadata(post.metrics),
    mediaUrls: post.mediaUrls,
  }),
});

export { XTwitterSourceProvider as XTwitterExperimentalDailySourceProvider };

const xPostMetricsMetadata = (metrics: XDailyPostMetrics): JsonObject =>
  normalizeJsonObject({
    likes: metrics.likes,
    retweets: metrics.retweets,
    replies: metrics.replies,
    ...(metrics.quotes === undefined ? {} : { quotes: metrics.quotes }),
    ...(metrics.views === undefined ? {} : { views: metrics.views }),
  });

const titleForPost = (post: XDailyCollectedPost): string => {
  const author = post.authorHandle ?? 'unknown';
  const text = post.text.replace(/\s+/gu, ' ').trim();
  const preview = text.length > 96 ? `${text.slice(0, 93)}...` : text;

  return `X post by @${author}: ${preview}`;
};

const formatWarning = (warning: XDailyCollectorWarning): string =>
  warning.code.trim().length === 0
    ? warning.message
    : `${warning.code}: ${warning.message}`;

const readGrpcMetadataPositiveInteger = (
  error: unknown,
  key: string,
): number | undefined => {
  const value = readGrpcMetadataString(error, key);
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
};

const readGrpcMetadataDate = (error: unknown, key: string): Date | undefined => {
  const value = readGrpcMetadataString(error, key);
  if (value === undefined) {
    return undefined;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const readGrpcMetadataString = (
  error: unknown,
  key: string,
): string | undefined => {
  const metadata = (error as { readonly metadata?: { get(name: string): unknown[] } }).metadata;
  const value = metadata?.get(key)[0];

  if (typeof value === 'string') {
    const trimmed = value.trim();

    return trimmed.length === 0 ? undefined : trimmed;
  }

  if (Buffer.isBuffer(value)) {
    const trimmed = value.toString('utf8').trim();

    return trimmed.length === 0 ? undefined : trimmed;
  }

  return undefined;
};

const readSearchProducts = (
  value: unknown,
): readonly XDailySearchProduct[] => {
  if (!Array.isArray(value)) {
    return ['top'];
  }

  const products = value.flatMap((item): readonly XDailySearchProduct[] => {
    if (item === 'top' || item === 'latest') {
      return [item];
    }

    return [];
  });

  return products.length === 0 ? ['top'] : [...new Set(products)];
};

const readPositiveInteger = (
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number => {
  const parsed = typeof value === 'number' ? value : Number(value);

  if (!Number.isInteger(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, minimum), maximum);
};

const readOptionalPositiveInteger = (
  value: unknown,
  minimum: number,
  maximum: number,
): number | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  return readPositiveInteger(value, minimum, minimum, maximum);
};

const readOptionalString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;

const readDate = (value: unknown, fallback: Date): Date => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fallback;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
};
