import { Module } from '@nestjs/common';
import { InMemoryFeedItemReadRepository } from '@social-monitor/feed/adapters/persistence/in-memory-feed-item-read.repository';
import { MonitoringScanExecutionReporterAdapter } from '@social-monitor/monitoring/adapters/reporting/monitoring-scan-execution-reporter.adapter';
import { RecordScanExecutionUseCase } from '@social-monitor/monitoring/features/record-scan-execution/record-scan-execution.use-case';
import { ScheduleDueScansUseCase } from '@social-monitor/monitoring/features/schedule-due-scans/schedule-due-scans.use-case';
import { ScheduleDueScansCommandHandler } from '@social-monitor/monitoring/interfaces/queue/schedule-due-scans-command.handler';
import { MonitoringRestModule } from '@social-monitor/monitoring/interfaces/rest/monitoring-rest.module';
import { InMemoryMetricsRecorder, type MetricsRecorderPort } from '@social-monitor/platform-metrics';
import { METRICS_RECORDER, MetricsRuntimeModule } from '@social-monitor/platform-metrics/nest/metrics-runtime.module';
import { resolvePostgresRuntimePoolConfig } from '@social-monitor/platform-persistence';
import { SystemClock } from '@social-monitor/shared-kernel';
import { WorkerRuntime, WorkerRuntimeModule } from '@social-monitor/platform-worker';
import { InMemoryScanLeaseAdapter } from '@social-monitor/ingestion/adapters/lease/in-memory-scan-lease.adapter';
import { InMemoryScanAttemptRepository } from '@social-monitor/ingestion/adapters/persistence/in-memory-scan-attempt.repository';
import { InMemoryScanCursorRepository } from '@social-monitor/ingestion/adapters/persistence/in-memory-scan-cursor.repository';
import { InMemorySourceItemRepository } from '@social-monitor/ingestion/adapters/persistence/in-memory-source-item.repository';
import { InMemoryScanFailureQueueAdapter } from '@social-monitor/ingestion/adapters/queue/in-memory-scan-failure-queue.adapter';
import { NoopScanExecutionReporterAdapter } from '@social-monitor/ingestion/adapters/reporting/noop-scan-execution-reporter.adapter';
import { CircuitBreakerSourceFetcherAdapter } from '@social-monitor/ingestion/adapters/source/circuit-breaker-source-fetcher.adapter';
import { InMemorySourceProviderRegistry } from '@social-monitor/ingestion/adapters/source/in-memory-source-provider.registry';
import { RegistrySourceFetcherAdapter } from '@social-monitor/ingestion/adapters/source/registry-source-fetcher.adapter';
import { ExecuteScanUseCase } from '@social-monitor/ingestion/features/execute-scan/execute-scan.use-case';
import { ExecuteScanCommandHandler } from '@social-monitor/ingestion/interfaces/queue/execute-scan-command.handler';
import { type ScanExecutionReporterPort } from '@social-monitor/ingestion/ports';
import type { ScanRetryQueuePort } from '@social-monitor/ingestion/ports';
import { executeScanProviders } from './execute-scan.module';
import { PrismaIngestionWorkerConnection, type PrismaIngestionWorkerClient } from './adapters/persistence/prisma-ingestion-worker-connection';
import { INGESTION_CONVERSATION_PROJECTION, INGESTION_FEED_PROJECTION, INGESTION_RABBITMQ_SCAN_QUEUE_READER_OPTIONS, INGESTION_SCAN_ATTEMPT_REPOSITORY, INGESTION_SCAN_CURSOR_REPOSITORY, INGESTION_SCAN_EXECUTION_REPORTER, INGESTION_SCAN_FAILURE_QUEUE, INGESTION_SCAN_LEASE, INGESTION_SCAN_QUEUE_READER_MODE, INGESTION_SCAN_QUEUE_DRAIN_LOOP_OPTIONS, INGESTION_SCAN_REPORTER_MODE, INGESTION_SCAN_SCHEDULER_LOOP_OPTIONS, INGESTION_SOURCE_ITEM_REPOSITORY, INGESTION_WORKER_PERSISTENCE_MODE, INGESTION_WORKER_PRISMA_CLIENT, type IngestionWorkerPersistenceMode, type IngestionScanReporterMode, resolveIngestionWorkerPersistenceMode, resolveIngestionRabbitMqScanQueueReaderOptions, resolveIngestionScanQueueReaderMode, resolveIngestionScanReporterMode, resolveIngestionScanQueueDrainLoopOptions, resolveIngestionScanSchedulerLoopOptions } from './ingestion-worker-provider-tokens';
import { INGESTION_SCAN_COMMAND_QUEUE_READER, type ScanCommandQueueReaderPort } from './scan-command-queue-reader';
import { ScanQueueDrainLoop } from './scan-queue-drain-loop';
import { ScanSchedulerLoop } from './scan-scheduler-loop';
import { ingestionWorkerRuntimeProviders } from './adapters/composition/ingestion-worker-runtime.providers';
import { ingestionWorkerStorageProviders } from './adapters/composition/ingestion-worker-storage.providers';

