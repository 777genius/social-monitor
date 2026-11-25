import { redactSensitiveText } from "@social-monitor/shared-kernel";
import type {
  SourceProviderScanContext,
  SourceProviderScanPlan,
} from "../../../ports";
import type { RedditPost, RedditTopTime } from "./reddit-client.port";
import {
  compactUnique,
  parseListingQuery,
  type RedditScanPass,
  type RedditSourceQueryLaneMetadata,
} from "./reddit-source-support";

export const formatScanPassWarning = (
  pass: RedditScanPass,
  error: unknown,
): string => {
  const message =
    error instanceof Error ? error.message : "Unknown Reddit scan pass error";

  return `Reddit scan pass degraded (${redditScanPassLabel(pass)}): ${redactSensitiveText(message)}`;
};

export type TargetPublishedWindow = {
  readonly startInclusive: Date;
  readonly endExclusive: Date;
  readonly observedAt?: Date;
};

export type TargetWindowStats = {
  readonly newerCount: number;
  readonly insideCount: number;
  readonly olderCount: number;
};

export const readTargetPublishedWindow = (
  config: SourceProviderScanContext["config"],
): TargetPublishedWindow | undefined => {
  const raw = config?.targetPublishedWindow;
  if (raw === undefined || typeof raw !== "object" || raw === null) {
    return undefined;
  }

  const record = raw as Record<string, unknown>;
  const start = dateFromUnknown(record.startInclusive);
  const end = dateFromUnknown(record.endExclusive);
  if (start === undefined || end === undefined || start >= end) {
    return undefined;
  }

  const observedAt = dateFromUnknown(record.observedAt);

  return {
    startInclusive: start,
    endExclusive: end,
    ...(observedAt === undefined ? {} : { observedAt }),
  };
};

const dateFromUnknown = (value: unknown): Date | undefined => {
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? undefined : date;
};

export const redditTopTimeForTargetWindow = (
  requested: RedditTopTime,
  targetPublishedWindow: TargetPublishedWindow | undefined,
): RedditTopTime =>
  targetPublishedWindow !== undefined &&
  requested === "day" &&
  !isOpenTargetPublishedWindow(targetPublishedWindow)
    ? "week"
    : requested;

const isOpenTargetPublishedWindow = (
  targetPublishedWindow: TargetPublishedWindow,
): boolean =>
  targetPublishedWindow.observedAt !== undefined &&
  targetPublishedWindow.observedAt >= targetPublishedWindow.startInclusive &&
  targetPublishedWindow.observedAt < targetPublishedWindow.endExclusive;

export const isInsideTargetPublishedWindow = (
  item: { readonly publishedAt: Date },
  targetPublishedWindow: TargetPublishedWindow | undefined,
): boolean =>
  targetPublishedWindow === undefined ||
  (item.publishedAt >= targetPublishedWindow.startInclusive &&
    item.publishedAt < targetPublishedWindow.endExclusive);

export const pageTargetWindowStats = (
  posts: readonly RedditPost[],
  targetPublishedWindow: TargetPublishedWindow | undefined,
): TargetWindowStats => {
  if (targetPublishedWindow === undefined) {
    return { newerCount: 0, insideCount: posts.length, olderCount: 0 };
  }

  return posts.reduce(
    (stats, post) => {
      const createdAt =
        post.createdUtc === undefined
          ? undefined
          : new Date(post.createdUtc * 1000);
      if (createdAt === undefined || Number.isNaN(createdAt.getTime())) {
        return stats;
      }

      if (createdAt >= targetPublishedWindow.endExclusive) {
        return { ...stats, newerCount: stats.newerCount + 1 };
      }

      if (createdAt < targetPublishedWindow.startInclusive) {
        return { ...stats, olderCount: stats.olderCount + 1 };
      }

      return { ...stats, insideCount: stats.insideCount + 1 };
    },
    { newerCount: 0, insideCount: 0, olderCount: 0 },
  );
};

export const shouldContinuePastEmptyTargetWindowPage = (params: {
  readonly pageNewItemCount: number;
  readonly pageDuplicateItemCount: number;
  readonly windowStats: TargetWindowStats;
}): boolean =>
  params.windowStats.insideCount === 0 &&
  params.windowStats.newerCount > 0 &&
  params.windowStats.olderCount === 0 &&
  params.pageNewItemCount + params.pageDuplicateItemCount === 0;

export const redditScanPassLabel = (pass: RedditScanPass): string =>
  pass.mode === "listing"
    ? `${pass.subreddit}:${pass.listing}${pass.listing === "top" ? `:${pass.topTime ?? "day"}` : ""}`
    : `search:${pass.query}`;

export const sourceQueryLaneForPlan = (
  plan: SourceProviderScanPlan,
): RedditSourceQueryLaneMetadata => {
  if (plan.query.mode === "listing") {
    const listing = parseListingQuery(plan.query.query);

    return {
      providerKey: "reddit",
      mode: "listing",
      query: plan.query.query,
      maxItems: plan.maxItems,
      subreddit: listing.subreddit,
      listing: listing.listing,
    };
  }

  return {
    providerKey: "reddit",
    mode: "search",
    query: plan.query.query,
    maxItems: plan.maxItems,
  };
};

export const sourceQueryLaneForPass = (
  pass: RedditScanPass,
  maxItems: number,
): RedditSourceQueryLaneMetadata =>
  pass.mode === "listing"
    ? {
        providerKey: "reddit",
        mode: "listing",
        query: redditListingPassQuery(pass),
        maxItems,
        subreddit: pass.subreddit,
        listing: pass.listing,
        ...(pass.topTime === undefined ? {} : { topTime: pass.topTime }),
      }
    : {
        providerKey: "reddit",
        mode: "search",
        query: pass.query,
        maxItems,
        ...(pass.searchSort === undefined
          ? {}
          : { searchSort: pass.searchSort }),
        ...(pass.searchTime === undefined
          ? {}
          : { searchTime: pass.searchTime }),
      };

const redditListingPassQuery = (
  pass: Extract<RedditScanPass, { mode: "listing" }>,
): string => `${pass.subreddit}:${pass.listing}`;

export const redditRankingQueries = (
  plan: SourceProviderScanPlan,
  passes: readonly RedditScanPass[],
): readonly string[] =>
  compactUnique([
    plan.query.query,
    ...passes.map((pass) =>
      pass.mode === "search" ? pass.query : `${pass.subreddit} ${pass.listing}`,
    ),
  ]);
