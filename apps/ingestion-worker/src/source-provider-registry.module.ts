import type { Provider } from '@nestjs/common';
import {
  MONITORING_CONFIG_PROTECTOR,
  MONITORING_SOURCE_BINDING_REPOSITORY,
  MONITORING_SOURCE_CREDENTIAL_RESOLVER,
} from '@social-monitor/monitoring/interfaces/rest/monitoring-provider-tokens';
import type {
  SourceBindingConfigProtectorPort,
  SourceBindingRepositoryPort,
  SourceCredentialResolverPort,
} from '@social-monitor/monitoring/ports';
import { SystemClock } from '@social-monitor/shared-kernel';
import { CircuitBreakerSourceFetcherAdapter } from '@social-monitor/ingestion/adapters/source/circuit-breaker-source-fetcher.adapter';
import { FakeSourceProvider } from '@social-monitor/ingestion/adapters/source/fake-source.provider';
import {
  GITHUB_ISSUES_PROVIDER_KEY,
  GitHubSourceProvider,
  LEGACY_GITHUB_ISSUES_PROVIDER_KEY,
} from '@social-monitor/ingestion/adapters/source/github/github-source.provider';
import { HttpGitHubClient } from '@social-monitor/ingestion/adapters/source/github/http-github-client';
import { GitHubRepoRadarSourceProvider } from '@social-monitor/ingestion/adapters/source/github-repo-radar/github-repo-radar-source.provider';
import { GitHubTrendingPageSourceProvider } from '@social-monitor/ingestion/adapters/source/github-trending-page/github-trending-page-source.provider';
import { HttpGitHubTrendingPageClient } from '@social-monitor/ingestion/adapters/source/github-trending-page/http-github-trending-page-client';
import { HackerNewsSourceProvider } from '@social-monitor/ingestion/adapters/source/hacker-news/hacker-news-source.provider';
import { HttpHackerNewsClient } from '@social-monitor/ingestion/adapters/source/hacker-news/http-hacker-news-client';
import { InMemorySourceProviderRegistry } from '@social-monitor/ingestion/adapters/source/in-memory-source-provider.registry';
import { RegistrySourceFetcherAdapter } from '@social-monitor/ingestion/adapters/source/registry-source-fetcher.adapter';
import { HttpRedditClient } from '@social-monitor/ingestion/adapters/source/reddit/http-reddit-client';
import { RedditAppOnlyTokenProvider } from '@social-monitor/ingestion/adapters/source/reddit/app-only-reddit-token-provider';
import { RedditRefreshTokenProvider } from '@social-monitor/ingestion/adapters/source/reddit/refresh-token-reddit-token-provider';
import { RedditSourceProvider } from '@social-monitor/ingestion/adapters/source/reddit/reddit-source.provider';
import { HttpRssClient } from '@social-monitor/ingestion/adapters/source/rss/http-rss-client';
import { RssSourceProvider } from '@social-monitor/ingestion/adapters/source/rss/rss-source.provider';
import { sourceReadinessProfiles } from '@social-monitor/ingestion/adapters/source/source-readiness-profiles';
import { selectRuntimeSourceProviders } from '@social-monitor/ingestion/adapters/source/source-provider-runtime-scope';
import { GrpcXDailyCollectorClient } from '@social-monitor/ingestion/adapters/source/x-twitter-experimental-daily/grpc-x-daily-collector-client';
import {
  X_TWITTER_EXPERIMENTAL_DAILY_PROVIDER_KEY,
  X_TWITTER_PROVIDER_KEY,
  XTwitterSourceProvider,
} from '@social-monitor/ingestion/adapters/source/x-twitter-experimental-daily/x-twitter-experimental-daily-source.provider';
import type { SourceConfigReaderPort, SourceProviderPort } from '@social-monitor/ingestion/ports';

import { githubRepoRadarProviders } from './github-repo-radar.module';
import { MonitoringSourceConfigReaderAdapter } from './adapters/source/monitoring-source-config-reader.adapter';

const X_TWITTER_EXPERIMENTAL_DAILY_PROVIDER = Symbol('X_TWITTER_EXPERIMENTAL_DAILY_PROVIDER');

