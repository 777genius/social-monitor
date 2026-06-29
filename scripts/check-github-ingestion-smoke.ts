import { InMemoryFeedItemReadRepository } from '@social-monitor/feed/adapters/persistence/in-memory-feed-item-read.repository';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { WorkerRuntime } from '@social-monitor/platform-worker';
import { CryptoIdGenerator, FixedClock, type IdGenerator, SystemClock, tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { InMemoryQueuePublisher } from '@social-monitor/platform-queue/adapters/in-memory';

import { InMemoryFeedProjectionAdapter } from '../apps/ingestion-worker/src/adapters/feed/in-memory-feed-projection.adapter';
import { InMemoryScanCommandQueueReader } from '../apps/ingestion-worker/src/scan-command-queue-reader';
import { ScanQueueDrainLoop } from '../apps/ingestion-worker/src/scan-queue-drain-loop';
import { ScanSchedulerLoop } from '../apps/ingestion-worker/src/scan-scheduler-loop';
import { InMemoryScanLeaseAdapter } from '../libs/ingestion/adapters/lease/in-memory-scan-lease.adapter';
import { InMemoryScanAttemptRepository } from '../libs/ingestion/adapters/persistence/in-memory-scan-attempt.repository';
import { InMemoryScanCursorRepository } from '../libs/ingestion/adapters/persistence/in-memory-scan-cursor.repository';
import { InMemorySourceItemRepository } from '../libs/ingestion/adapters/persistence/in-memory-source-item.repository';
import { InMemoryScanFailureQueueAdapter } from '../libs/ingestion/adapters/queue/in-memory-scan-failure-queue.adapter';
import { CircuitBreakerSourceFetcherAdapter } from '../libs/ingestion/adapters/source/circuit-breaker-source-fetcher.adapter';
import { FixtureGitHubClient } from '../libs/ingestion/adapters/source/github/fixture-github-client';
import {
  GITHUB_ISSUES_PROVIDER_KEY,
  GitHubSourceProvider,
  LEGACY_GITHUB_ISSUES_PROVIDER_KEY,
} from '../libs/ingestion/adapters/source/github/github-source.provider';
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
import { InMemoryScanJobRepository } from '../libs/monitoring/adapters/persistence/in-memory-scan-job.repository';
import { InMemoryScanPolicyRepository } from '../libs/monitoring/adapters/persistence/in-memory-scan-policy.repository';
import { InMemorySourceBindingRepository } from '../libs/monitoring/adapters/persistence/in-memory-source-binding.repository';
import { InMemoryScanQueueAdapter } from '../libs/monitoring/adapters/queue/in-memory-scan-queue.adapter';
import { ScanPolicy, SourceBinding } from '../libs/monitoring/domain';
import { RecordScanExecutionUseCase } from '../libs/monitoring/features/record-scan-execution/record-scan-execution.use-case';
import { ScheduleDueScansUseCase } from '../libs/monitoring/features/schedule-due-scans/schedule-due-scans.use-case';
import { ScheduleDueScansCommandHandler } from '../libs/monitoring/interfaces/queue/schedule-due-scans-command.handler';

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

class MonitoringScanExecutionReporter implements ScanExecutionReporterPort {
  constructor(private readonly recordScanExecution: RecordScanExecutionUseCase) {}

  async reportSucceeded(command: ReportScanSucceededCommand): Promise<void> {
    const result = await this.recordScanExecution.execute({
      ...command,
      status: 'succeeded',
    });
    if (!result.ok) {
      throw reportScanExecutionError(result.error, command.scanJobId, 'succeeded');
    }
  }

  async reportFailed(command: ReportScanFailedCommand): Promise<void> {
    const result = await this.recordScanExecution.execute({
      ...command,
      status: 'failed',
      failureReason: command.failureReason,
    });
    if (!result.ok) {
      throw reportScanExecutionError(result.error, command.scanJobId, 'failed');
    }
  }
}

const reportScanExecutionError = (error: unknown, scanJobId: string, status: string): Error => {
  const message = error instanceof Error ? error.message : JSON.stringify(error);

  return new Error(`GitHub scheduled smoke could not record ${status} scan job ${scanJobId}: ${message}`);
};

class StaticSourceConfigReader implements SourceConfigReaderPort {
  async readConfig(): Promise<SourceRuntimeConfig> {
    return {
      maxItems: 1,
    };
  }
}

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  constructor(private readonly prefix: string) {}

  generate(): string {
    const id = `${this.prefix}-${this.nextId}`;
    this.nextId += 1;
    return id;
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
  const registry = new InMemorySourceProviderRegistry(
    [provider],
    sourceReadinessProfiles,
    [{ providerKey: LEGACY_GITHUB_ISSUES_PROVIDER_KEY, canonicalProviderKey: GITHUB_ISSUES_PROVIDER_KEY }],
  );
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
        interestId: 'topic-github-smoke',
        sourceBindingId: 'github-binding-smoke',
        scanPolicyId: 'github-policy-smoke',
        providerKey: LEGACY_GITHUB_ISSUES_PROVIDER_KEY,
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
        interestId: 'topic-github-smoke',
        sourceBindingId: 'github-binding-smoke',
        scanPolicyId: 'github-policy-smoke',
        providerKey: LEGACY_GITHUB_ISSUES_PROVIDER_KEY,
        sourceQuery: { mode: 'search', query: 'social monitoring repo:777genius/social-monitor' },
      },
      schemaVersion: 1,
    });
    const feedResult = await feedItems.list({
      tenantId: tenant,
      workspaceId: workspace,
      interestId: 'topic-github-smoke',
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

    await proveScheduledGitHubCollection({
      tenant,
      workspace,
      provider,
    });

    console.log('GitHub ingestion smoke OK');
  } finally {
    await runtime.onApplicationShutdown('github-smoke-complete');
  }
};

