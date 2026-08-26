import { status } from "@grpc/grpc-js";
import { grpcStatusCodeOf } from "@social-monitor/platform-grpc";
import { redactSensitiveText } from "@social-monitor/shared-kernel";
import { rankSourceItems } from "../../../domain";

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
import { readSourceItemRankingPlan } from "../source-item-ranking-config";
import {
  readAdaptivePaginationPolicy,
  type AdaptivePaginationPolicy,
} from "../adaptive-source-pagination";
import {
  nextCursorForQueries,
  parseConfig,
  readCursorByQuery,
  readGrpcMetadataDate,
  readGrpcMetadataPositiveInteger,
  readPositiveInteger,
  type XExperimentalDailyScanConfig,
} from "./x-twitter-experimental-daily-config";
import {
  compareXCollectedPosts,
  formatXCollectorWarning,
  normalizeXPost,
  xPostMatchesMetricThresholds,
  xPostMatchesSearchQuery,
  xPostSignalScore,
} from "./x-twitter-experimental-daily-item";
import type {
  XDailyCollectedPost,
  XDailyCollectorClientPort,
  XDailyCollectorRequest,
  XDailyCollectorWarning,
} from "./x-daily-collector-client.port";

export const X_TWITTER_PROVIDER_KEY = "x-twitter";
export const X_TWITTER_EXPERIMENTAL_DAILY_PROVIDER_KEY =
  "x-twitter-experimental-daily";

