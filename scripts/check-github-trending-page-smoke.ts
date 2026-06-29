import { InMemoryFeedItemReadRepository } from '@social-monitor/feed/adapters/persistence/in-memory-feed-item-read.repository';
import { InMemoryFeedProjectionAdapter } from '../apps/ingestion-worker/src/adapters/feed/in-memory-feed-projection.adapter';
import { InMemoryScanLeaseAdapter } from '../libs/ingestion/adapters/lease/in-memory-scan-lease.adapter';
import { InMemoryScanAttemptRepository } from '../libs/ingestion/adapters/persistence/in-memory-scan-attempt.repository';
import { InMemoryScanCursorRepository } from '../libs/ingestion/adapters/persistence/in-memory-scan-cursor.repository';
import { InMemorySourceItemRepository } from '../libs/ingestion/adapters/persistence/in-memory-source-item.repository';
import { InMemoryScanFailureQueueAdapter } from '../libs/ingestion/adapters/queue/in-memory-scan-failure-queue.adapter';
import { CircuitBreakerSourceFetcherAdapter } from '../libs/ingestion/adapters/source/circuit-breaker-source-fetcher.adapter';
import { FixtureGitHubTrendingPageClient } from '../libs/ingestion/adapters/source/github-trending-page/fixture-github-trending-page-client';
import { GitHubTrendingPageSourceProvider } from '../libs/ingestion/adapters/source/github-trending-page/github-trending-page-source.provider';
import { InMemorySourceProviderRegistry } from '../libs/ingestion/adapters/source/in-memory-source-provider.registry';
import { RegistrySourceFetcherAdapter } from '../libs/ingestion/adapters/source/registry-source-fetcher.adapter';
import { sourceReadinessProfiles } from '../libs/ingestion/adapters/source/source-readiness-profiles';
import {
  GITHUB_TRENDING_PAGE_PROVIDER_KEY,
  parseGitHubTrendingPageRepositoryMetadata,
} from '../libs/ingestion/domain';
import { ExecuteScanUseCase } from '../libs/ingestion/features/execute-scan/execute-scan.use-case';
import type {
  ReportScanFailedCommand,
  ReportScanSucceededCommand,
  ScanExecutionReporterPort,
  SourceConfigReaderPort,
  SourceRuntimeConfig,
} from '../libs/ingestion/ports';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import {
  CryptoIdGenerator,
  FixedClock,
  tenantId,
  workspaceId,
} from '@social-monitor/shared-kernel';

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
      fixtureMode: true,
      maxItems: 3,
    };
  }
}

void run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

async function run(): Promise<void> {
  const tenant = tenantId('tenant-github-trending-page-smoke');
  const workspace = workspaceId('workspace-github-trending-page-smoke');
  const interestId = 'topic-github-trending-page';
  const clock = new FixedClock(new Date('2026-06-24T12:00:00.000Z'));
  const provider = new GitHubTrendingPageSourceProvider(
    new FixtureGitHubTrendingPageClient(),
    clock,
  );
  const registry = new InMemorySourceProviderRegistry(
    [provider],
    sourceReadinessProfiles,
  );
  const feedItems = new InMemoryFeedItemReadRepository();
  const sourceItems = new InMemorySourceItemRepository();
  const scanAttempts = new InMemoryScanAttemptRepository();
  const scanCursors = new InMemoryScanCursorRepository();
  const scanExecutionReporter = new SmokeScanExecutionReporter();
  const scanFailures = new InMemoryScanFailureQueueAdapter(
    new InMemoryMetricsRecorder(),
  );
  const scanLeases = new InMemoryScanLeaseAdapter();
  const executeScan = new ExecuteScanUseCase(
    new CircuitBreakerSourceFetcherAdapter(
      new RegistrySourceFetcherAdapter(
        registry,
        new StaticSourceConfigReader(),
      ),
      clock,
      { failureThreshold: 3, cooldownSeconds: 60 },
    ),
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
  const result = await executeScan.execute({
    tenantId: tenant,
    workspaceId: workspace,
    scanJobId: 'scan-github-trending-page-smoke',
    interestId,
    sourceBindingId: 'binding-github-trending-page-smoke',
    scanPolicyId: 'policy-github-trending-page-smoke',
    providerKey: GITHUB_TRENDING_PAGE_PROVIDER_KEY,
    sourceQuery: { mode: 'listing', query: 'daily' },
    correlationId: 'corr-github-trending-page-smoke',
    causationId: 'cause-github-trending-page-smoke',
  });

  if (!result.ok) {
    throw result.error;
  }

  assert(
    result.value.fetched === 3,
    `expected three GitHub Trending page items, got ${result.value.fetched}`,
  );
  assert(
    result.value.inserted === 3,
    `expected three inserted items, got ${result.value.inserted}`,
  );
  assert(
    result.value.projected === 3,
    `expected three projected feed items, got ${result.value.projected}`,
  );
  assert(
    scanExecutionReporter.succeeded !== undefined,
    'GitHub Trending page scan success report is required',
  );
  assert(
    scanExecutionReporter.failed === undefined,
    'GitHub Trending page smoke must not report scan failure',
  );

  const feed = await feedItems.list({
    tenantId: tenant,
    workspaceId: workspace,
    interestId,
    limit: 10,
  });
  assert(
    feed.items.length === 3,
    `expected three GitHub Trending page feed items, got ${feed.items.length}`,
  );

  const metadataItems = feed.items
    .map((item) =>
      parseGitHubTrendingPageRepositoryMetadata(
        item.toSnapshot().providerMetadata,
      ),
    )
    .filter(
      (metadata): metadata is NonNullable<typeof metadata> => metadata !== null,
    );
  const metadata = metadataItems.find((item) => item.trending.rank === 1);

  assert(
    metadata !== undefined,
    'feed items must expose GitHub Trending page rank #1 metadata',
  );
  assert(
    metadata.repository.fullName === 'calesthio/OpenMontage',
    `unexpected top repository ${metadata.repository.fullName}`,
  );
  assert(
    metadata.trending.rank === 1,
    'top repository must keep GitHub Trending rank',
  );
  assert(
    metadata.trending.starsGained === 3703,
    'top repository must keep stars gained today',
  );

  console.log('GitHub Trending page smoke OK');
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}
