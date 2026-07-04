import { redactSensitiveText } from "@social-monitor/shared-kernel";
import {
  rankSourceItems,
  type SourceItemRankingPlan,
} from "../../../domain";

import type {
  ProviderFailure,
  SourceCapabilityProfile,
  SourceProviderPort,
  SourceProviderScanContext,
  SourceProviderScanPlan,
  SourceProviderScanResult,
  SourceProviderValidationResult,
  SourceQuery,
} from "../../../ports";
import type {
  RedditClientPort,
  RedditListingPage,
} from "./reddit-client.port";
import type { RedditRefreshTokenProviderPort } from "./refresh-token-reddit-token-provider";
import {
  fetchSelectedRedditCandidateComments,
  normalizeRedditPostsWithOptionalComments,
  selectedCommentExpansionForPass,
  withMergedRedditCommentExpansion,
  type RedditScanCandidate,
} from "./reddit-selected-comment-enrichment";
import {
  compactUnique,
  filterPostsByAllowedSubreddits,
  firstNonEmptyString,
  normalizePost,
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
  type RedditScanPass,
} from "./reddit-source-support";
import type { RedditTokenProviderPort } from "./reddit-token-provider.port";
import { readSourceItemRankingPlan } from "../source-item-ranking-config";

const capabilityProfile: SourceCapabilityProfile = {
  providerKey: "reddit",
  displayName: "Reddit",
  version: 1,
  productionSafe: true,
  supportedContentUnits: ["post", "comment", "community", "link"],
  supportedQueryModes: ["search", "listing"],
  cursorModel: "opaque",
  stableIdentity: ["providerId", "canonicalUrl"],
  quotaModel: "per_app",
  limitations: [
    "Uses Reddit OAuth API only. Uses app-only OAuth by default; encrypted tenant bearer or refresh-token credentials can override when needed.",
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
    const accessToken = await this.resolveAccessToken(context);
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
    const commentDepth = readPositiveInteger(
      context.config?.commentDepth,
      2,
      0,
      10,
    );
    const commentSort = readCommentSort(context.config?.commentSort);

    if (scanPasses.length > 0) {
      return this.scanPasses({
        accessToken,
        userAgent,
        plan,
        passes: scanPasses,
        fallbackMinScore: minScore,
        fallbackIncludeComments: includeComments,
        fallbackMaxCommentsPerPost: maxCommentsPerPost,
        fallbackCommentDepth: commentDepth,
        fallbackCommentSort: commentSort,
        rankingPlan,
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
      maxCommentsPerPost,
      commentDepth,
      commentSort,
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

  private async resolveAccessToken(
    context: SourceProviderScanContext,
  ): Promise<string> {
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
        throw new Error(
          "Reddit refresh-token OAuth provider is not configured",
        );
      }

      return this.refreshTokenProvider.getAccessToken({
        clientId: readRequiredString(
          firstNonEmptyString(
            context.config?.clientId,
            context.config?.redditClientId,
          ),
          "clientId",
        ),
        clientSecret: firstNonEmptyString(
          context.config?.clientSecret,
          context.config?.redditClientSecret,
        ),
        refreshToken,
        userAgent: readOptionalString(context.config?.userAgent),
      });
    }

    if (this.tokenProvider === undefined) {
      throw new Error("Reddit app-only OAuth token provider is not configured");
    }

    return this.tokenProvider.getAccessToken();
  }

  private async scanPasses(params: {
    readonly accessToken: string;
    readonly userAgent: string | undefined;
    readonly plan: SourceProviderScanPlan;
    readonly passes: readonly RedditScanPass[];
    readonly fallbackMinScore: number | undefined;
    readonly fallbackIncludeComments: boolean;
    readonly fallbackMaxCommentsPerPost: number | undefined;
    readonly fallbackCommentDepth: number;
    readonly fallbackCommentSort: NonNullable<RedditScanPass["commentSort"]>;
    readonly rankingPlan: SourceItemRankingPlan;
  }): Promise<SourceProviderScanResult> {
    const perPassFallbackLimit = Math.max(
      1,
      Math.ceil(params.plan.maxItems / params.passes.length),
    );
    const candidatesByExternalId = new Map<string, RedditScanCandidate>();
    const warnings: string[] = [];
    let failedPasses = 0;
    let firstFailure: unknown;

    for (const pass of params.passes) {
      const limit = pass.maxItems ?? perPassFallbackLimit;
      let page: RedditListingPage;

      try {
        page =
          pass.mode === "listing"
            ? await this.client.listSubredditPosts({
                accessToken: params.accessToken,
                userAgent: params.userAgent,
                subreddit: pass.subreddit,
                listing: pass.listing,
                ...(pass.listing === "top"
                  ? { topTime: pass.topTime ?? "day" }
                  : {}),
                limit,
              })
            : await this.client.searchPosts({
                accessToken: params.accessToken,
                userAgent: params.userAgent,
                query: pass.query,
                sort: pass.searchSort,
                time: pass.searchTime,
                limit,
              });
      } catch (error) {
        firstFailure ??= error;
        failedPasses += 1;
        warnings.push(formatScanPassWarning(pass, error));
        continue;
      }

      const minScore = pass.minScore ?? params.fallbackMinScore;
      const posts =
        pass.mode === "search"
          ? filterPostsByAllowedSubreddits(page.posts, pass.allowedSubreddits)
          : page.posts;
      const commentExpansion = selectedCommentExpansionForPass({
        pass,
        fallbackIncludeComments: params.fallbackIncludeComments,
        fallbackMaxCommentsPerPost: params.fallbackMaxCommentsPerPost,
        fallbackCommentDepth: params.fallbackCommentDepth,
        fallbackCommentSort: params.fallbackCommentSort,
        minScore,
      });

      for (const post of posts) {
        for (const item of normalizePost(post, minScore)) {
          const existing = candidatesByExternalId.get(item.externalId);

          if (existing === undefined) {
            candidatesByExternalId.set(item.externalId, {
              item,
              post,
              ...(commentExpansion === undefined ? {} : { commentExpansion }),
            });
            continue;
          }

          candidatesByExternalId.set(
            item.externalId,
            withMergedRedditCommentExpansion(existing, commentExpansion),
          );
        }
      }

      warnings.push(...redditWarnings(posts, minScore));
    }

    if (failedPasses === params.passes.length && firstFailure !== undefined) {
      throw firstFailure;
    }

    const rankedItems = rankSourceItems(
      [...candidatesByExternalId.values()].map((candidate) => candidate.item),
      params.rankingPlan,
    ).slice(0, params.plan.maxItems);
    const rankedCandidates = rankedItems.flatMap((item) => {
      const candidate = candidatesByExternalId.get(item.externalId);

      return candidate === undefined ? [] : [candidate];
    });
    const conversationResult = await fetchSelectedRedditCandidateComments({
      client: this.client,
      accessToken: params.accessToken,
      userAgent: params.userAgent,
      candidates: rankedCandidates,
    });

    return {
      items: rankedItems,
      conversationUnits: conversationResult.conversationUnits,
      warnings: compactUnique([...warnings, ...conversationResult.warnings]),
    };
  }

}

const formatScanPassWarning = (
  pass: RedditScanPass,
  error: unknown,
): string => {
  const passLabel =
    pass.mode === "listing"
      ? `${pass.subreddit}:${pass.listing}${pass.listing === "top" ? `:${pass.topTime ?? "day"}` : ""}`
      : `search:${pass.query}`;
  const message =
    error instanceof Error ? error.message : "Unknown Reddit scan pass error";

  return `Reddit scan pass degraded (${passLabel}): ${redactSensitiveText(message)}`;
};

const redditRankingQueries = (
  plan: SourceProviderScanPlan,
  passes: readonly RedditScanPass[],
): readonly string[] =>
  compactUnique([
    plan.query.query,
    ...passes.map((pass) =>
      pass.mode === "search" ? pass.query : `${pass.subreddit} ${pass.listing}`,
    ),
  ]);
