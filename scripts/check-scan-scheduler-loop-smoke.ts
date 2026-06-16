import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { InMemoryQueuePublisher } from '@social-monitor/platform-queue';
import { WorkerRuntime } from '@social-monitor/platform-worker';
import { FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { InMemoryScanJobRepository } from '../libs/monitoring/adapters/persistence/in-memory-scan-job.repository';
import { InMemoryScanPolicyRepository } from '../libs/monitoring/adapters/persistence/in-memory-scan-policy.repository';
import { InMemorySourceBindingRepository } from '../libs/monitoring/adapters/persistence/in-memory-source-binding.repository';
import { InMemoryScanQueueAdapter } from '../libs/monitoring/adapters/queue/in-memory-scan-queue.adapter';
import { ScanPolicy, SourceBinding } from '../libs/monitoring/domain';
import { ScheduleDueScansUseCase } from '../libs/monitoring/features/schedule-due-scans/schedule-due-scans.use-case';
import { ScheduleDueScansCommandHandler } from '../libs/monitoring/interfaces/queue/schedule-due-scans-command.handler';
import { ScanSchedulerLoop } from '../apps/ingestion-worker/src/scan-scheduler-loop';

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `scan-scheduler-loop-smoke-${this.nextId}`;
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
  const tenant = tenantId('tenant-scan-scheduler-loop-smoke');
  const workspace = workspaceId('workspace-scan-scheduler-loop-smoke');
  const now = new Date('2026-06-06T10:00:00.000Z');
  const bindings = new InMemorySourceBindingRepository();
  const policies = new InMemoryScanPolicyRepository();
  const jobs = new InMemoryScanJobRepository();
  const queuePublisher = new InMemoryQueuePublisher();
  const metrics = new InMemoryMetricsRecorder();
  const runtime = new WorkerRuntime({ serviceName: 'ingestion-worker' });
  runtime.onModuleInit();

  await bindings.save(SourceBinding.create({
    id: 'source-binding-scheduler-loop-smoke',
    tenantId: tenant,
    workspaceId: workspace,
    topicId: 'topic-scheduler-loop-smoke',
    providerKey: 'rss',
    capabilityProfileVersion: 1,
    config: {
      feedUrl: 'https://example.test/feed.xml',
    },
    createdAt: new Date('2026-06-06T09:00:00.000Z'),
  }));
  await policies.save(ScanPolicy.create({
    id: 'scan-policy-scheduler-loop-smoke',
    tenantId: tenant,
    workspaceId: workspace,
    sourceBindingId: 'source-binding-scheduler-loop-smoke',
    intervalSeconds: 300,
    freshnessSeconds: 900,
    retryBudget: 2,
    nextRunAt: new Date('2026-06-06T09:59:00.000Z'),
    createdAt: new Date('2026-06-06T09:00:00.000Z'),
  }));
  await bindings.save(SourceBinding.create({
    id: 'paused-source-binding-scheduler-loop-smoke',
    tenantId: tenant,
    workspaceId: workspace,
    topicId: 'paused-topic-scheduler-loop-smoke',
    providerKey: 'rss',
    capabilityProfileVersion: 1,
    config: {
      feedUrl: 'https://example.test/paused-feed.xml',
    },
    createdAt: new Date('2026-06-06T09:00:00.000Z'),
  }).pause());
  await policies.save(ScanPolicy.create({
    id: 'paused-scan-policy-scheduler-loop-smoke',
    tenantId: tenant,
    workspaceId: workspace,
    sourceBindingId: 'paused-source-binding-scheduler-loop-smoke',
    intervalSeconds: 300,
    freshnessSeconds: 900,
    retryBudget: 2,
    nextRunAt: new Date('2026-06-06T09:59:30.000Z'),
    createdAt: new Date('2026-06-06T09:00:00.000Z'),
  }));

  const loop = new ScanSchedulerLoop(
    new ScheduleDueScansCommandHandler(
      new ScheduleDueScansUseCase(
        bindings,
        policies,
        jobs,
        new InMemoryScanQueueAdapter(queuePublisher, metrics),
        new SequenceIdGenerator(),
        new FixedClock(now),
      ),
      metrics,
      runtime,
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

  await loop.onModuleInit();
  await loop.onApplicationShutdown('scan-scheduler-loop-smoke-complete');
  await runtime.onApplicationShutdown('scan-scheduler-loop-smoke-complete');

  const queued = queuePublisher.all();
  assert(queued.length === 1, `expected one scheduled scan command, got ${queued.length}`);
  assert(queued[0]?.commandType === 'ingestion.scan.execute', 'loop must enqueue scan execution command');
  assert(queued[0]?.payload.providerKey === 'rss', `expected RSS provider payload, got ${JSON.stringify(queued[0]?.payload)}`);
  assert(
    queued[0]?.payload.sourceBindingId === 'source-binding-scheduler-loop-smoke',
    `paused source binding must not enqueue scan commands, got ${JSON.stringify(queued[0]?.payload)}`,
  );
  assert(
    metrics.counterValue('monitoring_scan_scheduler_runs_total', {
      status: 'succeeded',
      worker: 'ingestion-worker',
    }) === 1,
    'loop tick must record successful scheduler run',
  );

  const advancedPolicy = await policies.findBySourceBinding({
    tenantId: tenant,
    workspaceId: workspace,
    sourceBindingId: 'source-binding-scheduler-loop-smoke',
  });
  assert(
    advancedPolicy?.toSnapshot().nextRunAt.toISOString() === '2026-06-06T10:04:00.000Z',
    `scheduled policy must advance next run, got ${advancedPolicy?.toSnapshot().nextRunAt.toISOString()}`,
  );
  const pausedPolicy = await policies.findBySourceBinding({
    tenantId: tenant,
    workspaceId: workspace,
    sourceBindingId: 'paused-source-binding-scheduler-loop-smoke',
  });
  assert(
    pausedPolicy?.toSnapshot().nextRunAt.toISOString() === '2026-06-06T09:59:30.000Z',
    `paused source binding policy must not advance next run, got ${pausedPolicy?.toSnapshot().nextRunAt.toISOString()}`,
  );

  console.log('Scan scheduler loop smoke OK');
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
