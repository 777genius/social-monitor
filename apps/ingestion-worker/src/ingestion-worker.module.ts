import { Module } from '@nestjs/common';
import { InMemoryFeedItemReadRepository } from '@social-monitor/feed/adapters/persistence/in-memory-feed-item-read.repository';
import { PrismaFeedProjectionAdapter } from '@social-monitor/feed/adapters/persistence/prisma/prisma-feed-projection.adapter';
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
import { PrismaScanCursorRepository } from '../../../libs/ingestion/adapters/persistence/prisma/prisma-scan-cursor.repository';
import { PrismaSourceItemRepository } from '../../../libs/ingestion/adapters/persistence/prisma/prisma-source-item.repository';
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
import type {
  FeedProjectionPort,
  ScanCursorRepositoryPort,
  SourceItemRepositoryPort,
} from '../../../libs/ingestion/ports';
import { InMemoryFeedProjectionAdapter } from './adapters/feed/in-memory-feed-projection.adapter';
import {
  PrismaIngestionWorkerConnection,
  type PrismaIngestionWorkerClient,
} from './adapters/persistence/prisma-ingestion-worker-connection';
import {
  INGESTION_FEED_PROJECTION,
  INGESTION_SCAN_CURSOR_REPOSITORY,
  INGESTION_SCAN_EXECUTION_REPORTER,
  INGESTION_SCAN_REPORTER_MODE,
  INGESTION_SOURCE_ITEM_REPOSITORY,
  INGESTION_WORKER_PERSISTENCE_MODE,
  INGESTION_WORKER_PRISMA_CLIENT,
  type IngestionWorkerPersistenceMode,
  type IngestionScanReporterMode,
  resolveIngestionWorkerPersistenceMode,
  resolveIngestionScanReporterMode,
} from './ingestion-worker-provider-tokens';

@Module({
  imports: [WorkerRuntimeModule.register({ serviceName: 'ingestion-worker' }), MonitoringRestModule],
  providers: [
    {
      provide: INGESTION_WORKER_PERSISTENCE_MODE,
      useFactory: () => resolveIngestionWorkerPersistenceMode(process.env),
    },
    {
      provide: INGESTION_WORKER_PRISMA_CLIENT,
      useFactory: (mode: IngestionWorkerPersistenceMode): PrismaIngestionWorkerClient | null =>
        mode === 'prisma' ? new PrismaIngestionWorkerConnection(process.env.DATABASE_URL ?? '') : null,
      inject: [INGESTION_WORKER_PERSISTENCE_MODE],
    },
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
      provide: INGESTION_SOURCE_ITEM_REPOSITORY,
      useFactory: (
        mode: IngestionWorkerPersistenceMode,
        prisma: PrismaIngestionWorkerClient | null,
        inMemorySourceItems: InMemorySourceItemRepository,
      ): SourceItemRepositoryPort =>
        mode === 'prisma'
          ? new PrismaSourceItemRepository(requirePrismaIngestionWorkerClient(prisma))
          : inMemorySourceItems,
      inject: [INGESTION_WORKER_PERSISTENCE_MODE, INGESTION_WORKER_PRISMA_CLIENT, InMemorySourceItemRepository],
    },
    {
      provide: INGESTION_SCAN_CURSOR_REPOSITORY,
      useFactory: (
        mode: IngestionWorkerPersistenceMode,
        prisma: PrismaIngestionWorkerClient | null,
        inMemoryScanCursors: InMemoryScanCursorRepository,
      ): ScanCursorRepositoryPort =>
        mode === 'prisma'
          ? new PrismaScanCursorRepository(requirePrismaIngestionWorkerClient(prisma), new CryptoIdGenerator())
          : inMemoryScanCursors,
      inject: [INGESTION_WORKER_PERSISTENCE_MODE, INGESTION_WORKER_PRISMA_CLIENT, InMemoryScanCursorRepository],
    },
    {
      provide: INGESTION_FEED_PROJECTION,
      useFactory: (
        mode: IngestionWorkerPersistenceMode,
        prisma: PrismaIngestionWorkerClient | null,
        inMemoryFeedProjection: InMemoryFeedProjectionAdapter,
      ): FeedProjectionPort =>
        mode === 'prisma'
          ? new PrismaFeedProjectionAdapter(requirePrismaIngestionWorkerClient(prisma), new CryptoIdGenerator())
          : inMemoryFeedProjection,
      inject: [INGESTION_WORKER_PERSISTENCE_MODE, INGESTION_WORKER_PRISMA_CLIENT, InMemoryFeedProjectionAdapter],
    },
    {
      provide: ExecuteScanUseCase,
      useFactory: (
        sourceFetcher: CircuitBreakerSourceFetcherAdapter,
        sourceItems: SourceItemRepositoryPort,
        feedProjection: FeedProjectionPort,
        scanAttempts: InMemoryScanAttemptRepository,
        scanCursors: ScanCursorRepositoryPort,
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
        INGESTION_SOURCE_ITEM_REPOSITORY,
        INGESTION_FEED_PROJECTION,
        InMemoryScanAttemptRepository,
        INGESTION_SCAN_CURSOR_REPOSITORY,
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
    INGESTION_FEED_PROJECTION,
    INGESTION_SCAN_CURSOR_REPOSITORY,
    InMemorySourceProviderRegistry,
    INGESTION_SOURCE_ITEM_REPOSITORY,
    RegistrySourceFetcherAdapter,
    CircuitBreakerSourceFetcherAdapter,
  ],
})
export class IngestionWorkerModule {}

const requirePrismaIngestionWorkerClient = (
  client: PrismaIngestionWorkerClient | null,
): PrismaIngestionWorkerClient => {
  if (client === null) {
    throw new Error('Prisma ingestion worker client is required when INGESTION_WORKER_PERSISTENCE=prisma');
  }

  return client;
};