@Module({
  imports: [
    MetricsRuntimeModule.register({ serviceName: "ingestion-worker" }),
    WorkerRuntimeModule.register({ serviceName: "ingestion-worker" }),
    MonitoringRestModule,
  ],
  providers: [
    {
      provide: INGESTION_WORKER_PERSISTENCE_MODE,
      useFactory: () => resolveIngestionWorkerPersistenceMode(process.env),
    },
    {
      provide: INGESTION_WORKER_PRISMA_CLIENT,
      useFactory: async (
        mode: IngestionWorkerPersistenceMode,
      ): Promise<PrismaIngestionWorkerClient | null> =>
        mode === "prisma"
          ? PrismaIngestionWorkerConnection.create(
              resolvePostgresRuntimePoolConfig(process.env),
            )
          : null,
      inject: [INGESTION_WORKER_PERSISTENCE_MODE],
    },
    {
      provide: INGESTION_SCAN_REPORTER_MODE,
      useFactory: () => resolveIngestionScanReporterMode(process.env),
    },
    {
      provide: INGESTION_SCAN_QUEUE_READER_MODE,
      useFactory: () => resolveIngestionScanQueueReaderMode(process.env),
    },
    {
      provide: INGESTION_RABBITMQ_SCAN_QUEUE_READER_OPTIONS,
      useFactory: () =>
        resolveIngestionRabbitMqScanQueueReaderOptions(process.env),
    },
    {
      provide: INGESTION_SCAN_SCHEDULER_LOOP_OPTIONS,
      useFactory: () => resolveIngestionScanSchedulerLoopOptions(process.env),
    },
    {
      provide: INGESTION_SCAN_QUEUE_DRAIN_LOOP_OPTIONS,
      useFactory: () => resolveIngestionScanQueueDrainLoopOptions(process.env),
    },
    ...ingestionWorkerRuntimeProviders,
    {
      provide: INGESTION_SCAN_EXECUTION_REPORTER,
      useFactory: (
        mode: IngestionScanReporterMode,
        noopReporter: NoopScanExecutionReporterAdapter,
        recordScanExecution: RecordScanExecutionUseCase,
      ): ScanExecutionReporterPort =>
        mode === "monitoring"
          ? new MonitoringScanExecutionReporterAdapter(recordScanExecution)
          : noopReporter,
      inject: [
        INGESTION_SCAN_REPORTER_MODE,
        NoopScanExecutionReporterAdapter,
        RecordScanExecutionUseCase,
      ],
    },
    ...ingestionWorkerStorageProviders,
    ...executeScanProviders,
    {
      provide: ScheduleDueScansCommandHandler,
      useFactory: (
        scheduleDueScans: ScheduleDueScansUseCase,
        metrics: MetricsRecorderPort,
        runtime: WorkerRuntime,
      ) =>
        new ScheduleDueScansCommandHandler(scheduleDueScans, metrics, runtime),
      inject: [ScheduleDueScansUseCase, METRICS_RECORDER, WorkerRuntime],
    },
    ScanSchedulerLoop,
    {
      provide: ExecuteScanCommandHandler,
      useFactory: (
        executeScan: ExecuteScanUseCase,
        metrics: MetricsRecorderPort,
        runtime: WorkerRuntime,
      ) => new ExecuteScanCommandHandler(executeScan, metrics, runtime),
      inject: [ExecuteScanUseCase, METRICS_RECORDER, WorkerRuntime],
    },
    {
      provide: ScanQueueDrainLoop,
      useFactory: (
        queue: ScanCommandQueueReaderPort,
        handler: ExecuteScanCommandHandler,
        retryQueue: ScanRetryQueuePort,
        options: ReturnType<typeof resolveIngestionScanQueueDrainLoopOptions>,
        metrics: MetricsRecorderPort,
      ) =>
        new ScanQueueDrainLoop(
          queue,
          handler,
          retryQueue,
          options,
          metrics,
          new SystemClock(),
        ),
      inject: [
        INGESTION_SCAN_COMMAND_QUEUE_READER,
        ExecuteScanCommandHandler,
        INGESTION_SCAN_FAILURE_QUEUE,
        INGESTION_SCAN_QUEUE_DRAIN_LOOP_OPTIONS,
        METRICS_RECORDER,
      ],
    },
  ],
  exports: [
    ExecuteScanCommandHandler,
    ScheduleDueScansCommandHandler,
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
    INGESTION_CONVERSATION_PROJECTION,
    INGESTION_SCAN_ATTEMPT_REPOSITORY,
    INGESTION_SCAN_CURSOR_REPOSITORY,
    INGESTION_SCAN_FAILURE_QUEUE,
    INGESTION_SCAN_LEASE,
    InMemorySourceProviderRegistry,
    INGESTION_SOURCE_ITEM_REPOSITORY,
    RegistrySourceFetcherAdapter,
    CircuitBreakerSourceFetcherAdapter,
  ],
})
export class IngestionWorkerModule {}
