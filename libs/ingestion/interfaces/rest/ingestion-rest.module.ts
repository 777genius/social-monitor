import { Module } from '@nestjs/common';
import { IdentityAuthorizationModule } from '@social-monitor/identity/interfaces/authorization/identity-authorization.module';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';

import { InMemoryScanFailureQueueAdapter } from '../../adapters/queue/in-memory-scan-failure-queue.adapter';
import { FakeSourceProvider } from '../../adapters/source/fake-source.provider';
import { FixtureHackerNewsClient } from '../../adapters/source/hacker-news/fixture-hacker-news-client';
import { HackerNewsSourceProvider } from '../../adapters/source/hacker-news/hacker-news-source.provider';
import { InMemorySourceProviderRegistry } from '../../adapters/source/in-memory-source-provider.registry';
import { FixtureRssClient } from '../../adapters/source/rss/fixture-rss-client';
import { RssSourceProvider } from '../../adapters/source/rss/rss-source.provider';
import { sourceReadinessProfiles } from '../../adapters/source/source-readiness-profiles';
import { ListScanDeadLettersUseCase } from '../../features/list-scan-dead-letters/list-scan-dead-letters.use-case';
import { ListSourceProfilesUseCase } from '../../features/list-source-profiles/list-source-profiles.use-case';
import { ScanDeadLetterController } from './scan-dead-letter.controller';
import { SourceProfileController } from './source-profile.controller';

@Module({
  imports: [IdentityAuthorizationModule],
  controllers: [SourceProfileController, ScanDeadLetterController],
  providers: [
    InMemoryMetricsRecorder,
    {
      provide: InMemoryScanFailureQueueAdapter,
      useFactory: (metrics: InMemoryMetricsRecorder) => new InMemoryScanFailureQueueAdapter(metrics),
      inject: [InMemoryMetricsRecorder],
    },
    FakeSourceProvider,
    FixtureHackerNewsClient,
    FixtureRssClient,
    {
      provide: HackerNewsSourceProvider,
      useFactory: (client: FixtureHackerNewsClient) => new HackerNewsSourceProvider(client),
      inject: [FixtureHackerNewsClient],
    },
    {
      provide: RssSourceProvider,
      useFactory: (client: FixtureRssClient) => new RssSourceProvider(client),
      inject: [FixtureRssClient],
    },
    {
      provide: InMemorySourceProviderRegistry,
      useFactory: (
        fakeProvider: FakeSourceProvider,
        hackerNewsProvider: HackerNewsSourceProvider,
        rssProvider: RssSourceProvider,
      ) =>
        new InMemorySourceProviderRegistry(
          [fakeProvider, hackerNewsProvider, rssProvider],
          sourceReadinessProfiles,
        ),
      inject: [FakeSourceProvider, HackerNewsSourceProvider, RssSourceProvider],
    },
    {
      provide: ListSourceProfilesUseCase,
      useFactory: (registry: InMemorySourceProviderRegistry) => new ListSourceProfilesUseCase(registry),
      inject: [InMemorySourceProviderRegistry],
    },
    {
      provide: ListScanDeadLettersUseCase,
      useFactory: (failures: InMemoryScanFailureQueueAdapter) => new ListScanDeadLettersUseCase(failures),
      inject: [InMemoryScanFailureQueueAdapter],
    },
  ],
  exports: [InMemoryScanFailureQueueAdapter, ListScanDeadLettersUseCase],
})
export class IngestionRestModule {}
