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
import { redditListings } from './http-reddit-client';
import type { RedditClientPort, RedditPost, RedditPostListing } from './reddit-client.port';

const capabilityProfile: SourceCapabilityProfile = {
  providerKey: 'reddit',
  displayName: 'Reddit',
  version: 1,
  productionSafe: true,
  supportedContentUnits: ['post', 'comment', 'community', 'link'],
  supportedQueryModes: ['search', 'listing'],
  cursorModel: 'opaque',
  stableIdentity: ['providerId', 'canonicalUrl'],
  quotaModel: 'per_credential',
  limitations: [
    'Uses Reddit OAuth API only. Requires tenant-provided bearer token in encrypted source binding config.',
  ],
};

export class RedditSourceProvider implements SourceProviderPort {
  constructor(private readonly client: RedditClientPort) {}

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
      const subreddit = readRequiredString(context.config?.subreddit, query.query);
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
    const accessToken = readRequiredString(context.config?.accessToken);
    const userAgent = readOptionalString(context.config?.userAgent);
    const page = plan.query.mode === 'listing'
      ? await this.client.listSubredditPosts({
          accessToken,
          userAgent,
          ...parseListingQuery(plan.query.query),
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
    const normalized = page.posts.flatMap((post) => normalizePost(post));

    return {
      items: normalized,
      nextCursor: page.after,
      warnings: page.posts.some((post) => post.over18 || post.removedByCategory !== undefined)
        ? ['Some Reddit posts were skipped because they were adult or removed.']
        : [],
    };
  }

  classifyError(error: unknown): ProviderFailure {
    const message = error instanceof Error ? error.message : 'Unknown Reddit provider error';
    const lowerMessage = message.toLowerCase();

    if (message.includes('401') || message.includes('403') || lowerMessage.includes('token')) {
      return {
        kind: 'auth_failed',
        retryable: false,
        message,
      };
    }

    if (message.includes('429') || lowerMessage.includes('rate limit')) {
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
}

const normalizePost = (post: RedditPost) => {
  if (post.over18 || post.removedByCategory !== undefined) {
    return [];
  }

  const title = post.title?.trim() ?? '';
  const body = post.selftext?.trim() ?? '';

  if (title.length + body.length === 0) {
    return [];
  }

  return [
    {
      externalId: `reddit:${post.name ?? post.id}`,
      canonicalUrl: canonicalUrl(post),
      title,
      body,
      authorHandle: post.author,
      publishedAt: post.createdUtc === undefined ? new Date(0) : new Date(post.createdUtc * 1000),
    },
  ];
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
    subreddit: readRequiredString(subreddit),
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

const readRequiredString = (value: unknown, fallback?: string): string => {
  const resolved = readOptionalString(value) ?? fallback?.trim();

  if (resolved === undefined || resolved.length === 0) {
    throw new Error('Reddit source config field is required');
  }

  return resolved;
};

const readOptionalString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

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