const proveScheduledGitHubCollection = async ({
  tenant,
  workspace,
  provider,
}: {
  readonly tenant: ReturnType<typeof tenantId>;
  readonly workspace: ReturnType<typeof workspaceId>;
  readonly provider: GitHubSourceProvider;
}): Promise<void> => {
  const bindings = new InMemorySourceBindingRepository();
  const policies = new InMemoryScanPolicyRepository();
  const jobs = new InMemoryScanJobRepository();
  const queuePublisher = new InMemoryQueuePublisher();
  const queueReader = new InMemoryScanCommandQueueReader(queuePublisher);
  const metrics = new InMemoryMetricsRecorder();
  const feedItems = new InMemoryFeedItemReadRepository();
  const sourceItems = new InMemorySourceItemRepository();
  const scanAttempts = new InMemoryScanAttemptRepository();
  const scanCursors = new InMemoryScanCursorRepository();
  const scanFailures = new InMemoryScanFailureQueueAdapter(metrics);
  const scanLeases = new InMemoryScanLeaseAdapter();
  const bindingId = 'github-binding-scheduled-smoke';
  const policyId = 'github-policy-scheduled-smoke';
  const interestId = 'topic-github-scheduled-smoke';

  await bindings.save(SourceBinding.create({
    id: bindingId,
    tenantId: tenant,
    workspaceId: workspace,
    interestId,
    providerKey: LEGACY_GITHUB_ISSUES_PROVIDER_KEY,
    capabilityProfileVersion: 1,
    config: {
      mode: 'search',
      query: 'social monitoring repo:777genius/social-monitor',
    },
    createdAt: new Date('2026-06-06T09:00:00.000Z'),
  }));
  await policies.save(ScanPolicy.create({
    id: policyId,
    tenantId: tenant,
    workspaceId: workspace,
    sourceBindingId: bindingId,
    intervalSeconds: 300,
    freshnessSeconds: 900,
    retryBudget: 2,
    nextRunAt: new Date('2026-06-06T09:59:00.000Z'),
    createdAt: new Date('2026-06-06T09:00:00.000Z'),
  }));

  await runScheduledGitHubTick({
    triggerTime: new Date('2026-06-06T10:00:00.000Z'),
    tenant,
    workspace,
    provider,
    bindings,
    policies,
    jobs,
    queuePublisher,
    queueReader,
    metrics,
    feedItems,
    sourceItems,
    scanAttempts,
    scanCursors,
    scanFailures,
    scanLeases,
    expectedFeedCount: 1,
    expectedNextRunAt: '2026-06-06T10:04:00.000Z',
    signal: 'github-scheduled-smoke-first',
  });

  const firstCursor = await scanCursors.findBySourceBinding({
    tenantId: tenant,
    workspaceId: workspace,
    sourceBindingId: bindingId,
  });
  assert(firstCursor?.cursor === '1', `expected scheduled GitHub cursor "1", got ${JSON.stringify(firstCursor)}`);

  await runScheduledGitHubTick({
    triggerTime: new Date('2026-06-06T10:05:00.000Z'),
    tenant,
    workspace,
    provider,
    bindings,
    policies,
    jobs,
    queuePublisher,
    queueReader,
    metrics,
    feedItems,
    sourceItems,
    scanAttempts,
    scanCursors,
    scanFailures,
    scanLeases,
    expectedFeedCount: 1,
    expectedNextRunAt: '2026-06-06T10:15:01.000Z',
    signal: 'github-scheduled-smoke-second',
    expectedQueued: false,
  });

  await runScheduledGitHubTick({
    triggerTime: new Date('2026-06-06T10:16:00.000Z'),
    tenant,
    workspace,
    provider,
    bindings,
    policies,
    jobs,
    queuePublisher,
    queueReader,
    metrics,
    feedItems,
    sourceItems,
    scanAttempts,
    scanCursors,
    scanFailures,
    scanLeases,
    expectedFeedCount: 2,
    expectedNextRunAt: '2026-06-06T10:20:01.000Z',
    signal: 'github-scheduled-smoke-third',
  });

  const feed = await feedItems.list({
    tenantId: tenant,
    workspaceId: workspace,
    interestId,
    limit: 10,
  });
  const titles = feed.items.map((item) => item.toSnapshot().title).sort();
  assert(
    titles.join('|') === 'Document GitHub source limitations|Improve social monitoring scan reliability',
    `scheduled GitHub loop produced unexpected feed titles: ${titles.join('|')}`,
  );
};

