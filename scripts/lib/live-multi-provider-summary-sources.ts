import { SystemClock } from "@social-monitor/shared-kernel";
import { aiDeveloperSignalSourcePreset, type SourceTargetPresetEntry, type SourceTargetPresetSummaryPreference } from "@social-monitor/subscriptions/domain";
import { GITHUB_ISSUES_PROVIDER_KEY } from "../../libs/ingestion/adapters/source/github/github-source.provider";
import { GrpcXDailyCollectorClient } from "../../libs/ingestion/adapters/source/x-twitter-experimental-daily/grpc-x-daily-collector-client";
import { XTwitterSourceProvider } from "../../libs/ingestion/adapters/source/x-twitter-experimental-daily/x-twitter-experimental-daily-source.provider";
import type { SourceQuery } from "../../libs/ingestion/ports";
import type { ScanTarget, LiveProviderKey } from "./live-multi-provider-summary-support";
import { readRedditListing, safeIdPart } from "./live-multi-provider-summary-support";
import { readOptionalEnv, sourcePresetMode, readCsvEnv, readOptionalPositiveIntegerEnv, maxItemsPerProvider, xTwitterMaxItems, xTwitterLimitPerProduct, redditIncludeComments, redditMaxCommentsPerPost, redditCommentDepth, redditCommentSort, maxSummaryKeyPoints, readPositiveIntegerEnv, readBooleanEnv } from "./live-multi-provider-summary-config";

export const buildScanTargets = (): readonly ScanTarget[] => {
  const userAgent =
    readOptionalEnv("LIVE_MULTI_PROVIDER_USER_AGENT") ??
    "social-monitor-mvp-live-multi-provider-summary/0.1";
  const includeXTwitter = shouldIncludeXTwitterTargets();
  const includeGithubSupporting = shouldIncludeGithubSupportingTargets();
  if (sourcePresetMode === aiDeveloperSignalSourcePreset.presetId) {
    return [
      ...presetScanTargets({
        userAgent,
        includeXTwitter,
      }),
      ...(includeGithubSupporting
        ? supplementalGithubScanTargets(userAgent)
        : []),
    ];
  }

  const subreddits = readCsvEnv("LIVE_MULTI_PROVIDER_REDDIT_SUBREDDITS") ?? [
    readOptionalEnv("LIVE_MULTI_PROVIDER_REDDIT_SUBREDDIT") ?? "programming",
  ];
  const redditListing = readRedditListing(
    readOptionalEnv("LIVE_MULTI_PROVIDER_REDDIT_LISTING") ?? "hot",
  );
  const redditTopTime =
    readOptionalEnv("LIVE_MULTI_PROVIDER_REDDIT_TOP_TIME") ?? "week";
  const redditMinScore = readOptionalPositiveIntegerEnv(
    "LIVE_MULTI_PROVIDER_REDDIT_MIN_SCORE",
  );
  const githubQuery =
    readOptionalEnv("LIVE_MULTI_PROVIDER_GITHUB_QUERY") ??
    "repo:microsoft/TypeScript is:issue";
  const hackerNewsQuery =
    readOptionalEnv("LIVE_MULTI_PROVIDER_HN_QUERY") ?? "monitoring";
  const rssFeedUrl =
    readOptionalEnv("LIVE_MULTI_PROVIDER_RSS_URL") ??
    "https://hnrss.org/frontpage";
  const xTwitterQueries = readCsvEnv("LIVE_MULTI_PROVIDER_X_QUERIES") ?? [
    "openai",
    "claude ai",
    "ai coding agents",
  ];

  return [
    ...subreddits.map((subreddit, index): ScanTarget => ({
      providerKey: "reddit",
      sourceBindingId: `source-binding-live-multi-provider-reddit-${index + 1}-${safeIdPart(subreddit)}`,
      scanPolicyId: `scan-policy-live-multi-provider-reddit-${index + 1}-${safeIdPart(subreddit)}`,
      sourceQuery: {
        mode: "listing",
        query: `${subreddit}:${redditListing}`,
      },
      config: {
        subreddit,
        listing: redditListing,
        ...(redditListing === "top" ? { topTime: redditTopTime } : {}),
        ...(redditMinScore === undefined ? {} : { minScore: redditMinScore }),
        ...redditCommentRuntimeConfig(),
        maxItems: maxItemsPerProvider,
        userAgent,
      },
    })),
    {
      providerKey: GITHUB_ISSUES_PROVIDER_KEY,
      ...githubIssuesTarget({ userAgent, query: githubQuery }),
    },
    githubTrendingPageTarget(userAgent),
    {
      providerKey: "hacker-news",
      sourceBindingId: "source-binding-live-multi-provider-hacker-news",
      scanPolicyId: "scan-policy-live-multi-provider-hacker-news",
      sourceQuery: { mode: "search", query: hackerNewsQuery },
      config: {},
    },
    {
      providerKey: "rss",
      sourceBindingId: "source-binding-live-multi-provider-rss",
      scanPolicyId: "scan-policy-live-multi-provider-rss",
      sourceQuery: { mode: "url", query: rssFeedUrl },
      config: {},
    },
    ...(includeXTwitter
      ? xTwitterQueries.map((query, index): ScanTarget => ({
          providerKey: "x-twitter",
          sourceBindingId: `source-binding-live-multi-provider-x-twitter-${index + 1}-${safeIdPart(query)}`,
          scanPolicyId: `scan-policy-live-multi-provider-x-twitter-${index + 1}-${safeIdPart(query)}`,
          sourceQuery: { mode: "search", query },
          config: {
            language: "en",
            windowHours: 24,
            searchProducts: ["top", "latest"],
            maxItems: xTwitterMaxItems,
            limitPerProduct: xTwitterLimitPerProduct,
            minLikes: 10,
            minRetweets: 0,
            minReplies: 0,
          },
        }))
      : []),
  ];
};

