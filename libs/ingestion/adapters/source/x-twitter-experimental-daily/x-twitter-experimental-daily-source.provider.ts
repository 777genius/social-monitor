import { status } from '@grpc/grpc-js';
import { grpcStatusCodeOf } from '@social-monitor/platform-grpc';
import { redactSensitiveText, type JsonObject } from '@social-monitor/shared-kernel';

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
  XDailySearchProduct,
} from './x-daily-collector-client.port';

export const X_TWITTER_EXPERIMENTAL_DAILY_PROVIDER_KEY = 'x-twitter-experimental-daily';

const capabilityProfile: SourceCapabilityProfile = {
  providerKey: X_TWITTER_EXPERIMENTAL_DAILY_PROVIDER_KEY,
  displayName: 'X/Twitter Experimental Daily',
  version: 1,
  productionSafe: false,
  supportedContentUnits: ['post', 'link', 'media'],
  supportedQueryModes: ['search'],
  cursorModel: 'opaque',
  stableIdentity: ['providerId', 'canonicalUrl'],
  quotaModel: 'per_credential',
  limitations: [
    'Experimental connector backed by a private gRPC x-collector service and Scweet.',
    'Not production-safe and not a replacement for approved X API or vendor access.',
    'Search results can be reordered by X; scans use rolling windows and source-level dedupe.',
  ],
};

export class XTwitterExperimentalDailySourceProvider implements SourceProviderPort {
  constructor(
    private readonly collector: XDailyCollectorClientPort,
    private readonly clock: { now(): Date },
  ) {}

  key(): string {
    return capabilityProfile.providerKey;
  }

  capabilityProfile(): SourceCapabilityProfile {
    return capabilityProfile;
  }

  validateBinding(query: SourceQuery): SourceProviderValidationResult {
    if (query.mode !== 'search') {
      return { ok: false, reason: `Unsupported query mode: ${query.mode}` };
    }

    const normalized = query.query.trim();
    if (normalized.length < 2 || normalized.length > 500) {
      return {
        ok: false,
        reason: 'X experimental daily search query must be 2-500 characters',
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
      items: result.posts.map(normalizePost),
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
      return { kind: 'rate_limited', retryable: true, message };
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

const normalizePost = (post: XDailyCollectedPost): FetchedSourceItem => ({
  externalId: `x-twitter-experimental-daily:${post.tweetId}`,
  canonicalUrl: post.canonicalUrl,
  title: titleForPost(post),
  body: post.text,
  authorHandle: post.authorHandle,
  publishedAt: post.publishedAt,
  metadata: {
    provider: X_TWITTER_EXPERIMENTAL_DAILY_PROVIDER_KEY,
    tweetId: post.tweetId,
    sourceProduct: post.sourceProduct,
    trendScore: post.trendScore,
    metrics: post.metrics,
    mediaUrls: post.mediaUrls,
  } satisfies JsonObject,
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
