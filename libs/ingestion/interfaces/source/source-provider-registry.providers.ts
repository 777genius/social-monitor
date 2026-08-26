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

import { CircuitBreakerSourceFetcherAdapter } from '../../adapters/source/circuit-breaker-source-fetcher.adapter';
import { FakeSourceProvider } from '../../adapters/source/fake-source.provider';
import {
  GITHUB_ISSUES_PROVIDER_KEY,
  GitHubSourceProvider,
  LEGACY_GITHUB_ISSUES_PROVIDER_KEY,
} from '../../adapters/source/github/github-source.provider';
import { HttpGitHubClient } from '../../adapters/source/github/http-github-client';
import { BigQueryGitHubRepoRadarClient } from '../../adapters/source/github-repo-radar/bigquery-github-repo-radar-client';
import { GitHubRepoRadarSourceProvider } from '../../adapters/source/github-repo-radar/github-repo-radar-source.provider';
import { GitHubRepositoryLiveVerifierAdapter } from '../../adapters/source/github-repo-radar/github-repository-live-verifier.adapter';
import { GitHubTrendingPageSourceProvider } from '../../adapters/source/github-trending-page/github-trending-page-source.provider';
import { HttpGitHubTrendingPageClient } from '../../adapters/source/github-trending-page/http-github-trending-page-client';
import { HackerNewsSourceProvider } from '../../adapters/source/hacker-news/hacker-news-source.provider';
import { HttpHackerNewsClient } from '../../adapters/source/hacker-news/http-hacker-news-client';
import { InMemorySourceProviderRegistry } from '../../adapters/source/in-memory-source-provider.registry';
import { MonitoringSourceConfigReaderAdapter } from '../../adapters/source/monitoring-source-config-reader.adapter';
import { RegistrySourceFetcherAdapter } from '../../adapters/source/registry-source-fetcher.adapter';
import { RedditAppOnlyTokenProvider } from '../../adapters/source/reddit/app-only-reddit-token-provider';
import { HttpRedditClient } from '../../adapters/source/reddit/http-reddit-client';
import { RedditRefreshTokenProvider } from '../../adapters/source/reddit/refresh-token-reddit-token-provider';
import { RedditSourceProvider } from '../../adapters/source/reddit/reddit-source.provider';
import { HttpRssClient } from '../../adapters/source/rss/http-rss-client';
import { RssSourceProvider } from '../../adapters/source/rss/rss-source.provider';
import { SocialResearchSourceQueryPlannerAdapter } from '../../adapters/source/social-research-source-query-planner.adapter';
import { sourceReadinessProfilesForRuntime } from '../../adapters/source/source-readiness-profiles';
import { selectRuntimeSourceProviders } from '../../adapters/source/source-provider-runtime-scope';
import { GrpcXDailyCollectorClient } from '../../adapters/source/x-twitter-experimental-daily/grpc-x-daily-collector-client';
import {
  X_TWITTER_EXPERIMENTAL_DAILY_PROVIDER_KEY,
  X_TWITTER_PROVIDER_KEY,
  XTwitterSourceProvider,
} from '../../adapters/source/x-twitter-experimental-daily/x-twitter-experimental-daily-source.provider';
import type {
  SourceConfigReaderPort,
  SourceProviderPort,
} from '../../ports';
import {
  INGESTION_SOURCE_PROVIDER_RUNTIME_SETTINGS,
  sourceProviderRuntimeSettingsProvider,
  type SourceProviderRuntimeSettings,
} from './source-provider-registry-provider-tokens';

const X_TWITTER_EXPERIMENTAL_DAILY_PROVIDER = Symbol(
  'X_TWITTER_EXPERIMENTAL_DAILY_PROVIDER',
);

export const githubRepoRadarSourceProviderProviders: readonly Provider[] = [
  {
    provide: BigQueryGitHubRepoRadarClient,
    useFactory: (settings: SourceProviderRuntimeSettings) =>
      new BigQueryGitHubRepoRadarClient(settings.githubRepoRadarBigQuery),
    inject: [INGESTION_SOURCE_PROVIDER_RUNTIME_SETTINGS],
  },
  {
    provide: GitHubRepositoryLiveVerifierAdapter,
    useFactory: (client: HttpGitHubClient) =>
      new GitHubRepositoryLiveVerifierAdapter(client),
    inject: [HttpGitHubClient],
  },
  {
    provide: GitHubRepoRadarSourceProvider,
    useFactory: (
      radarClient: BigQueryGitHubRepoRadarClient,
      liveVerifier: GitHubRepositoryLiveVerifierAdapter,
    ) =>
      new GitHubRepoRadarSourceProvider(
        radarClient,
        liveVerifier,
        new SystemClock(),
      ),
    inject: [BigQueryGitHubRepoRadarClient, GitHubRepositoryLiveVerifierAdapter],
  },
];

export const sourceProviderRegistryProviders: readonly Provider[] = [
  sourceProviderRuntimeSettingsProvider,
  FakeSourceProvider,
  SocialResearchSourceQueryPlannerAdapter,
  {
    provide: HttpGitHubClient,
    useFactory: () => new HttpGitHubClient(),
  },
  ...githubRepoRadarSourceProviderProviders,
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
      new HackerNewsSourceProvider(client, new SystemClock()),
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
    useFactory: (
      settings: SourceProviderRuntimeSettings,
    ): RedditAppOnlyTokenProvider | null =>
      settings.redditAppOnlyToken === null
        ? null
        : new RedditAppOnlyTokenProvider(settings.redditAppOnlyToken),
    inject: [INGESTION_SOURCE_PROVIDER_RUNTIME_SETTINGS],
  },
  {
    provide: RedditRefreshTokenProvider,
    useFactory: (settings: SourceProviderRuntimeSettings) =>
      new RedditRefreshTokenProvider(settings.redditRefreshToken),
    inject: [INGESTION_SOURCE_PROVIDER_RUNTIME_SETTINGS],
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
    useFactory: (
      settings: SourceProviderRuntimeSettings,
    ): SourceProviderPort | null => {
      const config = settings.xCollector;
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

      return new XTwitterSourceProvider(collectorClient, clock);
    },
    inject: [INGESTION_SOURCE_PROVIDER_RUNTIME_SETTINGS],
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
      settings: SourceProviderRuntimeSettings,
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
          settings.scope,
        ),
        sourceReadinessProfilesForRuntime(settings.scope),
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
      INGESTION_SOURCE_PROVIDER_RUNTIME_SETTINGS,
    ],
  },
  {
    provide: RegistrySourceFetcherAdapter,
    useFactory: (
      registry: InMemorySourceProviderRegistry,
      sourceConfigReader: SourceConfigReaderPort,
      sourceQueryPlanner: SocialResearchSourceQueryPlannerAdapter,
    ) =>
      new RegistrySourceFetcherAdapter(
        registry,
        sourceConfigReader,
        sourceQueryPlanner,
      ),
    inject: [
      InMemorySourceProviderRegistry,
      MonitoringSourceConfigReaderAdapter,
      SocialResearchSourceQueryPlannerAdapter,
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
      new CircuitBreakerSourceFetcherAdapter(sourceFetcher, new SystemClock(), {
        failureThreshold: 3,
        cooldownSeconds: 60,
      }),
    inject: [RegistrySourceFetcherAdapter],
  },
];
