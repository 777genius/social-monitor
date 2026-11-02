import type { Provider } from '@nestjs/common';
import { ConversationUnitProjectionAdapter } from '@social-monitor/conversation/adapters/ingestion/conversation-unit-projection.adapter';
import { InMemoryConversationUnitRepository } from '@social-monitor/conversation/adapters/persistence/in-memory-conversation-unit.repository';
import { PrismaConversationUnitRepository } from '@social-monitor/conversation/adapters/persistence/prisma/prisma-conversation-unit.repository';
import { InMemoryFeedItemReadRepository } from '@social-monitor/feed/adapters/persistence/in-memory-feed-item-read.repository';
import { PrismaFeedProjectionAdapter } from '@social-monitor/feed/adapters/persistence/prisma/prisma-feed-projection.adapter';
import { PrismaSourceEngagementProjectionAdapter } from '@social-monitor/feed/adapters/persistence/prisma/prisma-source-engagement-projection.adapter';
import { type MetricsRecorderPort } from '@social-monitor/platform-metrics';
import { METRICS_RECORDER } from '@social-monitor/platform-metrics/nest/metrics-runtime.module';
import { CryptoIdGenerator } from '@social-monitor/shared-kernel';
import { InMemoryScanLeaseAdapter } from '@social-monitor/ingestion/adapters/lease/in-memory-scan-lease.adapter';
import { InMemoryScanAttemptRepository } from '@social-monitor/ingestion/adapters/persistence/in-memory-scan-attempt.repository';
import { InMemoryScanCursorRepository } from '@social-monitor/ingestion/adapters/persistence/in-memory-scan-cursor.repository';
import { InMemorySourceItemRepository } from '@social-monitor/ingestion/adapters/persistence/in-memory-source-item.repository';
import { InMemorySourceCandidateMemoryRepository } from '@social-monitor/ingestion/adapters/persistence/in-memory-source-candidate-memory.repository';
import { PrismaScanAttemptRepository } from '@social-monitor/ingestion/adapters/persistence/prisma/prisma-scan-attempt.repository';
import { PrismaScanCursorRepository } from '@social-monitor/ingestion/adapters/persistence/prisma/prisma-scan-cursor.repository';
import { PrismaScanFailureQueueAdapter } from '@social-monitor/ingestion/adapters/persistence/prisma/prisma-scan-failure-queue.adapter';
import { PrismaScanLeaseAdapter } from '@social-monitor/ingestion/adapters/persistence/prisma/prisma-scan-lease.adapter';
import { PrismaSourceItemRepository } from '@social-monitor/ingestion/adapters/persistence/prisma/prisma-source-item.repository';
import { PrismaSourceCandidateMemoryRepository } from '@social-monitor/ingestion/adapters/persistence/prisma/prisma-source-candidate-memory.repository';
import { InMemoryScanFailureQueueAdapter } from '@social-monitor/ingestion/adapters/queue/in-memory-scan-failure-queue.adapter';
import { noopSourceEngagementProjection } from '@social-monitor/ingestion/ports';
import type { ConversationProjectionPort, FeedProjectionPort, ScanAttemptRepositoryPort, ScanCursorRepositoryPort, ScanFailureQueuePort, ScanRetryQueuePort, ScanLeasePort, SourceCandidateMemoryPort, SourceEngagementProjectionPort, SourceItemRepositoryPort } from '@social-monitor/ingestion/ports';
import { InMemoryFeedProjectionAdapter } from '../../adapters/feed/in-memory-feed-projection.adapter';
import { type PrismaIngestionWorkerClient } from '../../adapters/persistence/prisma-ingestion-worker-connection';
import { INGESTION_CONVERSATION_PROJECTION, INGESTION_FEED_PROJECTION, INGESTION_SCAN_ATTEMPT_REPOSITORY, INGESTION_SCAN_CURSOR_REPOSITORY, INGESTION_SCAN_FAILURE_QUEUE, INGESTION_SCAN_LEASE, INGESTION_SOURCE_CANDIDATE_MEMORY, INGESTION_SOURCE_ENGAGEMENT_PROJECTION, INGESTION_SOURCE_ITEM_REPOSITORY, INGESTION_WORKER_PERSISTENCE_MODE, INGESTION_WORKER_PRISMA_CLIENT, type IngestionWorkerPersistenceMode } from '../../ingestion-worker-provider-tokens';