const redditCommentRuntimeConfig = (): Readonly<Record<string, unknown>> =>
  redditIncludeComments
    ? {
        includeComments: true,
        maxCommentsPerPost: redditMaxCommentsPerPost,
        commentDepth: redditCommentDepth,
        commentSort: redditCommentSort,
      }
    : { includeComments: false };

export const summaryPreferenceForRun = (): SourceTargetPresetSummaryPreference => {
  if (sourcePresetMode === aiDeveloperSignalSourcePreset.presetId) {
    const primaryInstructions = `${aiDeveloperSignalSourcePreset.summaryPreference.customInstructions} Use Reddit, X/Twitter, Hacker News and RSS as the primary signal layer.`;
    return {
      ...aiDeveloperSignalSourcePreset.summaryPreference,
      customInstructions: shouldIncludeGithubSupportingTargets()
        ? `${primaryInstructions} Treat GitHub issues and GitHub Trending as supporting developer evidence unless social/news sources confirm the same story.`
        : primaryInstructions,
    };
  }

  return {
    language: "auto",
    format: "bullet_digest",
    tone: "analytical",
    maxKeyPoints: maxSummaryKeyPoints,
    includeRisks: true,
    includeSourceHighlights: true,
    customInstructions:
      "Compare signals across Reddit, GitHub, Hacker News, RSS and X/Twitter for the selected monitoring topic.",
  };
};

const presetScanTargets = (params: {
  readonly userAgent: string;
  readonly includeXTwitter: boolean;
}): readonly ScanTarget[] => {
  const xTwitterQueryOverride = readCsvEnv("LIVE_MULTI_PROVIDER_X_QUERIES");
  const xTwitterTargetConfig =
    aiDeveloperSignalSourcePreset.entries.find(
      (entry) => entry.providerKey === "x-twitter",
    )?.targetConfig ?? {};
  const presetTargets = aiDeveloperSignalSourcePreset.entries.flatMap(
    (entry, index): readonly ScanTarget[] => {
      const providerKey = liveProviderKeyForPresetEntry(entry);
      if (providerKey === "x-twitter" && !params.includeXTwitter) {
        return [];
      }

      if (providerKey === "x-twitter" && xTwitterQueryOverride !== undefined) {
        return [];
      }

      return [
        {
          providerKey,
          sourceBindingId: `source-binding-live-multi-provider-${providerKey}-${index + 1}-${safeIdPart(entry.targetValue)}`,
          scanPolicyId: `scan-policy-live-multi-provider-${providerKey}-${index + 1}-${safeIdPart(entry.targetValue)}`,
          sourceQuery: sourceQueryForPresetEntry(entry),
          config: {
            ...entry.targetConfig,
            ...(providerKey === "reddit" ? redditCommentRuntimeConfig() : {}),
            userAgent: params.userAgent,
          },
        },
      ];
    },
  );

  if (!params.includeXTwitter || xTwitterQueryOverride === undefined) {
    return presetTargets;
  }

  return [
    ...presetTargets,
    ...xTwitterQueryOverride.map((query, index): ScanTarget => ({
      providerKey: "x-twitter",
      sourceBindingId: `source-binding-live-multi-provider-x-twitter-override-${index + 1}-${safeIdPart(query)}`,
      scanPolicyId: `scan-policy-live-multi-provider-x-twitter-override-${index + 1}-${safeIdPart(query)}`,
      sourceQuery: { mode: "search", query },
      config: {
        ...xTwitterTargetConfig,
        maxItems: xTwitterMaxItems,
        limitPerProduct: xTwitterLimitPerProduct,
        userAgent: params.userAgent,
      },
    })),
  ];
};

