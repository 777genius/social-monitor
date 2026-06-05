import { Module } from '@nestjs/common';
import { InMemoryFeedItemReadRepository } from '@social-monitor/feed/adapters/persistence/in-memory-feed-item-read.repository';
import { CryptoIdGenerator, SystemClock } from '@social-monitor/shared-kernel';

import { WorkerRuntimeModule } from '@social-monitor/platform-worker';
import { InMemoryScanAttemptRepository } from '../../../libs/ingestion/adapters/persistence/in-memory-scan-attempt.repository';
import { InMemorySourceItemRepository } from '../../../libs/ingestion/adapters/persistence/in-memory-source-item.repository';
import { FakeSourceFetcherAdapter } from '../../../libs/ingestion/adapters/source/fake-source-fetcher.adapter';
import { FakeSourceProvider } from '../../../libs/ingestion/adapters/source/fake-source.provider';
import { InMemorySourceProviderRegistry } from '../../../libs/ingestion/adapters/source/in-memory-source-provider.registry';
import { sourceReadinessProfiles } from '../../../libs/ingestion/adapters/source/source-readiness-profiles';
import { ExecuteScanUseCase } from '../../../libs/ingestion/features/execute-scan/execute-scan.use-case';
import { ExecuteScanCommandHandler } from '../../../libs/ingestion/interfaces/queue/execute-scan-command.handler';
import { InMemoryFeedProjectionAdapter } from './adapters/feed/in-memory-feed-projection.adapter';

@Module({
  imports: [WorkerRuntimeModule.register({ serviceName: 'ingestion-worker' })],
  providers: [
    FakeSourceProvider,
    {
      provide: InMemorySourceProviderRegistry,
      useFactory: (fakeProvider: FakeSourceProvider) =>
        new InMemorySourceProviderRegistry([fakeProvider], sourceReadinessProfiles),
      inject: [FakeSourceProvider],
    },
    {
      provide: FakeSourceFetcherAdapter,
      useFactory: (registry: InMemorySourceProviderRegistry) => new FakeSourceFetcherAdapter(registry),
      inject: [InMemorySourceProviderRegistry],
    },
    InMemoryScanAttemptRepository,
    InMemorySourceItemRepository,
    InMemoryFeedItemReadRepository,
    {
      provide: InMemoryFeedProjectionAdapter,
      useFactory: (feedItems: InMemoryFeedItemReadRepository) => new InMemoryFeedProjectionAdapter(feedItems),
      inject: [InMemoryFeedItemReadRepository],
    },
    {
      provide: ExecuteScanUseCase,
      useFactory: (
        sourceFetcher: FakeSourceFetcherAdapter,
        sourceItems: InMemorySourceItemRepository,
        feedProjection: InMemoryFeedProjectionAdapter,
        scanAttempts: InMemoryScanAttemptRepository,
      ) =>
        new ExecuteScanUseCase(
          sourceFetcher,
          sourceItems,
          feedProjection,
          scanAttempts,
          new CryptoIdGenerator(),
          new SystemClock(),
        ),
      inject: [
        FakeSourceFetcherAdapter,
        InMemorySourceItemRepository,
        InMemoryFeedProjectionAdapter,
        InMemoryScanAttemptRepository,
      ],
    },
    {
      provide: ExecuteScanCommandHandler,
      useFactory: (executeScan: ExecuteScanUseCase) => new ExecuteScanCommandHandler(executeScan),
      inject: [ExecuteScanUseCase],
    },
  ],
  exports: [
    ExecuteScanCommandHandler,
    InMemoryScanAttemptRepository,
    InMemorySourceItemRepository,
    InMemoryFeedItemReadRepository,
    InMemorySourceProviderRegistry,
  ],
})
export class IngestionWorkerModule {}
