import { Module } from '@nestjs/common';

import { FakeSourceProvider } from '../../adapters/source/fake-source.provider';
import { InMemorySourceProviderRegistry } from '../../adapters/source/in-memory-source-provider.registry';
import { sourceReadinessProfiles } from '../../adapters/source/source-readiness-profiles';
import { ListSourceProfilesUseCase } from '../../features/list-source-profiles/list-source-profiles.use-case';
import { SourceProfileController } from './source-profile.controller';

@Module({
  controllers: [SourceProfileController],
  providers: [
    FakeSourceProvider,
    {
      provide: InMemorySourceProviderRegistry,
      useFactory: (fakeProvider: FakeSourceProvider) =>
        new InMemorySourceProviderRegistry([fakeProvider], sourceReadinessProfiles),
      inject: [FakeSourceProvider],
    },
    {
      provide: ListSourceProfilesUseCase,
      useFactory: (registry: InMemorySourceProviderRegistry) => new ListSourceProfilesUseCase(registry),
      inject: [InMemorySourceProviderRegistry],
    },
  ],
})
export class IngestionRestModule {}