const supplementalGithubScanTargets = (
  userAgent: string,
): readonly ScanTarget[] => [
  {
    providerKey: GITHUB_ISSUES_PROVIDER_KEY,
    ...githubIssuesTarget({
      userAgent,
      query:
        readOptionalEnv("LIVE_MULTI_PROVIDER_GITHUB_QUERY") ??
        "repo:microsoft/TypeScript is:issue",
    }),
  },
  githubTrendingPageTarget(userAgent),
];

const githubIssuesTarget = (params: {
  readonly userAgent: string;
  readonly query: string;
}): Omit<ScanTarget, "providerKey"> => {
  const githubAccessToken = readOptionalEnv("GITHUB_ACCESS_TOKEN");

  return {
    sourceBindingId: "source-binding-live-multi-provider-github",
    scanPolicyId: "scan-policy-live-multi-provider-github",
    sourceQuery: { mode: "search", query: params.query },
    config: {
      maxItems: maxItemsPerProvider,
      userAgent: params.userAgent,
      ...(githubAccessToken === undefined
        ? {}
        : { accessToken: githubAccessToken }),
    },
  };
};

const githubTrendingPageTarget = (userAgent: string): ScanTarget => ({
  providerKey: "github-trending-page",
  sourceBindingId: "source-binding-live-multi-provider-github-trending-page",
  scanPolicyId: "scan-policy-live-multi-provider-github-trending-page",
  sourceQuery: { mode: "listing", query: "daily" },
  config: {
    window: "daily",
    language:
      readOptionalEnv("LIVE_MULTI_PROVIDER_GITHUB_TRENDING_LANGUAGE") ??
      "python",
    maxItems: maxItemsPerProvider,
    userAgent,
  },
});

const sourceQueryForPresetEntry = (
  entry: SourceTargetPresetEntry,
): SourceQuery => {
  if (entry.targetKind === "url") {
    return { mode: "url", query: entry.targetValue };
  }

  if (entry.targetKind === "subreddit") {
    return { mode: "listing", query: `${entry.targetValue}:hot` };
  }

  return { mode: "search", query: entry.targetValue };
};

const liveProviderKeyForPresetEntry = (
  entry: SourceTargetPresetEntry,
): LiveProviderKey => {
  switch (entry.providerKey) {
    case "reddit":
    case "hacker-news":
    case "rss":
    case "x-twitter":
      return entry.providerKey;
    default:
      throw new Error(
        `Unsupported ${aiDeveloperSignalSourcePreset.presetId} provider in live multi-provider run: ${entry.providerKey}`,
      );
  }
};

export const buildXTwitterProvider = (): XTwitterSourceProvider | undefined => {
  if (!shouldIncludeXTwitterTargets()) {
    return undefined;
  }

  const address = readOptionalEnv("X_COLLECTOR_GRPC_ADDRESS");
  if (address === undefined) {
    throw new Error(
      "X_COLLECTOR_GRPC_ADDRESS is required when X/Twitter live summary targets are enabled",
    );
  }

  const clock = new SystemClock();
  return new XTwitterSourceProvider(
    GrpcXDailyCollectorClient.connect({
      address,
      clock,
      options: {
        timeoutMs: readPositiveIntegerEnv(
          "X_COLLECTOR_GRPC_TIMEOUT_MS",
          120_000,
          1_000,
          300_000,
        ),
        serviceToken: readOptionalEnv("X_COLLECTOR_SERVICE_TOKEN"),
      },
    }),
    clock,
  );
};

const shouldIncludeXTwitterTargets = (): boolean =>
  readBooleanEnv(
    "LIVE_MULTI_PROVIDER_INCLUDE_X_TWITTER",
    readOptionalEnv("X_COLLECTOR_GRPC_ADDRESS") !== undefined,
  );

const shouldIncludeGithubSupportingTargets = (): boolean =>
  readBooleanEnv("LIVE_MULTI_PROVIDER_INCLUDE_GITHUB_SUPPORTING", true);

export const maxItemsForProvider = (providerKey: LiveProviderKey): number =>
  providerKey === "x-twitter" ? xTwitterMaxItems : maxItemsPerProvider;