export const sourceProviderRegistryProviders: Provider[] = [
  FakeSourceProvider,
  {
    provide: HttpGitHubClient,
    useFactory: () => new HttpGitHubClient(),
  },
  ...githubRepoRadarProviders,
  {
    provide: HttpGitHubTrendingPageClient,
    useFactory: () => new HttpGitHubTrendingPageClient(),
  },
  {
    provide: GitHubTrendingPageSourceProvider,
    useFactory: (client: HttpGitHubTrendingPageClient) =>
      new GitHubTrendingPageSourceProvider(client, new SystemClock()),
    inject: [HttpGitHubTrendingPageClient],
  },
  {
    provide: GitHubSourceProvider,
    useFactory: (client: HttpGitHubClient) => new GitHubSourceProvider(client),
    inject: [HttpGitHubClient],
  },
  {
    provide: HttpHackerNewsClient,
    useFactory: () => new HttpHackerNewsClient(),
  },
  {
    provide: HackerNewsSourceProvider,
    useFactory: (client: HttpHackerNewsClient) =>
      new HackerNewsSourceProvider(client),
    inject: [HttpHackerNewsClient],
  },
  {
    provide: HttpRssClient,
    useFactory: () => new HttpRssClient(),
  },
  {
    provide: HttpRedditClient,
    useFactory: () => new HttpRedditClient(),
  },
  {
    provide: RedditAppOnlyTokenProvider,
    useFactory: (): RedditAppOnlyTokenProvider | null =>
      RedditAppOnlyTokenProvider.fromEnvironment(process.env),
  },
  {
    provide: RedditRefreshTokenProvider,
    useFactory: (): RedditRefreshTokenProvider =>
      RedditRefreshTokenProvider.fromEnvironment(process.env),
  },
  {
    provide: RssSourceProvider,
    useFactory: (client: HttpRssClient) => new RssSourceProvider(client),
    inject: [HttpRssClient],
  },
  {
    provide: RedditSourceProvider,
    useFactory: (
      client: HttpRedditClient,
      tokenProvider: RedditAppOnlyTokenProvider | null,
      refreshTokenProvider: RedditRefreshTokenProvider,
    ) =>
      new RedditSourceProvider(
        client,
        tokenProvider ?? undefined,
        refreshTokenProvider,
      ),
    inject: [
      HttpRedditClient,
      RedditAppOnlyTokenProvider,
      RedditRefreshTokenProvider,
    ],
  },
  {
    provide: X_TWITTER_EXPERIMENTAL_DAILY_PROVIDER,
    useFactory: (): SourceProviderPort | null => {
      const config = resolveXCollectorConfig(process.env);
      if (config === null) {
        return null;
      }

      const clock = new SystemClock();
      const collectorClient = GrpcXDailyCollectorClient.connect({
        address: config.address,
        clock,
        options: {
          timeoutMs: config.timeoutMs,
          serviceToken: config.serviceToken,
        },
      });

      return new XTwitterSourceProvider(
        collectorClient,
        clock,
      );
    },
  },
  {
    provide: InMemorySourceProviderRegistry,
    useFactory: (
      fakeProvider: FakeSourceProvider,
      githubProvider: GitHubSourceProvider,
      githubRepoRadarProvider: GitHubRepoRadarSourceProvider,
      githubTrendingPageProvider: GitHubTrendingPageSourceProvider,
      hackerNewsProvider: HackerNewsSourceProvider,
      redditProvider: RedditSourceProvider,
      rssProvider: RssSourceProvider,
      xTwitterExperimentalDailyProvider: SourceProviderPort | null,
    ) =>
      new InMemorySourceProviderRegistry(
        selectRuntimeSourceProviders(
          [
            fakeProvider,
            githubProvider,
            githubRepoRadarProvider,
            githubTrendingPageProvider,
            hackerNewsProvider,
            redditProvider,
            rssProvider,
            ...(xTwitterExperimentalDailyProvider === null
              ? []
              : [xTwitterExperimentalDailyProvider]),
          ],
          process.env,
        ),
        sourceReadinessProfiles,
        [
          {
            providerKey: LEGACY_GITHUB_ISSUES_PROVIDER_KEY,
            canonicalProviderKey: GITHUB_ISSUES_PROVIDER_KEY,
          },
          {
            providerKey: X_TWITTER_EXPERIMENTAL_DAILY_PROVIDER_KEY,
            canonicalProviderKey: X_TWITTER_PROVIDER_KEY,
          },
        ],
      ),
    inject: [
      FakeSourceProvider,
      GitHubSourceProvider,
      GitHubRepoRadarSourceProvider,
      GitHubTrendingPageSourceProvider,
      HackerNewsSourceProvider,
      RedditSourceProvider,
      RssSourceProvider,
      X_TWITTER_EXPERIMENTAL_DAILY_PROVIDER,
    ],
  },
  {
    provide: RegistrySourceFetcherAdapter,
    useFactory: (
      registry: InMemorySourceProviderRegistry,
      sourceConfigReader: SourceConfigReaderPort,
    ) => new RegistrySourceFetcherAdapter(registry, sourceConfigReader),
    inject: [
      InMemorySourceProviderRegistry,
      MonitoringSourceConfigReaderAdapter,
    ],
  },
  {
    provide: MonitoringSourceConfigReaderAdapter,
    useFactory: (
      sourceBindings: SourceBindingRepositoryPort,
      configProtector: SourceBindingConfigProtectorPort,
      sourceCredentials: SourceCredentialResolverPort,
    ) =>
      new MonitoringSourceConfigReaderAdapter(
        sourceBindings,
        configProtector,
        sourceCredentials,
      ),
    inject: [
      MONITORING_SOURCE_BINDING_REPOSITORY,
      MONITORING_CONFIG_PROTECTOR,
      MONITORING_SOURCE_CREDENTIAL_RESOLVER,
    ],
  },
  {
    provide: CircuitBreakerSourceFetcherAdapter,
    useFactory: (sourceFetcher: RegistrySourceFetcherAdapter) =>
      new CircuitBreakerSourceFetcherAdapter(
        sourceFetcher,
        new SystemClock(),
        {
          failureThreshold: 3,
          cooldownSeconds: 60,
        },
      ),
    inject: [RegistrySourceFetcherAdapter],
  },
];

type XCollectorRuntimeConfig = {
  readonly address: string;
  readonly timeoutMs: number;
  readonly serviceToken?: string;
};

const resolveXCollectorConfig = (
  env: NodeJS.ProcessEnv,
): XCollectorRuntimeConfig | null => {
  if (env.X_COLLECTOR_ENABLED !== '1' && env.X_COLLECTOR_EXPERIMENTAL_ENABLED !== '1') {
    return null;
  }

  const address = env.X_COLLECTOR_GRPC_ADDRESS?.trim();
  if (address === undefined || address.length === 0) {
    return null;
  }

  return {
    address,
    timeoutMs: readPositiveEnvInteger(env.X_COLLECTOR_GRPC_TIMEOUT_MS, 60_000),
    serviceToken: readOptionalEnvString(env.X_COLLECTOR_SERVICE_TOKEN),
  };
};

const readPositiveEnvInteger = (
  value: string | undefined,
  fallback: number,
): number => {
  if (value === undefined || value.trim().length === 0) {
    return fallback;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const readOptionalEnvString = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();

  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
};