export const ingestionWorkerStorageProviders: Provider[] = [
    InMemorySourceItemRepository,
    InMemorySourceCandidateMemoryRepository,
    InMemoryFeedItemReadRepository,
    InMemoryConversationUnitRepository,
    {
      provide: InMemoryFeedProjectionAdapter,
      useFactory: (feedItems: InMemoryFeedItemReadRepository) =>
        new InMemoryFeedProjectionAdapter(feedItems),
      inject: [InMemoryFeedItemReadRepository],
    },
    {
      provide: INGESTION_SOURCE_CANDIDATE_MEMORY,
      useFactory: (
        mode: IngestionWorkerPersistenceMode,
        prisma: PrismaIngestionWorkerClient | null,
        inMemoryCandidateMemory: InMemorySourceCandidateMemoryRepository,
      ): SourceCandidateMemoryPort =>
        mode === "prisma"
          ? new PrismaSourceCandidateMemoryRepository(
              requirePrismaIngestionWorkerClient(prisma),
              new CryptoIdGenerator(),
            )
          : inMemoryCandidateMemory,
      inject: [
        INGESTION_WORKER_PERSISTENCE_MODE,
        INGESTION_WORKER_PRISMA_CLIENT,
        InMemorySourceCandidateMemoryRepository,
      ],
    },
    {
      provide: INGESTION_SOURCE_ENGAGEMENT_PROJECTION,
      useFactory: (
        mode: IngestionWorkerPersistenceMode,
        prisma: PrismaIngestionWorkerClient | null,
      ): SourceEngagementProjectionPort =>
        mode === "prisma"
          ? new PrismaSourceEngagementProjectionAdapter(
              requirePrismaIngestionWorkerClient(prisma),
              new CryptoIdGenerator(),
            )
          : noopSourceEngagementProjection,
      inject: [
        INGESTION_WORKER_PERSISTENCE_MODE,
        INGESTION_WORKER_PRISMA_CLIENT,
      ],
    },
    {
      provide: INGESTION_SOURCE_ITEM_REPOSITORY,
      useFactory: (
        mode: IngestionWorkerPersistenceMode,
        prisma: PrismaIngestionWorkerClient | null,
        inMemorySourceItems: InMemorySourceItemRepository,
      ): SourceItemRepositoryPort =>
        mode === "prisma"
          ? new PrismaSourceItemRepository(
              requirePrismaIngestionWorkerClient(prisma),
            )
          : inMemorySourceItems,
      inject: [
        INGESTION_WORKER_PERSISTENCE_MODE,
        INGESTION_WORKER_PRISMA_CLIENT,
        InMemorySourceItemRepository,
      ],
    },
    {
      provide: INGESTION_SCAN_CURSOR_REPOSITORY,
      useFactory: (
        mode: IngestionWorkerPersistenceMode,
        prisma: PrismaIngestionWorkerClient | null,
        inMemoryScanCursors: InMemoryScanCursorRepository,
      ): ScanCursorRepositoryPort =>
        mode === "prisma"
          ? new PrismaScanCursorRepository(
              requirePrismaIngestionWorkerClient(prisma),
              new CryptoIdGenerator(),
            )
          : inMemoryScanCursors,
      inject: [
        INGESTION_WORKER_PERSISTENCE_MODE,
        INGESTION_WORKER_PRISMA_CLIENT,
        InMemoryScanCursorRepository,
      ],
    },
    {
      provide: INGESTION_SCAN_ATTEMPT_REPOSITORY,
      useFactory: (
        mode: IngestionWorkerPersistenceMode,
        prisma: PrismaIngestionWorkerClient | null,
        inMemoryScanAttempts: InMemoryScanAttemptRepository,
      ): ScanAttemptRepositoryPort =>
        mode === "prisma"
          ? new PrismaScanAttemptRepository(
              requirePrismaIngestionWorkerClient(prisma),
            )
          : inMemoryScanAttempts,
      inject: [
        INGESTION_WORKER_PERSISTENCE_MODE,
        INGESTION_WORKER_PRISMA_CLIENT,
        InMemoryScanAttemptRepository,
      ],
    },
    {
      provide: INGESTION_SCAN_LEASE,
      useFactory: (
        mode: IngestionWorkerPersistenceMode,
        prisma: PrismaIngestionWorkerClient | null,
        inMemoryScanLeases: InMemoryScanLeaseAdapter,
      ): ScanLeasePort =>
        mode === "prisma"
          ? new PrismaScanLeaseAdapter(
              requirePrismaIngestionWorkerClient(prisma),
              new CryptoIdGenerator(),
            )
          : inMemoryScanLeases,
      inject: [
        INGESTION_WORKER_PERSISTENCE_MODE,
        INGESTION_WORKER_PRISMA_CLIENT,
        InMemoryScanLeaseAdapter,
      ],
    },
    {
      provide: INGESTION_FEED_PROJECTION,
      useFactory: (
        mode: IngestionWorkerPersistenceMode,
        prisma: PrismaIngestionWorkerClient | null,
        inMemoryFeedProjection: InMemoryFeedProjectionAdapter,
      ): FeedProjectionPort =>
        mode === "prisma"
          ? new PrismaFeedProjectionAdapter(
              requirePrismaIngestionWorkerClient(prisma),
              new CryptoIdGenerator(),
            )
          : inMemoryFeedProjection,
      inject: [
        INGESTION_WORKER_PERSISTENCE_MODE,
        INGESTION_WORKER_PRISMA_CLIENT,
        InMemoryFeedProjectionAdapter,
      ],
    },
    {
      provide: INGESTION_CONVERSATION_PROJECTION,
      useFactory: (
        mode: IngestionWorkerPersistenceMode,
        prisma: PrismaIngestionWorkerClient | null,
        inMemoryConversationUnits: InMemoryConversationUnitRepository,
      ): ConversationProjectionPort =>
        mode === "prisma"
          ? new ConversationUnitProjectionAdapter(
              new PrismaConversationUnitRepository(
                requirePrismaIngestionWorkerClient(prisma),
                new CryptoIdGenerator(),
              ),
              new CryptoIdGenerator(),
            )
          : new ConversationUnitProjectionAdapter(
              inMemoryConversationUnits,
              new CryptoIdGenerator(),
            ),
      inject: [
        INGESTION_WORKER_PERSISTENCE_MODE,
        INGESTION_WORKER_PRISMA_CLIENT,
        InMemoryConversationUnitRepository,
      ],
    },
    {
      provide: INGESTION_SCAN_FAILURE_QUEUE,
      useFactory: (
        mode: IngestionWorkerPersistenceMode,
        prisma: PrismaIngestionWorkerClient | null,
        inMemoryScanFailures: InMemoryScanFailureQueueAdapter,
        metrics: MetricsRecorderPort,
      ): ScanFailureQueuePort & ScanRetryQueuePort =>
        mode === "prisma"
          ? new PrismaScanFailureQueueAdapter(
              requirePrismaIngestionWorkerClient(prisma),
              metrics,
              new CryptoIdGenerator(),
            )
          : inMemoryScanFailures,
      inject: [
        INGESTION_WORKER_PERSISTENCE_MODE,
        INGESTION_WORKER_PRISMA_CLIENT,
        InMemoryScanFailureQueueAdapter,
        METRICS_RECORDER,
      ],
    },
];

const requirePrismaIngestionWorkerClient = (
  client: PrismaIngestionWorkerClient | null,
): PrismaIngestionWorkerClient => {
  if (client === null) {
    throw new Error(
      "Prisma ingestion worker client is required when INGESTION_WORKER_PERSISTENCE=prisma",
    );
  }
  return client;
};