export const xTwitterCapabilityProfile: SourceCapabilityProfile = {
  providerKey: X_TWITTER_PROVIDER_KEY,
  displayName: "X/Twitter",
  version: 1,
  productionSafe: true,
  supportedContentUnits: ["post", "link", "media"],
  supportedQueryModes: ["search"],
  cursorModel: "none",
  stableIdentity: ["providerId", "canonicalUrl"],
  quotaModel: "per_credential",
  limitations: [
    "Connector is backed by the private gRPC x-collector service.",
    "Search results can be reordered by X; scans use rolling windows and source-level dedupe.",
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
    if (query.mode !== "search") {
      return { ok: false, reason: `Unsupported query mode: ${query.mode}` };
    }

    const normalized = query.query.trim();
    if (normalized.length < 2 || normalized.length > 500) {
      return {
        ok: false,
        reason: "X/Twitter search query must be 2-500 characters",
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
    const rankingPlan = readSourceItemRankingPlan(
      context.config,
      config.searchQueries,
    );
    const queryCursors =
      config.searchQueries.length === 1
        ? new Map<string, string>()
        : readCursorByQuery(plan.cursor);
    const postsByExternalId = new Map<
      string,
      {
        readonly post: XDailyCollectedPost;
        readonly searchQuery: string;
        readonly maxItems: number;
      }
    >();
    const warnings: string[] = [];
    const nextCursorsByQuery = new Map<string, string>();
    const pagination = readAdaptivePaginationPolicy({
      config: context.config,
      cursorModel: xTwitterCapabilityProfile.cursorModel,
      firstPageLimit: plan.maxItems,
      providerManagesPagination: true,
    });
    const paginationPolicy = pagination.enabled ? pagination.policy : undefined;

    for (const [index, searchQuery] of config.searchQueries.entries()) {
      const queryMaxItems =
        config.maxItemsBySearchQuery.get(searchQuery) ??
        config.maxItemsPerQuery;
      try {
        const result = await this.collectQueryWithBoundedPagination({
          context,
          config,
          plan,
          searchQuery,
          queryIndex: index,
          queryMaxItems,
          initialCursor:
            config.searchQueries.length === 1
              ? plan.cursor
              : queryCursors.get(searchQuery),
          paginationPolicy,
        });

        for (const post of result.posts.filter(
          (item) =>
            xPostMatchesMetricThresholds(item.metrics, config) &&
            (!config.requireQueryMatch ||
              xPostMatchesSearchQuery(
                item,
                searchQuery,
                result.queryTargetItems,
              )),
        )) {
          const externalId = `${X_TWITTER_PROVIDER_KEY}:${post.tweetId}`;
          const existing = postsByExternalId.get(externalId);

          if (
            existing === undefined ||
            xPostSignalScore(post) > xPostSignalScore(existing.post)
          ) {
            postsByExternalId.set(externalId, {
              post,
              searchQuery,
              maxItems: result.queryTargetItems,
            });
          }
        }

        if (result.nextCursor !== undefined) {
          nextCursorsByQuery.set(searchQuery, result.nextCursor);
        }

        warnings.push(
          ...result.warnings.map((warning) =>
            config.searchQueries.length === 1
              ? formatXCollectorWarning(warning)
              : redactSensitiveText(
                  `${searchQuery}: ${formatXCollectorWarning(warning)}`,
                ),
          ),
        );
      } catch (error) {
        const failure = this.classifyError(error);
        if (failure.kind === "rate_limited" && postsByExternalId.size > 0) {
          warnings.push(
            redactSensitiveText(
              `${searchQuery}: x-twitter.partial_rate_limit: ${failure.message}`,
            ),
          );
          break;
        }

        throw error;
      }
    }

    const normalizedItems = [...postsByExternalId.values()]
      .sort((left, right) => compareXCollectedPosts(left.post, right.post))
      .map((item) =>
        normalizeXPost(item.post, item.searchQuery, item.maxItems),
      );

    const outputItemLimit = Math.max(
      plan.maxItems,
      paginationPolicy?.targetItems ?? 0,
    );

    return {
      items: rankSourceItems(normalizedItems, rankingPlan).slice(
        0,
        outputItemLimit,
      ),
      nextCursor: nextCursorForQueries(
        config.searchQueries,
        nextCursorsByQuery,
        queryCursors,
      ),
      warnings,
    };
  }

  private async collectQueryWithBoundedPagination(params: {
    readonly context: SourceProviderScanContext;
    readonly config: XExperimentalDailyScanConfig;
    readonly plan: SourceProviderScanPlan;
    readonly searchQuery: string;
    readonly queryIndex: number;
    readonly queryMaxItems: number;
    readonly initialCursor: string | undefined;
    readonly paginationPolicy: AdaptivePaginationPolicy | undefined;
  }): Promise<{
    readonly posts: readonly XDailyCollectedPost[];
    readonly warnings: readonly XDailyCollectorWarning[];
    readonly nextCursor: string | undefined;
    readonly queryTargetItems: number;
  }> {
    const queryTargetItems =
      params.paginationPolicy === undefined
        ? params.queryMaxItems
        : Math.max(
            params.queryMaxItems,
            Math.ceil(
              params.paginationPolicy.targetItems /
                Math.max(params.config.searchQueries.length, 1),
            ),
          );
    const postsByTweetId = new Map<string, XDailyCollectedPost>();
    const warnings: XDailyCollectorWarning[] = [];
    const maxPages = params.paginationPolicy?.maxPages ?? 1;
    const baseLimit = params.config.limitPerProduct ?? params.queryMaxItems;
    let cursor = params.initialCursor;
    let nextCursor: string | undefined;
    let duplicateCount = 0;

    for (let page = 0; page < maxPages; page += 1) {
      const expandedMaxItems = Math.min(
        queryTargetItems,
        params.queryMaxItems * (page + 1),
      );
      const result = await this.collector.collectDailySearch({
        requestId:
          params.config.searchQueries.length === 1
            ? params.context.scanJobId
            : `${params.context.scanJobId}:${params.queryIndex + 1}:${page + 1}`,
        tenantId: params.context.tenantId,
        workspaceId: params.context.workspaceId,
        sourceBindingId: params.context.sourceBindingId,
        scanJobId: params.context.scanJobId,
        correlationId: params.context.correlationId,
        query: params.searchQuery,
        language: params.config.language,
        windowHours: params.config.windowHours,
        windowEnd: params.config.windowEnd,
        searchProducts: params.config.searchProducts,
        limitPerProduct: Math.min(100, baseLimit * (page + 1)),
        maxItems: expandedMaxItems,
        minLikes: params.config.minLikes,
        minRetweets: params.config.minRetweets,
        minReplies: params.config.minReplies,
        cursor,
      } satisfies XDailyCollectorRequest);

      let pageNewItemCount = 0;
      let pageDuplicateCount = 0;
      for (const post of result.posts) {
        const existing = postsByTweetId.get(post.tweetId);
        if (existing === undefined) {
          postsByTweetId.set(post.tweetId, post);
          pageNewItemCount += 1;
          continue;
        }

        duplicateCount += 1;
        pageDuplicateCount += 1;
        if (xPostSignalScore(post) > xPostSignalScore(existing)) {
          postsByTweetId.set(post.tweetId, post);
        }
      }

      warnings.push(...result.warnings);
      nextCursor = result.nextCursor;
      if (
        params.paginationPolicy === undefined ||
        postsByTweetId.size >= queryTargetItems
      ) {
        break;
      }

      const pageItemCount = pageNewItemCount + pageDuplicateCount;
      const duplicateRate =
        pageItemCount === 0 ? 0 : pageDuplicateCount / pageItemCount;
      if (
        pageNewItemCount < params.paginationPolicy.minNewItemsPerPage ||
        duplicateRate > params.paginationPolicy.maxDuplicateRate
      ) {
        break;
      }

      if (nextCursor === undefined || nextCursor === cursor) {
        break;
      }

      cursor = nextCursor;
    }

    if (params.paginationPolicy !== undefined && maxPages > 1) {
      warnings.push({
        code: "x_collector.adaptive_pagination_stats",
        message: [
          "x_adaptive_pagination.stats",
          `items=${postsByTweetId.size}`,
          `duplicates=${duplicateCount}`,
          `target=${queryTargetItems}`,
        ].join(";"),
      });
    }

    return {
      posts: [...postsByTweetId.values()],
      warnings,
      nextCursor,
      queryTargetItems,
    };
  }

  classifyError(error: unknown): ProviderFailure {
    const code = grpcStatusCodeOf(error);
    const message = redactSensitiveText(
      error instanceof Error ? error.message : "Unknown X collector error",
    );
    const lowerMessage = message.toLowerCase();

    if (
      lowerMessage.includes("rankingmode") ||
      lowerMessage.includes("ranking mode") ||
      lowerMessage.includes("search query must be")
    ) {
      return { kind: "invalid_query", retryable: false, message };
    }

    if (code === status.RESOURCE_EXHAUSTED) {
      return {
        kind: "rate_limited",
        retryable: true,
        message,
        retryAfterMs: readGrpcMetadataPositiveInteger(error, "retry-after-ms"),
        rateLimitResetAt: readGrpcMetadataDate(error, "rate-limit-reset-at"),
      };
    }

    if (code === status.UNAUTHENTICATED || code === status.PERMISSION_DENIED) {
      return { kind: "auth_failed", retryable: false, message };
    }

    if (code === status.INVALID_ARGUMENT) {
      return { kind: "invalid_query", retryable: false, message };
    }

    if (code === status.DEADLINE_EXCEEDED || code === status.UNAVAILABLE) {
      return { kind: "unavailable", retryable: true, message };
    }

    return { kind: "unknown", retryable: true, message };
  }
}

export { XTwitterSourceProvider as XTwitterExperimentalDailySourceProvider };
