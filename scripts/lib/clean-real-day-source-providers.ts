import { GitHubTrendingPageSourceProvider } from "@social-monitor/ingestion/adapters/source/github-trending-page/github-trending-page-source.provider";
import { HttpGitHubTrendingPageClient } from "@social-monitor/ingestion/adapters/source/github-trending-page/http-github-trending-page-client";
import { HackerNewsSourceProvider } from "@social-monitor/ingestion/adapters/source/hacker-news/hacker-news-source.provider";
import { HttpHackerNewsClient } from "@social-monitor/ingestion/adapters/source/hacker-news/http-hacker-news-client";
import { HttpRedditClient } from "@social-monitor/ingestion/adapters/source/reddit/http-reddit-client";
import { RedditAppOnlyTokenProvider } from "@social-monitor/ingestion/adapters/source/reddit/app-only-reddit-token-provider";
import { RedditRefreshTokenProvider } from "@social-monitor/ingestion/adapters/source/reddit/refresh-token-reddit-token-provider";
import { RedditSourceProvider } from "@social-monitor/ingestion/adapters/source/reddit/reddit-source.provider";
import { HttpRssClient } from "@social-monitor/ingestion/adapters/source/rss/http-rss-client";
import { RssSourceProvider } from "@social-monitor/ingestion/adapters/source/rss/rss-source.provider";
import { GrpcXDailyCollectorClient } from "@social-monitor/ingestion/adapters/source/x-twitter-experimental-daily/grpc-x-daily-collector-client";
import { DEFAULT_X_COLLECTOR_GRPC_TIMEOUT_MS } from "@social-monitor/ingestion/adapters/source/x-twitter-experimental-daily/x-collector-runtime-config";
import { XTwitterSourceProvider } from "@social-monitor/ingestion/adapters/source/x-twitter-experimental-daily/x-twitter-experimental-daily-source.provider";
import type { SourceProviderPort } from "@social-monitor/ingestion/ports";
import type { SystemClock } from "@social-monitor/shared-kernel";

export const buildProviders = (
  clock: SystemClock,
  includeGitHub: boolean,
): readonly SourceProviderPort[] => {
  const providers: SourceProviderPort[] = [];
  if (includeGitHub) {
    providers.push(
      new GitHubTrendingPageSourceProvider(
        new HttpGitHubTrendingPageClient(
          positiveIntegerEnv(process.env.GITHUB_TRENDING_TIMEOUT_MS, 10_000),
        ),
        clock,
      ),
    );
  }
  const redditTokenProvider = RedditAppOnlyTokenProvider.fromEnvironment(
    process.env,
  );
  providers.push(
    new HackerNewsSourceProvider(
      new HttpHackerNewsClient(
        positiveIntegerEnv(process.env.HACKER_NEWS_TIMEOUT_MS, 10_000),
      ),
      clock,
    ),
    new RedditSourceProvider(
      new HttpRedditClient(),
      redditTokenProvider ?? undefined,
      RedditRefreshTokenProvider.fromEnvironment(process.env),
    ),
    new RssSourceProvider(
      new HttpRssClient(positiveIntegerEnv(process.env.RSS_TIMEOUT_MS, 10_000)),
    ),
  );
  const xCollectorAddress = process.env.X_COLLECTOR_GRPC_ADDRESS?.trim();
  if (xCollectorConfigured() && xCollectorAddress !== undefined) {
    providers.push(
      new XTwitterSourceProvider(
        GrpcXDailyCollectorClient.connect({
          address: xCollectorAddress,
          clock,
          options: {
            timeoutMs: positiveIntegerEnv(
              process.env.X_COLLECTOR_GRPC_TIMEOUT_MS,
              DEFAULT_X_COLLECTOR_GRPC_TIMEOUT_MS,
            ),
            serviceToken: optionalEnv(process.env.X_COLLECTOR_SERVICE_TOKEN),
          },
        }),
        clock,
      ),
    );
  }
  return providers;
};

export const xCollectorConfigured = (): boolean =>
  (process.env.X_COLLECTOR_ENABLED === "1" ||
    process.env.X_COLLECTOR_EXPERIMENTAL_ENABLED === "1") &&
  optionalEnv(process.env.X_COLLECTOR_GRPC_ADDRESS) !== undefined;

const optionalEnv = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
};

const positiveIntegerEnv = (
  value: string | undefined,
  fallback: number,
): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};
