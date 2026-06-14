import { Module } from '@nestjs/common';
import { InMemoryFeedItemReadRepository } from '@social-monitor/feed/adapters/persistence/in-memory-feed-item-read.repository';
import { MonitoringScanExecutionReporterAdapter } from '@social-monitor/monitoring/adapters/reporting/monitoring-scan-execution-reporter.adapter';
import { RecordScanExecutionUseCase } from '@social-monitor/monitoring/features/record-scan-execution/record-scan-execution.use-case';
import { MonitoringRestModule } from '@social-monitor/monitoring/interfaces/rest/monitoring-rest.module';
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
import { FakeSourceProvider } from '../../../libs/ingestion/adapters/source/fake-source.provider';
import { HackerNewsSourceProvider } from '../../../libs/ingestion/adapters/source/hacker-news/hacker-news-source.provider';
import { HttpHackerNewsClient } from '../../../libs/ingestion/adapters/source/hacker-news/http-hacker-news-client';
import { InMemorySourceProviderRegistry } from '../../../libs/ingestion/adapters/source/in-memory-source-provider.registry';
import { RegistrySourceFetcherAdapter } from '../../../libs/ingestion/adapters/source/registry-source-fetcher.adapter';
import { HttpRssClient } from '../../../libs/ingestion/adapters/source/rss/http-rss-client';
import { RssSourceProvider } from '../../../libs/ingestion/adapters/source/rss/rss-source.provider';
import { sourceReadinessProfiles } from '../../../libs/ingestion/adapters/source/source-readiness-profiles';
import { ExecuteScanUseCase } from '../../../libs/ingestion/features/execute-scan/execute-scan.use-case';
import { ExecuteScanCommandHandler } from '../../../libs/ingestion/interfaces/queue/execute-scan-command.handler';
import type { ScanExecutionReporterPort } from '../../../libs/ingestion/ports';
import { InMemoryFeedProjectionAdapter } from './adapters/feed/in-memory-feed-projection.adapter';
import {
  INGESTION_SCAN_EXECUTION_REPORTER,
  INGESTION_SCAN_REPORTER_MODE,
  type IngestionScanReporterMode,
  resolveIngestionScanReporterMode,
} from './ingestion-worker-provider-tokens';

@Module({
  imports: [WorkerRuntimeModule.register({ serviceName: 'ingestion-worker' }), MonitoringRestModule],
  providers: [
    {
      provide: INGESTION_SCAN_REPORTER_MODE,
      useFactory: () => resolveIngestionScanReporterMode(process.env),
    },
    FakeSourceProvider,
    {
      provide: HttpHackerNewsClient,
      useFactory: () => new HttpHackerNewsClient(),
    },
    {
      provide: HackerNewsSourceProvider,
      useFactory: (client: HttpHackerNewsClient) => new HackerNewsSourceProvider(client),
      inject: [HttpHackerNewsClient],
    },
    {
      provide: HttpRssClient,
      useFactory: () => new HttpRssClient(),
    },
    {
      provide: RssSourceProvider,
      useFactory: (client: HttpRssClient) => new RssSourceProvider(client),
      inject: [HttpRssClient],
    },
    {
      provide: InMemorySourceProviderRegistry,
      useFactory: (
        fakeProvider: FakeSourceProvider,
        hackerNewsProvider: HackerNewsSourceProvider,
        rssProvider: RssSourceProvider,
      ) =>
        new InMemorySourceProviderRegistry([fakeProvider, hackerNewsProvider, rssProvider], sourceReadinessProfiles),
      inject: [FakeSourceProvider, HackerNewsSourceProvider, RssSourceProvider],
    },
    {
      provide: RegistrySourceFetcherAdapter,
      useFactory: (registry: InMemorySourceProviderRegistry) => new RegistrySourceFetcherAdapter(registry),
      inject: [InMemorySourceProviderRegistry],
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
    {
      provide: INGESTION_SCAN_EXECUTION_REPORTER,
      useFactory: (
        mode: IngestionScanReporterMode,
        noopReporter: NoopScanExecutionReporterAdapter,
        recordScanExecution: RecordScanExecutionUseCase,
      ): ScanExecutionReporterPort =>
        mode === 'monitoring'
          ? new MonitoringScanExecutionReporterAdapter(recordScanExecution)
          : noopReporter,
      inject: [INGESTION_SCAN_REPORTER_MODE, NoopScanExecutionReporterAdapter, RecordScanExecutionUseCase],
    },
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
        scanExecutionReporter: ScanExecutionReporterPort,
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
        INGESTION_SCAN_EXECUTION_REPORTER,
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
    INGESTION_SCAN_EXECUTION_REPORTER,
    InMemorySourceItemRepository,
    InMemoryFeedItemReadRepository,
    InMemorySourceProviderRegistry,
    RegistrySourceFetcherAdapter,
    CircuitBreakerSourceFetcherAdapter,
  ],
})
export class IngestionWorkerModule {}
