import { redactSensitiveText } from '@social-monitor/shared-kernel';
import { rankSourceItems } from '../../../domain';
import type {
  ProviderFailure,
  SourceProviderPort,
  SourceProviderScanContext,
  SourceProviderScanPlan,
  SourceProviderScanResult,
  SourceProviderValidationResult,
  SourceQuery,
} from '../../../ports';
import { redditCapabilityProfile } from './reddit-capability-profile';
import type { RedditClientPort } from './reddit-client.port';
import type { RedditRefreshTokenProviderPort } from './refresh-token-reddit-token-provider';
import { resolveRedditAccessToken } from './reddit-access-token';
import { normalizeRedditPostsWithOptionalComments } from './reddit-selected-comment-enrichment';
import {
  compactUnique,
  parseListingQuery,
  readCommentSort,
  readListing,
  readOptionalNonNegativeInteger,
  readOptionalPositiveInteger,
  readOptionalSearchSort,
  readOptionalSearchTime,
  readOptionalString,
  readPositiveInteger,
  readRequiredString,
  readScanPasses,
  readTopTime,
  redditWarnings,
} from './reddit-source-support';
import { redditRankingQueries, sourceQueryLaneForPlan } from './reddit-source-window-and-lanes';
import type { RedditTokenProviderPort } from './reddit-token-provider.port';
import { readSourceItemRankingPlan } from '../source-item-ranking-config';
import { collectRedditScanPasses } from './reddit-multi-pass-collector';

export class RedditSourceProvider implements SourceProviderPort {
  constructor(
    private readonly client: RedditClientPort,
    private readonly tokenProvider?: RedditTokenProviderPort,
    private readonly refreshTokenProvider?: RedditRefreshTokenProviderPort,
  ) {}

  key(): string {
    return redditCapabilityProfile.providerKey;
  }

  capabilityProfile() {
    return redditCapabilityProfile;
  }

  validateBinding(query: SourceQuery): SourceProviderValidationResult {
    if (!redditCapabilityProfile.supportedQueryModes.includes(query.mode)) {
      return { ok: false, reason: `Unsupported query mode: ${query.mode}` };
    }

    if (query.query.trim().length === 0) {
      return { ok: false, reason: "Query must be non-empty" };
    }

    return { ok: true };
  }

  planScan(
    query: SourceQuery,
    context: SourceProviderScanContext,
  ): SourceProviderScanPlan {
    const maxItems = readPositiveInteger(context.config?.maxItems, 25, 1, 100);

    if (query.mode === "listing") {
      const subreddit = readRequiredString(
        context.config?.subreddit,
        "subreddit",
        query.query,
      );
      const listing = readListing(context.config?.listing);

      return {
        query: {
          mode: "listing",
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
    const accessToken = await resolveRedditAccessToken({
      context,
      tokenProvider: this.tokenProvider,
      refreshTokenProvider: this.refreshTokenProvider,
    });
    const userAgent = readOptionalString(context.config?.userAgent);
    const minScore = readOptionalNonNegativeInteger(
      context.config?.minScore,
      1_000_000,
    );
    const scanPasses = readScanPasses(context.config);
    const includeComments = context.config?.includeComments === true;
    const rankingPlan = readSourceItemRankingPlan(
      context.config,
      redditRankingQueries(plan, scanPasses),
    );
    const maxCommentsPerPost = readOptionalPositiveInteger(
      context.config?.maxCommentsPerPost,
      100,
    );
    const maxCommentedPosts = readOptionalPositiveInteger(
      context.config?.maxCommentedPosts,
      100,
    );
    const commentDepth = readPositiveInteger(
      context.config?.commentDepth,
      2,
      0,
      10,
    );
    const commentSort = readCommentSort(context.config?.commentSort);

    if (scanPasses.length > 0) {
      return collectRedditScanPasses(this.client, {
        accessToken,
        userAgent,
        plan,
        passes: scanPasses,
        fallbackMinScore: minScore,
        fallbackIncludeComments: includeComments,
        maxCommentedPosts,
        fallbackMaxCommentsPerPost: maxCommentsPerPost,
        fallbackCommentDepth: commentDepth,
        fallbackCommentSort: commentSort,
        rankingPlan,
        config: context.config,
      });
    }

    const listingQuery =
      plan.query.mode === "listing"
        ? parseListingQuery(plan.query.query)
        : undefined;
    const page =
      listingQuery !== undefined
        ? await this.client.listSubredditPosts({
            accessToken,
            userAgent,
            ...listingQuery,
            ...(listingQuery.listing === "top"
              ? { topTime: readTopTime(context.config?.topTime) }
              : {}),
            limit: plan.maxItems,
            after: plan.cursor,
          })
        : await this.client.searchPosts({
            accessToken,
            userAgent,
            query: plan.query.query,
            sort: readOptionalSearchSort(context.config?.searchSort),
            time: readOptionalSearchTime(context.config?.searchTime),
            limit: plan.maxItems,
            after: plan.cursor,
          });
    const normalized = await normalizeRedditPostsWithOptionalComments({
      client: this.client,
      accessToken,
      userAgent,
      posts: page.posts,
      minScore,
      includeComments,
      maxCommentedPosts,
      maxCommentsPerPost,
      commentDepth,
      commentSort,
      sourceQueryLane: sourceQueryLaneForPlan(plan),
    });

    return {
      items: rankSourceItems(normalized.items, rankingPlan),
      conversationUnits: normalized.conversationUnits,
      nextCursor: page.after,
      warnings: compactUnique([
        ...redditWarnings(page.posts, minScore),
        ...normalized.warnings,
      ]),
    };
  }

  classifyError(error: unknown): ProviderFailure {
    const rawMessage =
      error instanceof Error ? error.message : "Unknown Reddit provider error";
    const lowerMessage = rawMessage.toLowerCase();
    const message = redactSensitiveText(rawMessage);

    if (
      lowerMessage.includes("rankingmode") ||
      lowerMessage.includes("ranking mode") ||
      lowerMessage.includes("source config") ||
      lowerMessage.includes("unsupported reddit")
    ) {
      return {
        kind: "invalid_query",
        retryable: false,
        message,
      };
    }

    if (
      rawMessage.includes("401") ||
      rawMessage.includes("403") ||
      lowerMessage.includes("token") ||
      lowerMessage.includes("oauth") ||
      lowerMessage.includes("credential")
    ) {
      return {
        kind: "auth_failed",
        retryable: false,
        message,
      };
    }

    if (rawMessage.includes("429") || lowerMessage.includes("rate limit")) {
      return {
        kind: "rate_limited",
        retryable: true,
        message,
      };
    }

    return {
      kind: "unavailable",
      retryable: true,
      message,
    };
  }

}
