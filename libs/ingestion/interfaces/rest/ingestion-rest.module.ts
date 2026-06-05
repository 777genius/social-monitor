import { Module } from '@nestjs/common';

import { FakeSourceProvider } from '../../adapters/source/fake-source.provider';
import { FixtureHackerNewsClient } from '../../adapters/source/hacker-news/fixture-hacker-news-client';
import { HackerNewsSourceProvider } from '../../adapters/source/hacker-news/hacker-news-source.provider';
import { InMemorySourceProviderRegistry } from '../../adapters/source/in-memory-source-provider.registry';
import { FixtureRssClient } from '../../adapters/source/rss/fixture-rss-client';
import { RssSourceProvider } from '../../adapters/source/rss/rss-source.provider';
import { sourceReadinessProfiles } from '../../adapters/source/source-readiness-profiles';
import { ListSourceProfilesUseCase } from '../../features/list-source-profiles/list-source-profiles.use-case';
import { SourceProfileController } from './source-profile.controller';

@Module({
  controllers: [SourceProfileController],
  providers: [
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
  ],
})
export class IngestionRestModule {}
