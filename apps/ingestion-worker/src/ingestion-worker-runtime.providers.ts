import type { Provider } from '@nestjs/common';
import { InMemoryMetricsRecorder, type MetricsRecorderPort } from '@social-monitor/platform-metrics';
import { METRICS_RECORDER } from '@social-monitor/platform-metrics/nest/metrics-runtime.module';
import { InMemoryQueuePublisher } from '@social-monitor/platform-queue/adapters/in-memory';
import { AmqplibRabbitMqChannel } from '@social-monitor/platform-queue/adapters/rabbitmq';
import { InMemoryScanLeaseAdapter } from '@social-monitor/ingestion/adapters/lease/in-memory-scan-lease.adapter';
import { InMemoryScanAttemptRepository } from '@social-monitor/ingestion/adapters/persistence/in-memory-scan-attempt.repository';
import { InMemoryScanCursorRepository } from '@social-monitor/ingestion/adapters/persistence/in-memory-scan-cursor.repository';
import { InMemoryScanFailureQueueAdapter } from '@social-monitor/ingestion/adapters/queue/in-memory-scan-failure-queue.adapter';
import { NoopScanExecutionReporterAdapter } from '@social-monitor/ingestion/adapters/reporting/noop-scan-execution-reporter.adapter';
import { sourceProviderRegistryProviders } from '@social-monitor/ingestion/interfaces/source/source-provider-registry.providers';
import { articleContentEnrichmentProviders } from './article-content-enrichment.module';
import { githubRepoRadarProviders } from './github-repo-radar.module';
import { INGESTION_RABBITMQ_SCAN_QUEUE_READER_OPTIONS, INGESTION_SCAN_QUEUE_READER_MODE, type IngestionScanQueueReaderMode, type resolveIngestionRabbitMqScanQueueReaderOptions } from './ingestion-worker-provider-tokens';
import { INGESTION_SCAN_COMMAND_QUEUE_READER, InMemoryScanCommandQueueReader, RabbitMqScanCommandQueueReader, type ScanCommandQueueReaderPort } from './scan-command-queue-reader';

const INGESTION_RABBITMQ_SCAN_QUEUE_CHANNEL = Symbol(
  "INGESTION_RABBITMQ_SCAN_QUEUE_CHANNEL",
);

export const ingestionWorkerRuntimeProviders: Provider[] = [
    ...sourceProviderRegistryProviders,
    ...githubRepoRadarProviders,
    InMemoryScanAttemptRepository,
    InMemoryScanCursorRepository,
    {
      provide: InMemoryScanFailureQueueAdapter,
      useFactory: (metrics: MetricsRecorderPort) =>
        new InMemoryScanFailureQueueAdapter(metrics),
      inject: [METRICS_RECORDER],
    },
    InMemoryScanLeaseAdapter,
    {
      provide: InMemoryMetricsRecorder,
      useExisting: METRICS_RECORDER,
    },
    {
      provide: INGESTION_RABBITMQ_SCAN_QUEUE_CHANNEL,
      useFactory: (
        mode: IngestionScanQueueReaderMode,
      ): AmqplibRabbitMqChannel | null =>
        mode === "rabbitmq"
          ? new AmqplibRabbitMqChannel({ url: process.env.RABBITMQ_URL ?? "" })
          : null,
      inject: [INGESTION_SCAN_QUEUE_READER_MODE],
    },
    {
      provide: INGESTION_SCAN_COMMAND_QUEUE_READER,
      useFactory: (
        mode: IngestionScanQueueReaderMode,
        queue: InMemoryQueuePublisher,
        channel: AmqplibRabbitMqChannel | null,
        options: ReturnType<
          typeof resolveIngestionRabbitMqScanQueueReaderOptions
        >,
      ): ScanCommandQueueReaderPort =>
        mode === "rabbitmq"
          ? new RabbitMqScanCommandQueueReader(
              requireRabbitMqScanQueueChannel(channel),
              options,
            )
          : new InMemoryScanCommandQueueReader(queue),
      inject: [
        INGESTION_SCAN_QUEUE_READER_MODE,
        InMemoryQueuePublisher,
        INGESTION_RABBITMQ_SCAN_QUEUE_CHANNEL,
        INGESTION_RABBITMQ_SCAN_QUEUE_READER_OPTIONS,
      ],
    },
    NoopScanExecutionReporterAdapter,
    ...articleContentEnrichmentProviders,
];

const requireRabbitMqScanQueueChannel = (
  channel: AmqplibRabbitMqChannel | null,
): AmqplibRabbitMqChannel => {
  if (channel === null) {
    throw new Error(
      "RabbitMQ scan queue channel is required when INGESTION_SCAN_QUEUE_READER=rabbitmq",
    );
  }

  return channel;
};
