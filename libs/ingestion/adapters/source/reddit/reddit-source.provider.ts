import { redactSensitiveText } from '@social-monitor/shared-kernel';

import type {
  ProviderFailure,
  SourceCapabilityProfile,
  SourceProviderPort,
  SourceProviderScanContext,
  SourceProviderScanPlan,
  SourceProviderScanResult,
  SourceProviderValidationResult,
  SourceQuery,
} from '../../../ports';
import { redditListings, redditTopTimes } from './http-reddit-client';
import type { RedditClientPort, RedditPost, RedditPostListing, RedditTopTime } from './reddit-client.port';
import type { RedditRefreshTokenProviderPort } from './refresh-token-reddit-token-provider';
import type { RedditTokenProviderPort } from './reddit-token-provider.port';

const capabilityProfile: SourceCapabilityProfile = {
  providerKey: 'reddit',
  displayName: 'Reddit',
  version: 1,
  productionSafe: true,
  supportedContentUnits: ['post', 'comment', 'community', 'link'],
  supportedQueryModes: ['search', 'listing'],
  cursorModel: 'opaque',
  stableIdentity: ['providerId', 'canonicalUrl'],
  quotaModel: 'per_app',
  limitations: [
    'Uses Reddit OAuth API only. Uses app-only OAuth by default; encrypted tenant bearer or refresh-token credentials can override when needed.',
  ],
};

export class RedditSourceProvider implements SourceProviderPort {
  constructor(
    private readonly client: RedditClientPort,
    private readonly tokenProvider?: RedditTokenProviderPort,
    private readonly refreshTokenProvider?: RedditRefreshTokenProviderPort,
  ) {}

  key(): string {
    return capabilityProfile.providerKey;
  }

  capabilityProfile(): SourceCapabilityProfile {
    return capabilityProfile;
  }

  validateBinding(query: SourceQuery): SourceProviderValidationResult {
    if (!capabilityProfile.supportedQueryModes.includes(query.mode)) {
      return { ok: false, reason: `Unsupported query mode: ${query.mode}` };
    }

    if (query.query.trim().length === 0) {
      return { ok: false, reason: 'Query must be non-empty' };
    }

    return { ok: true };
  }

  planScan(query: SourceQuery, context: SourceProviderScanContext): SourceProviderScanPlan {
    const maxItems = readPositiveInteger(context.config?.maxItems, 25, 1, 100);

    if (query.mode === 'listing') {
      const subreddit = readRequiredString(context.config?.subreddit, 'subreddit', query.query);
      const listing = readListing(context.config?.listing);

      return {
        query: {
          mode: 'listing',
          query: `${subreddit}:${listing}`,
        },
        maxItems,
      };
    }

    return {
      query,
      maxItems,
    };
  }

  async scan(
    plan: SourceProviderScanPlan,
    context: SourceProviderScanContext,
  ): Promise<SourceProviderScanResult> {
    const accessToken = await this.resolveAccessToken(context);
    const userAgent = readOptionalString(context.config?.userAgent);
    const minScore = readOptionalNonNegativeInteger(context.config?.minScore, 1_000_000);
    const listingQuery = plan.query.mode === 'listing'
      ? parseListingQuery(plan.query.query)
      : undefined;
    const page = listingQuery !== undefined
      ? await this.client.listSubredditPosts({
          accessToken,
          userAgent,
          ...listingQuery,
          ...(listingQuery.listing === 'top' ? { topTime: readTopTime(context.config?.topTime) } : {}),
          limit: plan.maxItems,
          after: plan.cursor,
        })
      : await this.client.searchPosts({
          accessToken,
          userAgent,
          query: plan.query.query,
          limit: plan.maxItems,
          after: plan.cursor,
        });
    const normalized = page.posts.flatMap((post) => normalizePost(post, minScore));

    return {
      items: normalized,
      nextCursor: page.after,
      warnings: redditWarnings(page.posts, minScore),
    };
  }

  classifyError(error: unknown): ProviderFailure {
    const rawMessage = error instanceof Error ? error.message : 'Unknown Reddit provider error';
    const lowerMessage = rawMessage.toLowerCase();
    const message = redactSensitiveText(rawMessage);

    if (
      rawMessage.includes('401')
      || rawMessage.includes('403')
      || lowerMessage.includes('token')
      || lowerMessage.includes('oauth')
      || lowerMessage.includes('credential')
    ) {
      return {
        kind: 'auth_failed',
        retryable: false,
        message,
      };
    }

    if (rawMessage.includes('429') || lowerMessage.includes('rate limit')) {
      return {
        kind: 'rate_limited',
        retryable: true,
        message,
      };
    }

    return {
      kind: 'unavailable',
      retryable: true,
      message,
    };
  }

  private async resolveAccessToken(context: SourceProviderScanContext): Promise<string> {
    const configuredAccessToken = firstNonEmptyString(
      context.config?.accessToken,
      context.config?.apiToken,
      context.config?.bearerToken,
    );

    if (configuredAccessToken !== undefined) {
      return configuredAccessToken;
    }

    const refreshToken = firstNonEmptyString(
      context.config?.refreshToken,
      context.config?.redditRefreshToken,
    );
    if (refreshToken !== undefined) {
      if (this.refreshTokenProvider === undefined) {
        throw new Error('Reddit refresh-token OAuth provider is not configured');
      }

      return this.refreshTokenProvider.getAccessToken({
        clientId: readRequiredString(
          firstNonEmptyString(context.config?.clientId, context.config?.redditClientId),
          'clientId',
        ),
        clientSecret: firstNonEmptyString(context.config?.clientSecret, context.config?.redditClientSecret),
        refreshToken,
        userAgent: readOptionalString(context.config?.userAgent),
      });
    }

    if (this.tokenProvider === undefined) {
      throw new Error('Reddit app-only OAuth token provider is not configured');
    }

    return this.tokenProvider.getAccessToken();
  }
}

