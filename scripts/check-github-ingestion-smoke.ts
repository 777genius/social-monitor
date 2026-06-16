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
import { FixtureGitHubClient } from '../libs/ingestion/adapters/source/github/fixture-github-client';
import { GitHubSourceProvider } from '../libs/ingestion/adapters/source/github/github-source.provider';
import { InMemorySourceProviderRegistry } from '../libs/ingestion/adapters/source/in-memory-source-provider.registry';
import { RegistrySourceFetcherAdapter } from '../libs/ingestion/adapters/source/registry-source-fetcher.adapter';
import { sourceReadinessProfiles } from '../libs/ingestion/adapters/source/source-readiness-profiles';
import { ExecuteScanUseCase } from '../libs/ingestion/features/execute-scan/execute-scan.use-case';
import { ExecuteScanCommandHandler } from '../libs/ingestion/interfaces/queue/execute-scan-command.handler';
import type {
  ReportScanFailedCommand,
  ReportScanSucceededCommand,
  ScanExecutionReporterPort,
  SourceConfigReaderPort,
  SourceRuntimeConfig,
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

class StaticSourceConfigReader implements SourceConfigReaderPort {
  async readConfig(): Promise<SourceRuntimeConfig> {
    return {
      maxItems: 1,
    };
  }
}

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

const run = async (): Promise<void> => {
  const tenant = tenantId('tenant-github-smoke');
  const workspace = workspaceId('workspace-github-smoke');
  const provider = new GitHubSourceProvider(new FixtureGitHubClient());
  const directContext = {
    tenantId: tenant,
    workspaceId: workspace,
    sourceBindingId: 'github-binding-smoke-direct',
    scanJobId: 'scan-github-smoke-direct',
    correlationId: 'corr-github-smoke-direct',
  };
  const directPlan = provider.planScan(
    { mode: 'search', query: 'social monitoring repo:777genius/social-monitor' },
    directContext,
  );
  const directScan = await provider.scan(directPlan, directContext);

  assert(directScan.items.length === 2, `expected two normalized GitHub issues, got ${directScan.items.length}`);
  assert(directScan.warnings.length === 1, 'GitHub provider must warn when pull requests are skipped');
  assert(
    directScan.items.every((item) => item.externalId.startsWith('github:')),
    'GitHub provider must emit stable GitHub external ids',
  );

  const metrics = new InMemoryMetricsRecorder();
  const feedItems = new InMemoryFeedItemReadRepository();
  const sourceItems = new InMemorySourceItemRepository();
  const scanAttempts = new InMemoryScanAttemptRepository();
  const scanCursors = new InMemoryScanCursorRepository();
  const scanExecutionReporter = new SmokeScanExecutionReporter();
  const scanFailures = new InMemoryScanFailureQueueAdapter(metrics);
  const scanLeases = new InMemoryScanLeaseAdapter();
  const clock = new SystemClock();
  const registry = new InMemorySourceProviderRegistry([provider], sourceReadinessProfiles);
  const sourceFetcher = new CircuitBreakerSourceFetcherAdapter(
    new RegistrySourceFetcherAdapter(registry, new StaticSourceConfigReader()),
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
    const first = await handler.handle({
      commandId: 'scan-github-smoke-1',
      commandType: 'ingestion.scan.execute',
      correlationId: 'corr-github-smoke-1',
      payload: {
        tenantId: tenant,
        workspaceId: workspace,
        scanJobId: 'scan-github-smoke-1',
        topicId: 'topic-github-smoke',
        sourceBindingId: 'github-binding-smoke',
        scanPolicyId: 'github-policy-smoke',
        providerKey: 'github',
        sourceQuery: { mode: 'search', query: 'social monitoring repo:777genius/social-monitor' },
      },
      schemaVersion: 1,
    });
    const firstCursor = await scanCursors.findBySourceBinding({
      tenantId: tenant,
      workspaceId: workspace,
      sourceBindingId: 'github-binding-smoke',
    });

    assert(first.fetched === 1 && first.inserted === 1 && first.projected === 1, 'first GitHub scan counters mismatch');
    assert(firstCursor?.cursor === '1', `expected first GitHub cursor "1", got ${JSON.stringify(firstCursor)}`);

    const second = await handler.handle({
      commandId: 'scan-github-smoke-2',
      commandType: 'ingestion.scan.execute',
      correlationId: 'corr-github-smoke-2',
      payload: {
        tenantId: tenant,
        workspaceId: workspace,
        scanJobId: 'scan-github-smoke-2',
        topicId: 'topic-github-smoke',
        sourceBindingId: 'github-binding-smoke',
        scanPolicyId: 'github-policy-smoke',
        providerKey: 'github',
        sourceQuery: { mode: 'search', query: 'social monitoring repo:777genius/social-monitor' },
      },
      schemaVersion: 1,
    });
    const feedResult = await feedItems.list({
      tenantId: tenant,
      workspaceId: workspace,
      topicId: 'topic-github-smoke',
      limit: 10,
    });
    const titles = feedResult.items.map((item) => item.toSnapshot().title).sort();

    assert(second.fetched === 1 && second.inserted === 1 && second.projected === 1, 'second GitHub scan counters mismatch');
    assert(titles.length === 2, `expected two GitHub feed items after cursor paging, got ${titles.length}`);
    assert(
      titles.join('|') === 'Document GitHub source limitations|Improve social monitoring scan reliability',
      `unexpected GitHub feed titles: ${titles.join('|')}`,
    );
    assert(scanExecutionReporter.succeeded !== undefined, 'GitHub scan success report is required');
    assert(scanExecutionReporter.failed === undefined, 'GitHub smoke must not report scan failure');

    console.log('GitHub ingestion smoke OK');
  } finally {
    await runtime.onApplicationShutdown('github-smoke-complete');
  }
};

void run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
