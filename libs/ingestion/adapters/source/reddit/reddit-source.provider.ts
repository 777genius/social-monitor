import { redactSensitiveText } from "@social-monitor/shared-kernel";
import { rankSourceItems, type SourceItemRankingPlan } from "../../../domain";
import type {
  ProviderFailure,
  SourceProviderPort,
  SourceProviderScanContext,
  SourceProviderScanPlan,
  SourceProviderScanResult,
  SourceProviderValidationResult,
  SourceQuery,
} from "../../../ports";
import { redditCapabilityProfile } from "./reddit-capability-profile";
import type { RedditClientPort, RedditListingPage } from "./reddit-client.port";
import type { RedditRefreshTokenProviderPort } from "./refresh-token-reddit-token-provider";
import { resolveRedditAccessToken } from "./reddit-access-token";
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
import {
  formatScanPassWarning,
  isInsideTargetPublishedWindow,
  pageTargetWindowStats,
  readTargetPublishedWindow,
  redditRankingQueries,
  redditScanPassLabel,
  redditTopTimeForTargetWindow,
  shouldContinuePastEmptyTargetWindowPage,
  sourceQueryLaneForPass,
  sourceQueryLaneForPlan,
} from "./reddit-source-window-and-lanes";
import type { RedditTokenProviderPort } from "./reddit-token-provider.port";
import { readAdaptivePaginationPolicy } from "../adaptive-source-pagination";
import { readSourceItemRankingPlan } from "../source-item-ranking-config";
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
      return this.scanPasses({
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

  private async scanPasses(params: {
    readonly accessToken: string;
    readonly userAgent: string | undefined;
    readonly plan: SourceProviderScanPlan;
    readonly passes: readonly RedditScanPass[];
    readonly fallbackMinScore: number | undefined;
    readonly fallbackIncludeComments: boolean;
    readonly maxCommentedPosts: number | undefined;
    readonly fallbackMaxCommentsPerPost: number | undefined;
    readonly fallbackCommentDepth: number;
    readonly fallbackCommentSort: NonNullable<RedditScanPass["commentSort"]>;
    readonly rankingPlan: SourceItemRankingPlan;
    readonly config: SourceProviderScanContext["config"];
  }): Promise<SourceProviderScanResult> {
    const perPassFallbackLimit = Math.max(
      1,
      Math.ceil(params.plan.maxItems / params.passes.length),
    );
    const pagination = readAdaptivePaginationPolicy({
      config: params.config,
      cursorModel: redditCapabilityProfile.cursorModel,
      firstPageLimit: params.plan.maxItems,
    });
    const paginationPolicy = pagination.enabled ? pagination.policy : undefined;
    const targetPublishedWindow = readTargetPublishedWindow(params.config);
    const candidatesByExternalId = new Map<string, RedditScanCandidate>();
    const warnings: string[] = [];
    let failedPasses = 0;
    let firstFailure: unknown;

    for (const pass of params.passes) {
      const limit = pass.maxItems ?? perPassFallbackLimit;
      const minScore = pass.minScore ?? params.fallbackMinScore;
      const commentExpansion = selectedCommentExpansionForPass({
        pass,
        fallbackIncludeComments: params.fallbackIncludeComments,
        fallbackMaxCommentsPerPost: params.fallbackMaxCommentsPerPost,
        fallbackCommentDepth: params.fallbackCommentDepth,
        fallbackCommentSort: params.fallbackCommentSort,
        minScore,
      });
      let cursor: string | undefined;
      let pageCount = 0;
      let passNewItemCount = 0;
      let duplicateItemCount = 0;
      const maxPages = paginationPolicy?.maxPages ?? 1;

      for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
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
                    ? {
                        topTime: redditTopTimeForTargetWindow(
                          pass.topTime ?? "day",
                          targetPublishedWindow,
                        ),
                      }
                    : {}),
                  limit,
                  after: cursor,
                })
              : await this.client.searchPosts({
                  accessToken: params.accessToken,
                  userAgent: params.userAgent,
                  query: pass.query,
                  sort: pass.searchSort,
                  time: pass.searchTime,
                  limit,
                  after: cursor,
                });
        } catch (error) {
          if (pageIndex === 0) {
            firstFailure ??= error;
            failedPasses += 1;
          }

          warnings.push(formatScanPassWarning(pass, error));
          break;
        }

        pageCount += 1;
        let pageNewItemCount = 0;
        let pageDuplicateItemCount = 0;
        const posts =
          pass.mode === "search"
            ? filterPostsByAllowedSubreddits(page.posts, pass.allowedSubreddits)
            : page.posts;
        const windowStats = pageTargetWindowStats(posts, targetPublishedWindow);

        for (const post of posts) {
          if (passNewItemCount >= limit) {
            break;
          }

          for (const item of normalizePost(
            post,
            minScore,
            sourceQueryLaneForPass(pass, limit),
          )) {
            if (!isInsideTargetPublishedWindow(item, targetPublishedWindow)) {
              continue;
            }

            if (passNewItemCount >= limit) {
              break;
            }

            const existing = candidatesByExternalId.get(item.externalId);

            if (existing === undefined) {
              candidatesByExternalId.set(item.externalId, {
                item,
                post,
                ...(commentExpansion === undefined ? {} : { commentExpansion }),
              });
              pageNewItemCount += 1;
              passNewItemCount += 1;
              continue;
            }

            duplicateItemCount += 1;
            pageDuplicateItemCount += 1;
            candidatesByExternalId.set(
              item.externalId,
              withMergedRedditCommentExpansion(existing, commentExpansion),
            );
          }
        }

        warnings.push(...redditWarnings(posts, minScore));
        if (paginationPolicy === undefined || passNewItemCount >= limit) {
          break;
        }

        const nextCursor = page.after;
        if (nextCursor === undefined || nextCursor === cursor) {
          break;
        }

        if (
          shouldContinuePastEmptyTargetWindowPage({
            pageNewItemCount,
            pageDuplicateItemCount,
            windowStats,
          })
        ) {
          cursor = nextCursor;
          continue;
        }

        const pageItemCount = pageNewItemCount + pageDuplicateItemCount;
        const duplicateRate =
          pageItemCount === 0 ? 0 : pageDuplicateItemCount / pageItemCount;
        if (pageNewItemCount < paginationPolicy.minNewItemsPerPage) {
          break;
        }

        if (duplicateRate > paginationPolicy.maxDuplicateRate) {
          break;
        }

        cursor = nextCursor;
      }

      if (paginationPolicy !== undefined && pageCount > 1) {
        warnings.push(
          [
            "reddit_adaptive_pagination.stats",
            `pass=${redditScanPassLabel(pass)}`,
            `pages=${pageCount}`,
            `items=${passNewItemCount}`,
            `duplicates=${duplicateItemCount}`,
          ].join(";"),
        );
      }
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
      candidates: rankedCandidates.slice(
        0,
        params.maxCommentedPosts ?? rankedCandidates.length,
      ),
    });

    return {
      items: rankedItems,
      conversationUnits: conversationResult.conversationUnits,
      warnings: compactUnique([...warnings, ...conversationResult.warnings]),
    };
  }
}
