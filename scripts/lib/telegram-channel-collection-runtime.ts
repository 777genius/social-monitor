import { ConversationUnitProjectionAdapter } from '@social-monitor/conversation/adapters/ingestion/conversation-unit-projection.adapter';
import { PrismaConversationUnitRepository } from '@social-monitor/conversation/adapters/persistence/prisma/prisma-conversation-unit.repository';
import { PrismaFeedProjectionAdapter } from '@social-monitor/feed/adapters/persistence/prisma/prisma-feed-projection.adapter';
import { PrismaSourceEngagementProjectionAdapter } from '@social-monitor/feed/adapters/persistence/prisma/prisma-source-engagement-projection.adapter';
import { PrismaScanAttemptRepository } from '@social-monitor/ingestion/adapters/persistence/prisma/prisma-scan-attempt.repository';
import { PrismaScanFailureQueueAdapter } from '@social-monitor/ingestion/adapters/persistence/prisma/prisma-scan-failure-queue.adapter';
import { PrismaScanLeaseAdapter } from '@social-monitor/ingestion/adapters/persistence/prisma/prisma-scan-lease.adapter';
import { PrismaSourceItemRepository } from '@social-monitor/ingestion/adapters/persistence/prisma/prisma-source-item.repository';
import { PrismaSourceCandidateMemoryRepository } from '@social-monitor/ingestion/adapters/persistence/prisma/prisma-source-candidate-memory.repository';
import { InMemorySourceProviderRegistry } from '@social-monitor/ingestion/adapters/source/in-memory-source-provider.registry';
import { RegistrySourceFetcherAdapter } from '@social-monitor/ingestion/adapters/source/registry-source-fetcher.adapter';
import { sourceReadinessProfiles } from '@social-monitor/ingestion/adapters/source/source-readiness-profiles';
import { HttpTelegramPreviewClient } from '@social-monitor/ingestion/adapters/source/telegram/http-telegram-preview-client';
import { TelegramSourceProvider } from '@social-monitor/ingestion/adapters/source/telegram/telegram-source.provider';
import { ExecuteScanUseCase } from '@social-monitor/ingestion/features/execute-scan/execute-scan.use-case';
import type { ScanExecutionReporterPort, SourceFetcherPort } from '@social-monitor/ingestion/ports';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import type { Clock, IdGenerator } from '@social-monitor/shared-kernel';
import type { PrismaIngestionWorkerConnection } from '../../apps/ingestion-worker/src/adapters/persistence/prisma-ingestion-worker-connection';
import { composeCollectionScanExecution } from './collection-scan-execution';
import { telegramCollectionConfig, telegramCollectionScope, TelegramCollectionError,
  type TelegramCollectionOperationalState } from './telegram-channel-collection-contract';

export const observeTelegramCollectionOperation = (fetcher: SourceFetcherPort, reporter: ScanExecutionReporterPort) => {
  let fetchReturned = false;
  let fetchFailed = false;
  let failureReported = false;
  return {
    operationalState: (): TelegramCollectionOperationalState => ({ fetchFailed, failureReported }),
    fetcher: { fetch: async (command) => {
      try {
        const result = await fetcher.fetch(command);
        fetchReturned = true;
        fetchFailed = false;
        return result;
      } catch (error) {
        fetchFailed = !fetchReturned;
        throw error;
      }
    } } satisfies SourceFetcherPort,
    reporter: {
      reportSucceeded: (command) => reporter.reportSucceeded(command),
      reportFailed: async (command) => {
        await reporter.reportFailed(command);
        failureReported = true;
      },
    } satisfies ScanExecutionReporterPort,
  };
};

export const composeTelegramCollectionRuntime = (
  connection: PrismaIngestionWorkerConnection, ids: IdGenerator, clock: Clock, sourceBindingId: string,
) => {
  const liveExecution = {
    ...composeCollectionScanExecution(connection, ids, clock),
    correlationId: 'telegram-channel-collection', causationId: 'telegram-hiaimediaen-finite-collection',
  };
  const fetcher = new RegistrySourceFetcherAdapter(new InMemorySourceProviderRegistry(
    [new TelegramSourceProvider(new HttpTelegramPreviewClient(), clock)],
    sourceReadinessProfiles.filter((profile) => profile.providerKey === 'telegram'),
  ), {
    readConfig: async (params) => {
      if (params.tenantId !== telegramCollectionScope.tenantId || params.workspaceId !== telegramCollectionScope.workspaceId ||
          params.sourceBindingId !== sourceBindingId) throw new TelegramCollectionError('binding_conflict');
      return telegramCollectionConfig;
    },
  });
  const observed = observeTelegramCollectionOperation(fetcher, liveExecution.reporter);
  const execution = { ...liveExecution, reporter: observed.reporter };
  type FeedClient = ConstructorParameters<typeof PrismaFeedProjectionAdapter>[0];
  const feedClient: FeedClient & {
    $transaction<T>(operation: (transaction: FeedClient) => Promise<T>, options: { readonly isolationLevel: 'Serializable' }): Promise<T>;
  } = {
    feedItem: connection.feedItem, feedSignalBaselineSample: connection.feedSignalBaselineSample,
    $transaction: (operation, options) => connection.$transaction(operation, { ...options, maxWait: 30_000, timeout: 300_000 }),
  };
  const feed = new PrismaFeedProjectionAdapter(feedClient, ids);
  return {
    execution,
    operationalState: observed.operationalState,
    executeScan: new ExecuteScanUseCase(observed.fetcher, new PrismaSourceItemRepository(connection), feed,
      new PrismaScanAttemptRepository(connection), execution.scanCursors, execution.reporter,
      new PrismaScanFailureQueueAdapter(connection, new InMemoryMetricsRecorder(), ids),
      new PrismaScanLeaseAdapter(connection, ids), ids, clock, undefined, undefined,
      new ConversationUnitProjectionAdapter(new PrismaConversationUnitRepository(connection, ids), ids),
      new PrismaSourceCandidateMemoryRepository(connection, ids), new PrismaSourceEngagementProjectionAdapter(connection, ids)),
  };
};
