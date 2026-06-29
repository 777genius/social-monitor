import { InMemoryFeedItemReadRepository } from '@social-monitor/feed/adapters/persistence/in-memory-feed-item-read.repository';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { WorkerRuntime } from '@social-monitor/platform-worker';
import { CryptoIdGenerator, SystemClock, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { InMemoryFeedProjectionAdapter } from '../apps/ingestion-worker/src/adapters/feed/in-memory-feed-projection.adapter';
import { InMemoryScanLeaseAdapter } from '../libs/ingestion/adapters/lease/in-memory-scan-lease.adapter';
import { InMemoryScanAttemptRepository } from '../libs/ingestion/adapters/persistence/in-memory-scan-attempt.repository';
import { InMemoryScanCursorRepository } from '../libs/ingestion/adapters/persistence/in-memory-scan-cursor.repository';
import { InMemorySourceItemRepository } from '../libs/ingestion/adapters/persistence/in-memory-source-item.repository';
import { InMemoryScanFailureQueueAdapter } from '../libs/ingestion/adapters/queue/in-memory-scan-failure-queue.adapter';
import { CircuitBreakerSourceFetcherAdapter } from '../libs/ingestion/adapters/source/circuit-breaker-source-fetcher.adapter';
import { InMemorySourceProviderRegistry } from '../libs/ingestion/adapters/source/in-memory-source-provider.registry';
import { RegistrySourceFetcherAdapter } from '../libs/ingestion/adapters/source/registry-source-fetcher.adapter';
import { FixtureRssClient } from '../libs/ingestion/adapters/source/rss/fixture-rss-client';
import { RssSourceProvider } from '../libs/ingestion/adapters/source/rss/rss-source.provider';
import { sourceReadinessProfiles } from '../libs/ingestion/adapters/source/source-readiness-profiles';
import { ExecuteScanUseCase } from '../libs/ingestion/features/execute-scan/execute-scan.use-case';
import { ExecuteScanCommandHandler } from '../libs/ingestion/interfaces/queue/execute-scan-command.handler';
import type {
  ReportScanFailedCommand,
  ReportScanSucceededCommand,
  ScanExecutionReporterPort,
} from '../libs/ingestion/ports';

class SmokeScanExecutionReporter implements ScanExecutionReporterPort {
  succeeded: ReportScanSucceededCommand | undefined;
  failed: ReportScanFailedCommand | undefined;

  async reportSucceeded(command: ReportScanSucceededCommand): Promise<void> {
    this.succeeded = command;
  }

  async reportFailed(command: ReportScanFailedCommand): Promise<void> {
    this.failed = command;
  }
}

const run = async (): Promise<void> => {
  const metrics = new InMemoryMetricsRecorder();
  const feedItems = new InMemoryFeedItemReadRepository();
  const sourceItems = new InMemorySourceItemRepository();
  const scanAttempts = new InMemoryScanAttemptRepository();
  const scanCursors = new InMemoryScanCursorRepository();
  const scanExecutionReporter = new SmokeScanExecutionReporter();
  const scanFailures = new InMemoryScanFailureQueueAdapter(metrics);
  const scanLeases = new InMemoryScanLeaseAdapter();
  const clock = new SystemClock();
  const registry = new InMemorySourceProviderRegistry(
    [new RssSourceProvider(new FixtureRssClient())],
    sourceReadinessProfiles,
  );
  const sourceFetcher = new CircuitBreakerSourceFetcherAdapter(
    new RegistrySourceFetcherAdapter(registry),
    clock,
    {
      failureThreshold: 3,
      cooldownSeconds: 60,
    },
  );
  const executeScan = new ExecuteScanUseCase(
    sourceFetcher,
    sourceItems,
    new InMemoryFeedProjectionAdapter(feedItems),
    scanAttempts,
    scanCursors,
    scanExecutionReporter,
    scanFailures,
    scanLeases,
    new CryptoIdGenerator(),
    clock,
  );
  const runtime = new WorkerRuntime({ serviceName: 'ingestion-worker' });
  runtime.onModuleInit();

  try {
    const handler = new ExecuteScanCommandHandler(executeScan, metrics, runtime);
    const tenant = tenantId('tenant-rss-smoke');
    const workspace = workspaceId('workspace-rss-smoke');
    const result = await handler.handle({
      commandId: 'scan-rss-smoke',
      commandType: 'ingestion.scan.execute',
      correlationId: 'corr-rss-smoke',
      payload: {
        tenantId: tenant,
        workspaceId: workspace,
        scanJobId: 'scan-rss-smoke',
        interestId: 'topic-rss-smoke',
        sourceBindingId: 'rss-binding-smoke',
        scanPolicyId: 'rss-policy-smoke',
        providerKey: 'rss',
        sourceQuery: { mode: 'url', query: 'https://example.test/feed.xml' },
      },
      schemaVersion: 1,
    });
    const feedResult = await feedItems.list({
      tenantId: tenant,
      workspaceId: workspace,
      interestId: 'topic-rss-smoke',
      limit: 10,
    });
    const snapshots = feedResult.items.map((item) => item.toSnapshot());
    const firstFeedItem = snapshots[0];
    const cursor = await scanCursors.findBySourceBinding({
      tenantId: tenant,
      workspaceId: workspace,
      sourceBindingId: 'rss-binding-smoke',
    });

    if (result.fetched !== 2 || result.inserted !== 2 || result.projected !== 2) {
      throw new Error(`Unexpected RSS scan result: ${JSON.stringify(result)}`);
    }

    if (snapshots.length !== 2 || firstFeedItem === undefined) {
      throw new Error(`Expected 2 RSS feed items, got ${snapshots.length}`);
    }

    if (firstFeedItem.title !== 'RSS item 2 without guid') {
      throw new Error(`Expected newest RSS item first, got "${firstFeedItem.title}"`);
    }

    if (cursor?.cursor.includes('fixture-rss-etag') !== true) {
      throw new Error(`Expected RSS ETag cursor, got ${JSON.stringify(cursor)}`);
    }

    if (scanExecutionReporter.succeeded === undefined || scanExecutionReporter.failed !== undefined) {
      throw new Error('Expected RSS scan success report without failure report');
    }

    console.log('RSS ingestion smoke OK');
  } finally {
    await runtime.onApplicationShutdown('rss-smoke-complete');
  }
};

void run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
