import { redactSensitiveText } from '@social-monitor/shared-kernel';

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
import type { RedditClientPort } from './reddit-client.port';
import type { RedditRefreshTokenProviderPort } from './refresh-token-reddit-token-provider';
import {
  compactUnique,
  firstNonEmptyString,
  normalizePost,
  parseListingQuery,
  readListing,
  readOptionalNonNegativeInteger,
  readOptionalString,
  readPositiveInteger,
  readRequiredString,
  readScanPasses,
  readTopTime,
  redditWarnings,
  sortRedditItemsByEngagement,
  type RedditScanPass,
} from './reddit-source-support';
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
    const scanPasses = readScanPasses(context.config);

    if (scanPasses.length > 0) {
      return this.scanPasses({
        accessToken,
        userAgent,
        plan,
        passes: scanPasses,
        fallbackMinScore: minScore,
      });
    }

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

  private async scanPasses(params: {
    readonly accessToken: string;
    readonly userAgent: string | undefined;
    readonly plan: SourceProviderScanPlan;
    readonly passes: readonly RedditScanPass[];
    readonly fallbackMinScore: number | undefined;
  }): Promise<SourceProviderScanResult> {
    const perPassFallbackLimit = Math.max(
      1,
      Math.ceil(params.plan.maxItems / params.passes.length),
    );
    const itemsByExternalId = new Map<string, FetchedSourceItem>();
    const warnings: string[] = [];

    for (const pass of params.passes) {
      const limit = pass.maxItems ?? perPassFallbackLimit;
      const page = pass.mode === 'listing'
        ? await this.client.listSubredditPosts({
            accessToken: params.accessToken,
            userAgent: params.userAgent,
            subreddit: pass.subreddit,
            listing: pass.listing,
            ...(pass.listing === 'top' ? { topTime: pass.topTime ?? 'day' } : {}),
            limit,
          })
        : await this.client.searchPosts({
            accessToken: params.accessToken,
            userAgent: params.userAgent,
            query: pass.query,
            limit,
          });
      const minScore = pass.minScore ?? params.fallbackMinScore;

      for (const item of page.posts.flatMap((post) => normalizePost(post, minScore))) {
        if (!itemsByExternalId.has(item.externalId)) {
          itemsByExternalId.set(item.externalId, item);
        }
      }

      warnings.push(...redditWarnings(page.posts, minScore));
    }

    return {
      items: sortRedditItemsByEngagement([...itemsByExternalId.values()]).slice(
        0,
        params.plan.maxItems,
      ),
      warnings: compactUnique(warnings),
    };
  }
}
