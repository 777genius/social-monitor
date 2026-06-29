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
import { FixtureHackerNewsClient } from '../libs/ingestion/adapters/source/hacker-news/fixture-hacker-news-client';
import { HackerNewsSourceProvider } from '../libs/ingestion/adapters/source/hacker-news/hacker-news-source.provider';
import { InMemorySourceProviderRegistry } from '../libs/ingestion/adapters/source/in-memory-source-provider.registry';
import { RegistrySourceFetcherAdapter } from '../libs/ingestion/adapters/source/registry-source-fetcher.adapter';
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
    [new HackerNewsSourceProvider(new FixtureHackerNewsClient())],
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
    const tenant = tenantId('tenant-hn-smoke');
    const workspace = workspaceId('workspace-hn-smoke');
    const result = await handler.handle({
      commandId: 'scan-hn-smoke',
      commandType: 'ingestion.scan.execute',
      correlationId: 'corr-hn-smoke',
      payload: {
        tenantId: tenant,
        workspaceId: workspace,
        scanJobId: 'scan-hn-smoke',
        interestId: 'topic-hn-smoke',
        sourceBindingId: 'hn-binding-smoke',
        scanPolicyId: 'hn-policy-smoke',
        providerKey: 'hacker-news',
        sourceQuery: { mode: 'search', query: 'monitoring' },
      },
      schemaVersion: 1,
    });
    const feedResult = await feedItems.list({
      tenantId: tenant,
      workspaceId: workspace,
      interestId: 'topic-hn-smoke',
      limit: 10,
    });
    const snapshots = feedResult.items.map((item) => item.toSnapshot());
    const titles = snapshots.map((item) => item.title).sort((left, right) => left.localeCompare(right));
    const cursor = await scanCursors.findBySourceBinding({
      tenantId: tenant,
      workspaceId: workspace,
      sourceBindingId: 'hn-binding-smoke',
    });

    if (result.fetched !== 2 || result.inserted !== 2 || result.projected !== 2) {
      throw new Error(`Unexpected Hacker News scan result: ${JSON.stringify(result)}`);
    }

    if (snapshots.length !== 2) {
      throw new Error(`Expected 2 Hacker News feed items, got ${snapshots.length}`);
    }

    if (titles.join('|') !== 'Ask HN: Reliable RSS and API ingestion|Show HN: Social monitoring architecture') {
      throw new Error(`Unexpected Hacker News feed titles: ${titles.join('|')}`);
    }

    if (snapshots.some((item) => item.title === 'Deleted story')) {
      throw new Error('Deleted Hacker News stories must not be projected into feed');
    }

    if (cursor?.cursor !== new Date(1_780_000_060 * 1000).toISOString()) {
      throw new Error(`Expected Hacker News time cursor, got ${JSON.stringify(cursor)}`);
    }

    if (scanExecutionReporter.succeeded === undefined || scanExecutionReporter.failed !== undefined) {
      throw new Error('Expected Hacker News scan success report without failure report');
    }

    console.log('Hacker News ingestion smoke OK');
  } finally {
    await runtime.onApplicationShutdown('hn-smoke-complete');
  }
};

void run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
