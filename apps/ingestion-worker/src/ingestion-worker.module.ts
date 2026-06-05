import { Module } from '@nestjs/common';
import { CryptoIdGenerator, SystemClock } from '@social-monitor/shared-kernel';

import { WorkerRuntimeModule } from '@social-monitor/platform-worker';
import { FakeSourceFetcherAdapter } from '../../../libs/ingestion/adapters/source/fake-source-fetcher.adapter';
import { InMemorySourceItemRepository } from '../../../libs/ingestion/adapters/persistence/in-memory-source-item.repository';
import { ExecuteScanUseCase } from '../../../libs/ingestion/features/execute-scan/execute-scan.use-case';
import { ExecuteScanCommandHandler } from '../../../libs/ingestion/interfaces/queue/execute-scan-command.handler';

@Module({
  imports: [WorkerRuntimeModule.register({ serviceName: 'ingestion-worker' })],
  providers: [
    FakeSourceFetcherAdapter,
    InMemorySourceItemRepository,
    {
      provide: ExecuteScanUseCase,
      useFactory: (
        sourceFetcher: FakeSourceFetcherAdapter,
        sourceItems: InMemorySourceItemRepository,
      ) =>
        new ExecuteScanUseCase(
          sourceFetcher,
          sourceItems,
          new CryptoIdGenerator(),
          new SystemClock(),
        ),
      inject: [FakeSourceFetcherAdapter, InMemorySourceItemRepository],
    },
    {
      provide: ExecuteScanCommandHandler,
      useFactory: (executeScan: ExecuteScanUseCase) => new ExecuteScanCommandHandler(executeScan),
      inject: [ExecuteScanUseCase],
    },
  ],
  exports: [ExecuteScanCommandHandler, InMemorySourceItemRepository],
})
export class IngestionWorkerModule {}
