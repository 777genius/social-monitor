import { Module } from '@nestjs/common';
import { InMemoryFeedItemReadRepository } from '@social-monitor/feed/adapters/persistence/in-memory-feed-item-read.repository';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { CryptoIdGenerator, SystemClock } from '@social-monitor/shared-kernel';

import { WorkerRuntime, WorkerRuntimeModule } from '@social-monitor/platform-worker';
import { NoopScanExecutionReporterAdapter } from '../../../libs/ingestion/adapters/reporting/noop-scan-execution-reporter.adapter';
import { InMemoryScanLeaseAdapter } from '../../../libs/ingestion/adapters/lease/in-memory-scan-lease.adapter';
import { InMemoryScanAttemptRepository } from '../../../libs/ingestion/adapters/persistence/in-memory-scan-attempt.repository';
import { InMemoryScanCursorRepository } from '../../../libs/ingestion/adapters/persistence/in-memory-scan-cursor.repository';
import { InMemorySourceItemRepository } from '../../../libs/ingestion/adapters/persistence/in-memory-source-item.repository';
import { InMemoryScanFailureQueueAdapter } from '../../../libs/ingestion/adapters/queue/in-memory-scan-failure-queue.adapter';
import { CircuitBreakerSourceFetcherAdapter } from '../../../libs/ingestion/adapters/source/circuit-breaker-source-fetcher.adapter';
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
    {
      provide: CircuitBreakerSourceFetcherAdapter,
      useFactory: (sourceFetcher: FakeSourceFetcherAdapter) =>
        new CircuitBreakerSourceFetcherAdapter(sourceFetcher, new SystemClock(), {
          failureThreshold: 3,
          cooldownSeconds: 60,
        }),
      inject: [FakeSourceFetcherAdapter],
    },
    InMemoryScanAttemptRepository,
    InMemoryScanCursorRepository,
    {
      provide: InMemoryScanFailureQueueAdapter,
      useFactory: (metrics: InMemoryMetricsRecorder) => new InMemoryScanFailureQueueAdapter(metrics),
      inject: [InMemoryMetricsRecorder],
    },
    InMemoryScanLeaseAdapter,
    InMemoryMetricsRecorder,
    NoopScanExecutionReporterAdapter,
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
        sourceFetcher: CircuitBreakerSourceFetcherAdapter,
        sourceItems: InMemorySourceItemRepository,
        feedProjection: InMemoryFeedProjectionAdapter,
        scanAttempts: InMemoryScanAttemptRepository,
        scanCursors: InMemoryScanCursorRepository,
        scanExecutionReporter: NoopScanExecutionReporterAdapter,
        scanFailures: InMemoryScanFailureQueueAdapter,
        scanLeases: InMemoryScanLeaseAdapter,
      ) =>
        new ExecuteScanUseCase(
          sourceFetcher,
          sourceItems,
          feedProjection,
          scanAttempts,
          scanCursors,
          scanExecutionReporter,
          scanFailures,
          scanLeases,
          new CryptoIdGenerator(),
          new SystemClock(),
        ),
      inject: [
        CircuitBreakerSourceFetcherAdapter,
        InMemorySourceItemRepository,
        InMemoryFeedProjectionAdapter,
        InMemoryScanAttemptRepository,
        InMemoryScanCursorRepository,
        NoopScanExecutionReporterAdapter,
        InMemoryScanFailureQueueAdapter,
        InMemoryScanLeaseAdapter,
      ],
    },
    {
      provide: ExecuteScanCommandHandler,
      useFactory: (executeScan: ExecuteScanUseCase, metrics: InMemoryMetricsRecorder, runtime: WorkerRuntime) =>
        new ExecuteScanCommandHandler(executeScan, metrics, runtime),
      inject: [ExecuteScanUseCase, InMemoryMetricsRecorder, WorkerRuntime],
    },
  ],
  exports: [
    ExecuteScanCommandHandler,
    InMemoryScanAttemptRepository,
    InMemoryScanCursorRepository,
    InMemoryScanFailureQueueAdapter,
    InMemoryScanLeaseAdapter,
    InMemoryMetricsRecorder,
    NoopScanExecutionReporterAdapter,
    InMemorySourceItemRepository,
    InMemoryFeedItemReadRepository,
    InMemorySourceProviderRegistry,
    CircuitBreakerSourceFetcherAdapter,
  ],
})
export class IngestionWorkerModule {}
