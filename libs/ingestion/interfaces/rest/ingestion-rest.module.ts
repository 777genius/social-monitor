import { Module } from '@nestjs/common';

import { FakeSourceProvider } from '../../adapters/source/fake-source.provider';
import { FixtureHackerNewsClient } from '../../adapters/source/hacker-news/fixture-hacker-news-client';
import { HackerNewsSourceProvider } from '../../adapters/source/hacker-news/hacker-news-source.provider';
import { InMemorySourceProviderRegistry } from '../../adapters/source/in-memory-source-provider.registry';
import { sourceReadinessProfiles } from '../../adapters/source/source-readiness-profiles';
import { ListSourceProfilesUseCase } from '../../features/list-source-profiles/list-source-profiles.use-case';
import { SourceProfileController } from './source-profile.controller';

@Module({
  controllers: [SourceProfileController],
  providers: [
    FakeSourceProvider,
    FixtureHackerNewsClient,
    {
      provide: HackerNewsSourceProvider,
      useFactory: (client: FixtureHackerNewsClient) => new HackerNewsSourceProvider(client),
      inject: [FixtureHackerNewsClient],
    },
    {
      provide: InMemorySourceProviderRegistry,
      useFactory: (fakeProvider: FakeSourceProvider, hackerNewsProvider: HackerNewsSourceProvider) =>
        new InMemorySourceProviderRegistry([fakeProvider, hackerNewsProvider], sourceReadinessProfiles),
      inject: [FakeSourceProvider, HackerNewsSourceProvider],
    },
    {
      provide: ListSourceProfilesUseCase,
      useFactory: (registry: InMemorySourceProviderRegistry) => new ListSourceProfilesUseCase(registry),
      inject: [InMemorySourceProviderRegistry],
    },
  ],
})
export class IngestionRestModule {}
