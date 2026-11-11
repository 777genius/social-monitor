import type { JsonRecord } from "./durable-backend-e2e-json-fields";

export type DurableScanProviderKey =
  | "hacker-news"
  | "github-issues"
  | "github-trending-page"
  | "reddit"
  | "rss";

export type DurableScanTarget = {
  readonly providerKey: DurableScanProviderKey;
  readonly config: JsonRecord;
};

export function createDurableScanTargets({
  process,
  emptyToUndefined,
}: {
  readonly process: { readonly env: NodeJS.ProcessEnv };
  readonly emptyToUndefined: (value: string | undefined) => string | undefined;
}): {
  readonly durableScanTargets: () => readonly DurableScanTarget[];
  readonly scheduledScanTarget: () => DurableScanTarget;
} {
  function durableScanTargets(): readonly DurableScanTarget[] {
    const githubAccessToken = emptyToUndefined(process.env.GITHUB_ACCESS_TOKEN);
    if (!hasRedditAppOnlyCredentials()) {
      throw new Error(
        "REDDIT_APP_CLIENT_ID and REDDIT_APP_CLIENT_SECRET are required because durable backend E2E must scan Reddit, GitHub Issues, GitHub Trending Page, Hacker News and RSS in one loop",
      );
    }

    return [
      {
        providerKey: "hacker-news",
        config: {
          mode: "search",
          query: "monitoring",
          maxItems: 2,
        },
      },
      {
        providerKey: "github-issues",
        config: {
          query: "repo:microsoft/TypeScript is:issue",
          maxItems: 2,
          userAgent:
            emptyToUndefined(process.env.GITHUB_USER_AGENT) ??
            "social-monitor-mvp/0.1 github-live-smoke",
          ...(githubAccessToken === undefined
            ? {}
            : { accessToken: githubAccessToken }),
        },
      },
      {
        providerKey: "github-trending-page",
        config: {
          window: "daily",
          language: "python",
          maxItems: 3,
          userAgent:
            emptyToUndefined(process.env.GITHUB_TRENDING_PAGE_USER_AGENT) ??
            emptyToUndefined(process.env.GITHUB_USER_AGENT) ??
            "social-monitor-mvp/0.1 github-trending-page",
        },
      },
      {
        providerKey: "reddit",
        config: {
          mode: "listing",
          subreddit: "programming",
          listing: "hot",
          maxItems: 2,
          userAgent:
            process.env.REDDIT_APP_USER_AGENT ??
            process.env.REDDIT_USER_AGENT ??
            "social-monitor-mvp/0.1 reddit-app-only",
        },
      },
      {
        providerKey: "rss",
        config: {
          feedUrl: "https://hnrss.org/frontpage",
          maxItems: 2,
        },
      },
    ];
  }

  function scheduledScanTarget(): DurableScanTarget {
    return {
      providerKey: "rss",
      config: {
        feedUrl: "https://hnrss.org/newest",
        maxItems: 2,
      },
    };
  }

  function hasRedditAppOnlyCredentials(): boolean {
    return (
      emptyToUndefined(process.env.REDDIT_APP_CLIENT_ID) !== undefined &&
      emptyToUndefined(process.env.REDDIT_APP_CLIENT_SECRET) !== undefined
    );
  }
  return { durableScanTargets, scheduledScanTarget };
}
