import { InMemoryFeedItemReadRepository } from '@social-monitor/feed/adapters/persistence/in-memory-feed-item-read.repository';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { InMemoryQueuePublisher } from '@social-monitor/platform-queue';
import { WorkerRuntime } from '@social-monitor/platform-worker';
import { FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { InMemoryFeedProjectionAdapter } from '../apps/ingestion-worker/src/adapters/feed/in-memory-feed-projection.adapter';
import { ScanQueueDrainLoop } from '../apps/ingestion-worker/src/scan-queue-drain-loop';
import { NoopScanExecutionReporterAdapter } from '../libs/ingestion/adapters/reporting/noop-scan-execution-reporter.adapter';
import { InMemoryScanLeaseAdapter } from '../libs/ingestion/adapters/lease/in-memory-scan-lease.adapter';
import { InMemoryScanAttemptRepository } from '../libs/ingestion/adapters/persistence/in-memory-scan-attempt.repository';
import { InMemoryScanCursorRepository } from '../libs/ingestion/adapters/persistence/in-memory-scan-cursor.repository';
import { InMemorySourceItemRepository } from '../libs/ingestion/adapters/persistence/in-memory-source-item.repository';
import { InMemoryScanFailureQueueAdapter } from '../libs/ingestion/adapters/queue/in-memory-scan-failure-queue.adapter';
import { FakeSourceProvider } from '../libs/ingestion/adapters/source/fake-source.provider';
import { InMemorySourceProviderRegistry } from '../libs/ingestion/adapters/source/in-memory-source-provider.registry';
import { RegistrySourceFetcherAdapter } from '../libs/ingestion/adapters/source/registry-source-fetcher.adapter';
import { sourceReadinessProfiles } from '../libs/ingestion/adapters/source/source-readiness-profiles';
import { ExecuteScanUseCase } from '../libs/ingestion/features/execute-scan/execute-scan.use-case';
import { ExecuteScanCommandHandler } from '../libs/ingestion/interfaces/queue/execute-scan-command.handler';
import { InMemoryScanJobRepository } from '../libs/monitoring/adapters/persistence/in-memory-scan-job.repository';
import { InMemoryScanPolicyRepository } from '../libs/monitoring/adapters/persistence/in-memory-scan-policy.repository';
import { InMemorySourceBindingRepository } from '../libs/monitoring/adapters/persistence/in-memory-source-binding.repository';
import { InMemoryScanQueueAdapter } from '../libs/monitoring/adapters/queue/in-memory-scan-queue.adapter';
import { ScanPolicy, SourceBinding } from '../libs/monitoring/domain';
import { ScheduleDueScansUseCase } from '../libs/monitoring/features/schedule-due-scans/schedule-due-scans.use-case';

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `scan-queue-drain-loop-smoke-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

async function main(): Promise<void> {
  const tenant = tenantId('tenant-scan-queue-drain-loop-smoke');
  const workspace = workspaceId('workspace-scan-queue-drain-loop-smoke');
  const now = new Date('2026-06-06T10:00:00.000Z');
  const bindings = new InMemorySourceBindingRepository();
  const scanPolicies = new InMemoryScanPolicyRepository();
  const scanJobs = new InMemoryScanJobRepository();
  const queuePublisher = new InMemoryQueuePublisher();
  const metrics = new InMemoryMetricsRecorder();
  const feedItems = new InMemoryFeedItemReadRepository();
  const sourceItems = new InMemorySourceItemRepository();
  const scanAttempts = new InMemoryScanAttemptRepository();
  const scanCursors = new InMemoryScanCursorRepository();
  const scanFailures = new InMemoryScanFailureQueueAdapter(metrics);
  const scanLeases = new InMemoryScanLeaseAdapter();
  const runtime = new WorkerRuntime({ serviceName: 'ingestion-worker' });
  runtime.onModuleInit();

  await bindings.save(SourceBinding.create({
    id: 'source-binding-drain-loop-smoke',
    tenantId: tenant,
    workspaceId: workspace,
    topicId: 'topic-drain-loop-smoke',
    providerKey: 'fake-source',
    capabilityProfileVersion: 1,
    config: {
      mode: 'search',
      query: 'drain loop monitoring',
    },
    createdAt: new Date('2026-06-06T09:00:00.000Z'),
  }));
  await scanPolicies.save(ScanPolicy.create({
    id: 'scan-policy-drain-loop-smoke',
    tenantId: tenant,
    workspaceId: workspace,
    sourceBindingId: 'source-binding-drain-loop-smoke',
    intervalSeconds: 300,
    freshnessSeconds: 900,
    retryBudget: 2,
    nextRunAt: new Date('2026-06-06T09:59:00.000Z'),
    createdAt: new Date('2026-06-06T09:00:00.000Z'),
  }));

  const scheduled = await new ScheduleDueScansUseCase(
    bindings,
    scanPolicies,
    scanJobs,
    new InMemoryScanQueueAdapter(queuePublisher, metrics),
    new SequenceIdGenerator(),
    new FixedClock(now),
  ).execute({
    tenantId: tenant,
    workspaceId: workspace,
    limit: 10,
    correlationId: 'scan-queue-drain-loop-smoke',
  });

  if (!scheduled.ok) {
    throw scheduled.error;
  }

  assert(scheduled.value.enqueued === 1, `expected one enqueued scan, got ${scheduled.value.enqueued}`);
  assert(queuePublisher.all().length === 1, `expected one queued scan command, got ${queuePublisher.all().length}`);
  const queuedCommand = queuePublisher.all()[0];
  assert(queuedCommand !== undefined, 'expected queued scan command to exist before drain');
  assert(
    typeof queuedCommand.payload.scanJobId === 'string',
    'expected queued scan command payload to include scanJobId',
  );

  const loop = new ScanQueueDrainLoop(
    queuePublisher,
    new ExecuteScanCommandHandler(
      new ExecuteScanUseCase(
        new RegistrySourceFetcherAdapter(
          new InMemorySourceProviderRegistry([new FakeSourceProvider()], sourceReadinessProfiles),
        ),
        sourceItems,
        new InMemoryFeedProjectionAdapter(feedItems),
        scanAttempts,
        scanCursors,
        new NoopScanExecutionReporterAdapter(),
        scanFailures,
        scanLeases,
        new SequenceIdGenerator(),
        new FixedClock(new Date('2026-06-06T10:00:01.000Z')),
      ),
      metrics,
      runtime,
    ),
    {
      enabled: true,
      intervalMs: 60_000,
      limit: 10,
      runOnStart: true,
    },
  );

  await loop.onModuleInit();
  await loop.onApplicationShutdown('scan-queue-drain-loop-smoke-complete');
  await runtime.onApplicationShutdown('scan-queue-drain-loop-smoke-complete');

  assert(queuePublisher.all().length === 0, `drain loop must empty scan queue, got ${queuePublisher.all().length}`);
  assert(sourceItems.all().length === 2, `drain loop must persist two source items, got ${sourceItems.all().length}`);

  const feed = await feedItems.list({ tenantId: tenant, workspaceId: workspace, limit: 10 });
  assert(feed.items.length === 2, `drain loop must project two feed items, got ${feed.items.length}`);

  const attempt = await scanAttempts.findByScanJob({
    tenantId: tenant,
    workspaceId: workspace,
    scanJobId: queuedCommand.payload.scanJobId,
  });
  assert(attempt?.toSnapshot().status === 'succeeded', `expected succeeded scan attempt, got ${attempt?.toSnapshot().status}`);
  assert(
    metrics.counterValue('scan_jobs_total', {
      job_type: 'scan',
      status: 'started',
      worker: 'ingestion-worker',
    }) === 1,
    'drain loop must record started scan metric',
  );
  assert(
    metrics.counterValue('scan_jobs_total', {
      job_type: 'scan',
      status: 'succeeded',
      worker: 'ingestion-worker',
    }) === 1,
    'drain loop must record succeeded scan metric',
  );

  console.log('Scan queue drain loop smoke OK');
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
