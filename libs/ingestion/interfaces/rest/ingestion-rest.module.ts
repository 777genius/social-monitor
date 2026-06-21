import { Module } from '@nestjs/common';
import { IdentityRestModule } from '@social-monitor/identity/interfaces/rest/identity-rest.module';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { CryptoIdGenerator } from '@social-monitor/shared-kernel';

import { PrismaIngestionConnection } from '../../adapters/persistence/prisma/prisma-ingestion-connection';
import type { PrismaIngestionClient } from '../../adapters/persistence/prisma/prisma-ingestion-client';
import { PrismaScanFailureQueueAdapter } from '../../adapters/persistence/prisma/prisma-scan-failure-queue.adapter';
import { InMemoryScanFailureQueueAdapter } from '../../adapters/queue/in-memory-scan-failure-queue.adapter';
import { FakeSourceProvider } from '../../adapters/source/fake-source.provider';
import { FixtureGitHubClient } from '../../adapters/source/github/fixture-github-client';
import { GitHubSourceProvider } from '../../adapters/source/github/github-source.provider';
import { FixtureHackerNewsClient } from '../../adapters/source/hacker-news/fixture-hacker-news-client';
import { HackerNewsSourceProvider } from '../../adapters/source/hacker-news/hacker-news-source.provider';
import { InMemorySourceProviderRegistry } from '../../adapters/source/in-memory-source-provider.registry';
import { FixtureRedditClient } from '../../adapters/source/reddit/fixture-reddit-client';
import { RedditSourceProvider } from '../../adapters/source/reddit/reddit-source.provider';
import { StaticRedditTokenProvider } from '../../adapters/source/reddit/static-reddit-token-provider';
import { FixtureRssClient } from '../../adapters/source/rss/fixture-rss-client';
import { RssSourceProvider } from '../../adapters/source/rss/rss-source.provider';
import { sourceReadinessProfiles } from '../../adapters/source/source-readiness-profiles';
import { selectRuntimeSourceProviders } from '../../adapters/source/source-provider-runtime-scope';
import { ListScanDeadLettersUseCase } from '../../features/list-scan-dead-letters/list-scan-dead-letters.use-case';
import { ListSourceProfilesUseCase } from '../../features/list-source-profiles/list-source-profiles.use-case';
import type { ScanFailureInspectionPort } from '../../ports';
import {
  INGESTION_SCAN_FAILURE_INSPECTION,
  INGESTION_SUPPORT_PERSISTENCE_MODE,
  INGESTION_SUPPORT_PRISMA_CLIENT,
  type IngestionSupportPersistenceMode,
  ingestionSupportPersistenceModeProvider,
} from './ingestion-provider-tokens';
import { ScanDeadLetterController } from './scan-dead-letter.controller';
import { SourceProfileController } from './source-profile.controller';

@Module({
  imports: [IdentityRestModule],
  controllers: [SourceProfileController, ScanDeadLetterController],
  providers: [
    ingestionSupportPersistenceModeProvider,
    {
      provide: INGESTION_SUPPORT_PRISMA_CLIENT,
      useFactory: (mode: IngestionSupportPersistenceMode): PrismaIngestionClient | null =>
        mode === 'prisma' ? new PrismaIngestionConnection(process.env.DATABASE_URL ?? '') : null,
      inject: [INGESTION_SUPPORT_PERSISTENCE_MODE],
    },
    InMemoryMetricsRecorder,
    {
      provide: InMemoryScanFailureQueueAdapter,
      useFactory: (metrics: InMemoryMetricsRecorder) => new InMemoryScanFailureQueueAdapter(metrics),
      inject: [InMemoryMetricsRecorder],
    },
    {
      provide: INGESTION_SCAN_FAILURE_INSPECTION,
      useFactory: (
        mode: IngestionSupportPersistenceMode,
        prisma: PrismaIngestionClient | null,
        inMemoryFailures: InMemoryScanFailureQueueAdapter,
        metrics: InMemoryMetricsRecorder,
      ): ScanFailureInspectionPort =>
        mode === 'prisma'
          ? new PrismaScanFailureQueueAdapter(requirePrismaIngestionClient(prisma), metrics, new CryptoIdGenerator())
          : inMemoryFailures,
      inject: [
        INGESTION_SUPPORT_PERSISTENCE_MODE,
        INGESTION_SUPPORT_PRISMA_CLIENT,
        InMemoryScanFailureQueueAdapter,
        InMemoryMetricsRecorder,
      ],
    },
    FakeSourceProvider,
    FixtureGitHubClient,
    FixtureHackerNewsClient,
    FixtureRedditClient,
    {
      provide: StaticRedditTokenProvider,
      useFactory: () => new StaticRedditTokenProvider('fixture-reddit-app-token'),
    },
    FixtureRssClient,
    {
      provide: HackerNewsSourceProvider,
      useFactory: (client: FixtureHackerNewsClient) => new HackerNewsSourceProvider(client),
      inject: [FixtureHackerNewsClient],
    },
    {
      provide: GitHubSourceProvider,
      useFactory: (client: FixtureGitHubClient) => new GitHubSourceProvider(client),
      inject: [FixtureGitHubClient],
    },
    {
      provide: RssSourceProvider,
      useFactory: (client: FixtureRssClient) => new RssSourceProvider(client),
      inject: [FixtureRssClient],
    },
    {
      provide: RedditSourceProvider,
      useFactory: (
        client: FixtureRedditClient,
        tokenProvider: StaticRedditTokenProvider,
      ) => new RedditSourceProvider(client, tokenProvider),
      inject: [FixtureRedditClient, StaticRedditTokenProvider],
    },
    {
      provide: InMemorySourceProviderRegistry,
      useFactory: (
        fakeProvider: FakeSourceProvider,
        githubProvider: GitHubSourceProvider,
        hackerNewsProvider: HackerNewsSourceProvider,
        redditProvider: RedditSourceProvider,
        rssProvider: RssSourceProvider,
      ) =>
        new InMemorySourceProviderRegistry(
          selectRuntimeSourceProviders(
            [fakeProvider, githubProvider, hackerNewsProvider, redditProvider, rssProvider],
            process.env,
          ),
          sourceReadinessProfiles,
        ),
      inject: [
        FakeSourceProvider,
        GitHubSourceProvider,
        HackerNewsSourceProvider,
        RedditSourceProvider,
        RssSourceProvider,
      ],
    },
    {
      provide: ListSourceProfilesUseCase,
      useFactory: (registry: InMemorySourceProviderRegistry) => new ListSourceProfilesUseCase(registry),
      inject: [InMemorySourceProviderRegistry],
    },
    {
      provide: ListScanDeadLettersUseCase,
      useFactory: (failures: ScanFailureInspectionPort) => new ListScanDeadLettersUseCase(failures),
      inject: [INGESTION_SCAN_FAILURE_INSPECTION],
    },
  ],
  exports: [InMemoryScanFailureQueueAdapter, INGESTION_SCAN_FAILURE_INSPECTION, ListScanDeadLettersUseCase],
})
export class IngestionRestModule {}

const requirePrismaIngestionClient = (client: PrismaIngestionClient | null): PrismaIngestionClient => {
  if (client === null) {
    throw new Error('Prisma ingestion client is required when INGESTION_SUPPORT_PERSISTENCE=prisma');
  }

  return client;
};