const normalizePost = (post: RedditPost, minScore: number | undefined) => {
  if (post.over18 || post.removedByCategory !== undefined) {
    return [];
  }

  if (minScore !== undefined && post.score !== undefined && post.score < minScore) {
    return [];
  }

  const title = post.title?.trim() ?? '';
  const body = post.selftext?.trim() ?? '';

  if (title.length + body.length === 0) {
    return [];
  }

  const publishedAt = publishedAtForPost(post);

  if (publishedAt === undefined) {
    return [];
  }

  return [
    {
      externalId: `reddit:${post.name ?? post.id}`,
      canonicalUrl: canonicalUrl(post),
      title,
      body,
      authorHandle: post.author,
      publishedAt,
      metadata: redditPostMetadata(post),
    },
  ];
};

const redditWarnings = (
  posts: readonly RedditPost[],
  minScore: number | undefined,
): readonly string[] => [
  ...(
    posts.some((post) => post.over18 || post.removedByCategory !== undefined)
      ? ['Some Reddit posts were skipped because they were adult or removed.']
      : []
  ),
  ...(
    posts.some((post) => isTimestampMissingCandidate(post, minScore))
      ? ['Some Reddit posts had no valid created_utc timestamp; they were skipped.']
      : []
  ),
];

const isTimestampMissingCandidate = (
  post: RedditPost,
  minScore: number | undefined,
): boolean => {
  if (post.over18 || post.removedByCategory !== undefined) {
    return false;
  }

  if (minScore !== undefined && post.score !== undefined && post.score < minScore) {
    return false;
  }

  const title = post.title?.trim() ?? '';
  const body = post.selftext?.trim() ?? '';

  return title.length + body.length > 0 && publishedAtForPost(post) === undefined;
};

const publishedAtForPost = (post: RedditPost): Date | undefined => {
  if (post.createdUtc === undefined || !Number.isFinite(post.createdUtc) || post.createdUtc <= 0) {
    return undefined;
  }

  const publishedAt = new Date(post.createdUtc * 1000);

  return Number.isNaN(publishedAt.getTime()) ? undefined : publishedAt;
};

const canonicalUrl = (post: RedditPost): string => {
  if (post.permalink !== undefined) {
    return new URL(post.permalink, 'https://www.reddit.com').toString();
  }

  return post.url ?? `https://www.reddit.com/comments/${post.id}`;
};

const parseListingQuery = (
  value: string,
): { readonly subreddit: string; readonly listing: RedditPostListing } => {
  const [subreddit, listing] = value.split(':');

  return {
    subreddit: readRequiredString(subreddit, 'subreddit'),
    listing: readListing(listing),
  };
};

const readListing = (value: unknown): RedditPostListing => {
  const listing = readOptionalString(value) ?? 'hot';

  if (!redditListings.includes(listing as RedditPostListing)) {
    throw new Error(`Unsupported Reddit listing: ${listing}`);
  }

  return listing as RedditPostListing;
};

const readTopTime = (value: unknown): RedditTopTime => {
  const topTime = readOptionalString(value) ?? 'week';

  if (!redditTopTimes.includes(topTime as RedditTopTime)) {
    throw new Error(`Unsupported Reddit topTime: ${topTime}`);
  }

  return topTime as RedditTopTime;
};

const redditPostMetadata = (post: RedditPost) => ({
  ...(post.subreddit === undefined ? {} : { subreddit: post.subreddit }),
  ...(linkedUrl(post) === undefined ? {} : { linkedUrl: linkedUrl(post) }),
  ...(post.score === undefined ? {} : { score: post.score }),
  ...(post.numComments === undefined ? {} : { numComments: post.numComments }),
  ...(post.upvoteRatio === undefined ? {} : { upvoteRatio: post.upvoteRatio }),
});

const linkedUrl = (post: RedditPost): string | undefined => {
  if (post.url === undefined) {
    return undefined;
  }

  const discussionUrl = canonicalUrl(post);

  return post.url === discussionUrl ? undefined : post.url;
};

const readRequiredString = (value: unknown, field: string, fallback?: string): string => {
  const resolved = readOptionalString(value) ?? fallback?.trim();

  if (resolved === undefined || resolved.length === 0) {
    throw new Error(`Reddit source config field is required: ${field}`);
  }

  return resolved;
};

const readOptionalString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

const firstNonEmptyString = (...values: readonly unknown[]): string | undefined =>
  values.map(readOptionalString).find((value) => value !== undefined);

const readPositiveInteger = (
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number => {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`Reddit source config integer must be between ${min} and ${max}`);
  }

  return value;
};

const readOptionalNonNegativeInteger = (value: unknown, max: number): number | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > max) {
    throw new Error(`Reddit source config integer must be between 0 and ${max}`);
  }

  return value;
};
