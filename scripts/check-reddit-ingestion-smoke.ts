import { MonitoringSourceConfigReaderAdapter } from '../apps/ingestion-worker/src/adapters/source/monitoring-source-config-reader.adapter';
import { InMemoryFeedProjectionAdapter } from '../apps/ingestion-worker/src/adapters/feed/in-memory-feed-projection.adapter';
import { InMemorySourceProviderRegistry } from '../libs/ingestion/adapters/source/in-memory-source-provider.registry';
import { RegistrySourceFetcherAdapter } from '../libs/ingestion/adapters/source/registry-source-fetcher.adapter';
import { FixtureRedditClient } from '../libs/ingestion/adapters/source/reddit/fixture-reddit-client';
import { RedditSourceProvider } from '../libs/ingestion/adapters/source/reddit/reddit-source.provider';
import type { RedditTokenProviderPort } from '../libs/ingestion/adapters/source/reddit/reddit-token-provider.port';
import { InMemoryScanAttemptRepository } from '../libs/ingestion/adapters/persistence/in-memory-scan-attempt.repository';
import { InMemoryScanCursorRepository } from '../libs/ingestion/adapters/persistence/in-memory-scan-cursor.repository';
import { InMemorySourceItemRepository } from '../libs/ingestion/adapters/persistence/in-memory-source-item.repository';
import { InMemoryScanFailureQueueAdapter } from '../libs/ingestion/adapters/queue/in-memory-scan-failure-queue.adapter';
import { InMemoryScanLeaseAdapter } from '../libs/ingestion/adapters/lease/in-memory-scan-lease.adapter';
import { ExecuteScanUseCase } from '../libs/ingestion/features/execute-scan/execute-scan.use-case';
import type {
  ReportScanFailedCommand,
  ReportScanSucceededCommand,
  ScanExecutionReporterPort,
} from '../libs/ingestion/ports';
import { SourceFetchError } from '../libs/ingestion/ports';
import { InMemoryFeedItemReadRepository } from '../libs/feed/adapters/persistence/in-memory-feed-item-read.repository';
import { InMemorySourceBindingRepository } from '../libs/monitoring/adapters/persistence/in-memory-source-binding.repository';
import { AesGcmSourceBindingConfigProtector } from '../libs/monitoring/adapters/security/aes-gcm-source-binding-config-protector';
import { SourceBinding } from '../libs/monitoring/domain';
import { sourceBindingScanQuery } from '../libs/monitoring/features/shared/source-binding-scan-query';
import { FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

async function main(): Promise<void> {
  const tenant = tenantId('tenant-reddit-smoke');
  const workspace = workspaceId('workspace-reddit-smoke');
  const sourceBindings = new InMemorySourceBindingRepository();
  const protector = new AesGcmSourceBindingConfigProtector(Buffer.alloc(32, 1), 'reddit-smoke-key');
  const protectedConfig = await protector.protect({
    mode: 'listing',
    subreddit: 'observability',
    listing: 'hot',
    userAgent: 'social-monitor-reddit-smoke/0.1',
  });
  const binding = SourceBinding.create({
    id: 'source-binding-reddit-smoke',
    tenantId: tenant,
    workspaceId: workspace,
    topicId: 'topic-reddit-smoke',
    providerKey: 'reddit',
    capabilityProfileVersion: 1,
    config: protectedConfig,
    createdAt: new Date('2026-06-06T00:00:00.000Z'),
  });

  await sourceBindings.save(binding);

  const appTokenProvider = new CapturingRedditTokenProvider('fixture-reddit-app-token');
  const fetcher = new RegistrySourceFetcherAdapter(
    new InMemorySourceProviderRegistry([
      new RedditSourceProvider(new FixtureRedditClient(), appTokenProvider),
    ], []),
    new MonitoringSourceConfigReaderAdapter(sourceBindings, protector),
  );
  const result = await fetcher.fetch({
    tenantId: tenant,
    workspaceId: workspace,
    sourceBindingId: 'source-binding-reddit-smoke',
    scanJobId: 'scan-job-reddit-smoke',
    providerKey: 'reddit',
    sourceQuery: sourceBindingScanQuery(binding.toSnapshot()),
    correlationId: 'reddit-smoke',
  });

  assert(
    JSON.stringify(binding.toSnapshot().config).includes('fixture-reddit-app-token') === false,
    'app-only token must stay outside source binding config',
  );
  assert(appTokenProvider.calls === 1, `expected one Reddit app-only token request, got ${appTokenProvider.calls}`);
  assert(result.items.length === 2, `expected two Reddit fixture items, got ${result.items.length}`);
  assert(result.items[0]?.externalId === 'reddit:t3_fixturepost1', 'first Reddit external id mismatch');
  assert(result.items[0]?.canonicalUrl.startsWith('https://www.reddit.com/r/observability/'), 'canonical URL mismatch');
  assert(result.nextCursor === 't3_fixturepost2', `expected Reddit cursor, got ${result.nextCursor}`);

  const missingTokenConfig = await protector.protect({
    mode: 'listing',
    subreddit: 'observability',
    listing: 'hot',
    userAgent: 'social-monitor-reddit-smoke/0.1',
  });
  const missingTokenBinding = SourceBinding.create({
    id: 'source-binding-reddit-missing-token-smoke',
    tenantId: tenant,
    workspaceId: workspace,
    topicId: 'topic-reddit-smoke',
    providerKey: 'reddit',
    capabilityProfileVersion: 1,
    config: missingTokenConfig,
    createdAt: new Date('2026-06-06T00:00:00.000Z'),
  });
  await sourceBindings.save(missingTokenBinding);

  const fetcherWithoutAppToken = new RegistrySourceFetcherAdapter(
    new InMemorySourceProviderRegistry([new RedditSourceProvider(new FixtureRedditClient())], []),
    new MonitoringSourceConfigReaderAdapter(sourceBindings, protector),
  );
  let authFailure: unknown;
  try {
    await fetcherWithoutAppToken.fetch({
      tenantId: tenant,
      workspaceId: workspace,
      sourceBindingId: 'source-binding-reddit-missing-token-smoke',
      scanJobId: 'scan-job-reddit-missing-token-smoke',
      providerKey: 'reddit',
      sourceQuery: sourceBindingScanQuery(missingTokenBinding.toSnapshot()),
      correlationId: 'reddit-missing-token-smoke',
    });
  } catch (error) {
    authFailure = error;
  }
  assert(authFailure instanceof SourceFetchError, 'missing Reddit access token must throw SourceFetchError');
  assert(authFailure.kind === 'auth_failed', `expected auth_failed, got ${authFailure.kind}`);
  assert(authFailure.retryable === false, 'missing Reddit access token must not be retryable');

  const scanFailures = new InMemoryScanFailureQueueAdapter(new InMemoryMetricsRecorder());
  const scanReporter = new CapturingScanExecutionReporter();
  const executeScanResult = await new ExecuteScanUseCase(
    fetcherWithoutAppToken,
    new InMemorySourceItemRepository(),
    new InMemoryFeedProjectionAdapter(new InMemoryFeedItemReadRepository()),
    new InMemoryScanAttemptRepository(),
    new InMemoryScanCursorRepository(),
    scanReporter,
    scanFailures,
    new InMemoryScanLeaseAdapter(),
    new SequenceIdGenerator(),
    new FixedClock(new Date('2026-06-06T00:01:00.000Z')),
  ).execute({
    tenantId: tenant,
    workspaceId: workspace,
    scanJobId: 'scan-job-reddit-auth-dead-letter-smoke',
    topicId: 'topic-reddit-smoke',
    sourceBindingId: 'source-binding-reddit-missing-token-smoke',
    scanPolicyId: 'scan-policy-reddit-smoke',
    providerKey: 'reddit',
    sourceQuery: sourceBindingScanQuery(missingTokenBinding.toSnapshot()),
    correlationId: 'reddit-auth-dead-letter-smoke',
    causationId: 'reddit-auth-dead-letter-smoke',
    attemptNumber: 1,
    retryBudget: 3,
  });
  assert(!executeScanResult.ok, 'missing Reddit token scan must fail');
  assert(executeScanResult.error instanceof SourceFetchError, 'scan failure must preserve source fetch error');
  assert(executeScanResult.error.kind === 'auth_failed', 'scan failure kind must remain auth_failed');
  assert(scanFailures.retries().length === 0, 'non-retryable Reddit auth failure must not enqueue retry');
  assert(scanFailures.deadLettered().length === 1, 'non-retryable Reddit auth failure must dead-letter immediately');
  assert(scanReporter.failed.length === 1, 'non-retryable Reddit auth failure must report scan failure');

  console.log('Reddit ingestion smoke OK');
}

class CapturingRedditTokenProvider implements RedditTokenProviderPort {
  calls = 0;

  constructor(private readonly accessToken: string) {}

  async getAccessToken(): Promise<string> {
    this.calls += 1;
    return this.accessToken;
  }
}

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `reddit-smoke-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

class CapturingScanExecutionReporter implements ScanExecutionReporterPort {
  readonly succeeded: ReportScanSucceededCommand[] = [];
  readonly failed: ReportScanFailedCommand[] = [];

  async reportSucceeded(command: ReportScanSucceededCommand): Promise<void> {
    this.succeeded.push(command);
  }

  async reportFailed(command: ReportScanFailedCommand): Promise<void> {
    this.failed.push(command);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