const runScheduledGitHubTick = async ({
  triggerTime,
  tenant,
  workspace,
  provider,
  bindings,
  policies,
  jobs,
  queuePublisher,
  queueReader,
  metrics,
  feedItems,
  sourceItems,
  scanAttempts,
  scanCursors,
  scanFailures,
  scanLeases,
  expectedFeedCount,
  expectedNextRunAt,
  signal,
  expectedQueued,
}: {
  readonly triggerTime: Date;
  readonly tenant: ReturnType<typeof tenantId>;
  readonly workspace: ReturnType<typeof workspaceId>;
  readonly provider: GitHubSourceProvider;
  readonly bindings: InMemorySourceBindingRepository;
  readonly policies: InMemoryScanPolicyRepository;
  readonly jobs: InMemoryScanJobRepository;
  readonly queuePublisher: InMemoryQueuePublisher;
  readonly queueReader: InMemoryScanCommandQueueReader;
  readonly metrics: InMemoryMetricsRecorder;
  readonly feedItems: InMemoryFeedItemReadRepository;
  readonly sourceItems: InMemorySourceItemRepository;
  readonly scanAttempts: InMemoryScanAttemptRepository;
  readonly scanCursors: InMemoryScanCursorRepository;
  readonly scanFailures: InMemoryScanFailureQueueAdapter;
  readonly scanLeases: InMemoryScanLeaseAdapter;
  readonly expectedFeedCount: number;
  readonly expectedNextRunAt: string;
  readonly signal: string;
  readonly expectedQueued?: boolean;
}): Promise<void> => {
  const schedulerRuntime = new WorkerRuntime({ serviceName: 'ingestion-worker' });
  schedulerRuntime.onModuleInit();
  const scheduleLoop = new ScanSchedulerLoop(
    new ScheduleDueScansCommandHandler(
      new ScheduleDueScansUseCase(
        bindings,
        policies,
        jobs,
        new InMemoryScanQueueAdapter(queuePublisher, metrics),
        new SequenceIdGenerator(`${signal}-job`),
        new FixedClock(triggerTime),
      ),
      metrics,
      schedulerRuntime,
    ),
    {
      enabled: true,
      intervalMs: 60_000,
      limit: 10,
      runOnStart: true,
      tenantId: tenant,
      workspaceId: workspace,
    },
  );
  await scheduleLoop.onModuleInit();
  await scheduleLoop.onApplicationShutdown(`${signal}-schedule-complete`);
  await schedulerRuntime.onApplicationShutdown(`${signal}-schedule-complete`);

  const shouldQueue = expectedQueued ?? true;
  if (!shouldQueue) {
    assert(queuePublisher.all().length === 0, `${signal}: expected no queued GitHub scan inside freshness window`);
  } else {
    assert(queuePublisher.all().length === 1, `${signal}: expected one queued GitHub scan`);
    assert(
      queuePublisher.all()[0]?.payload.providerKey === LEGACY_GITHUB_ISSUES_PROVIDER_KEY,
      `${signal}: queued scan must target legacy GitHub issues alias`,
    );
  }

  if (shouldQueue) {
    const drainRuntime = new WorkerRuntime({ serviceName: 'ingestion-worker' });
    drainRuntime.onModuleInit();
    const handler = new ExecuteScanCommandHandler(
      new ExecuteScanUseCase(
        new RegistrySourceFetcherAdapter(
          new InMemorySourceProviderRegistry(
            [provider],
            sourceReadinessProfiles,
            [{ providerKey: LEGACY_GITHUB_ISSUES_PROVIDER_KEY, canonicalProviderKey: GITHUB_ISSUES_PROVIDER_KEY }],
          ),
          new StaticSourceConfigReader(),
        ),
        sourceItems,
        new InMemoryFeedProjectionAdapter(feedItems),
        scanAttempts,
        scanCursors,
        new MonitoringScanExecutionReporter(new RecordScanExecutionUseCase(jobs)),
        scanFailures,
        scanLeases,
        new SequenceIdGenerator(`${signal}-item`),
        new FixedClock(new Date(triggerTime.getTime() + 1000)),
      ),
      metrics,
      drainRuntime,
    );
    const drainLoop = new ScanQueueDrainLoop(
      queueReader,
      handler,
      scanFailures,
      {
        enabled: true,
        intervalMs: 60_000,
        limit: 10,
        runOnStart: true,
      },
      metrics,
      new FixedClock(new Date(triggerTime.getTime() + 1000)),
    );
    try {
      await drainLoop.onModuleInit();
      await drainLoop.onApplicationShutdown(`${signal}-drain-complete`);
    } finally {
      await drainRuntime.onApplicationShutdown(`${signal}-drain-complete`);
    }
  }

  assert(queuePublisher.all().length === 0, `${signal}: drain loop must empty scheduled GitHub queue`);
  assert(
    scanFailures.deadLettered().length === 0,
    `${signal}: scheduled GitHub drain dead-lettered ${JSON.stringify(scanFailures.deadLettered())}`,
  );
  assert(
    scanFailures.retries().length === 0,
    `${signal}: scheduled GitHub drain enqueued retries ${JSON.stringify(scanFailures.retries())}`,
  );

  const policy = await policies.findBySourceBinding({
    tenantId: tenant,
    workspaceId: workspace,
    sourceBindingId: 'github-binding-scheduled-smoke',
  });
  assert(
    policy?.toSnapshot().nextRunAt.toISOString() === expectedNextRunAt,
    `${signal}: expected nextRunAt ${expectedNextRunAt}, got ${policy?.toSnapshot().nextRunAt.toISOString()}`,
  );

  const feed = await feedItems.list({
    tenantId: tenant,
    workspaceId: workspace,
    interestId: 'topic-github-scheduled-smoke',
    limit: 10,
  });
  assert(feed.items.length === expectedFeedCount, `${signal}: expected ${expectedFeedCount} GitHub feed items, got ${feed.items.length}`);
  assert(
    metrics.counterValue('scan_jobs_total', {
      job_type: 'scan',
      status: 'succeeded',
      worker: 'ingestion-worker',
    }) >= expectedFeedCount,
    `${signal}: scheduled GitHub drain must record succeeded scan metric`,
  );
};

void run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
