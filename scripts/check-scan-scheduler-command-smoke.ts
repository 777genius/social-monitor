import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { InMemoryQueuePublisher } from '@social-monitor/platform-queue/adapters/in-memory';
import { WorkerRuntime } from '@social-monitor/platform-worker';
import { FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { InMemoryScanJobRepository } from '../libs/monitoring/adapters/persistence/in-memory-scan-job.repository';
import { InMemoryScanPolicyRepository } from '../libs/monitoring/adapters/persistence/in-memory-scan-policy.repository';
import { InMemorySourceBindingRepository } from '../libs/monitoring/adapters/persistence/in-memory-source-binding.repository';
import { InMemoryScanQueueAdapter } from '../libs/monitoring/adapters/queue/in-memory-scan-queue.adapter';
import { ScanPolicy, SourceBinding } from '../libs/monitoring/domain';
import { ScheduleDueScansUseCase } from '../libs/monitoring/features/schedule-due-scans/schedule-due-scans.use-case';
import { ScheduleDueScansCommandHandler } from '../libs/monitoring/interfaces/queue/schedule-due-scans-command.handler';

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `scan-scheduler-smoke-${this.nextId}`;
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
  const tenant = tenantId('tenant-scan-scheduler-smoke');
  const workspace = workspaceId('workspace-scan-scheduler-smoke');
  const now = new Date('2026-06-06T10:00:00.000Z');
  const bindings = new InMemorySourceBindingRepository();
  const policies = new InMemoryScanPolicyRepository();
  const jobs = new InMemoryScanJobRepository();
  const queuePublisher = new InMemoryQueuePublisher();
  const metrics = new InMemoryMetricsRecorder();
  const scanQueue = new InMemoryScanQueueAdapter(queuePublisher, metrics);
  const runtime = new WorkerRuntime({ serviceName: 'ingestion-worker' });
  runtime.onModuleInit();

  await bindings.save(SourceBinding.create({
    id: 'source-binding-scheduler-smoke',
    tenantId: tenant,
    workspaceId: workspace,
    topicId: 'topic-scheduler-smoke',
    providerKey: 'hacker-news',
    capabilityProfileVersion: 1,
    config: {
      mode: 'listing',
      listing: 'top',
    },
    createdAt: new Date('2026-06-06T09:00:00.000Z'),
  }));
  await policies.save(ScanPolicy.create({
    id: 'scan-policy-scheduler-smoke',
    tenantId: tenant,
    workspaceId: workspace,
    sourceBindingId: 'source-binding-scheduler-smoke',
    intervalSeconds: 300,
    freshnessSeconds: 900,
    retryBudget: 2,
    nextRunAt: new Date('2026-06-06T09:59:00.000Z'),
    createdAt: new Date('2026-06-06T09:00:00.000Z'),
  }));

  const result = await new ScheduleDueScansCommandHandler(
    new ScheduleDueScansUseCase(
      bindings,
      policies,
      jobs,
      scanQueue,
      new SequenceIdGenerator(),
      new FixedClock(now),
    ),
    metrics,
    runtime,
  ).handle({
    commandId: 'command-scan-scheduler-smoke',
    commandType: 'monitoring.scans.schedule_due',
    schemaVersion: 1,
    correlationId: 'correlation-scan-scheduler-smoke',
    payload: {
      tenantId: tenant,
      workspaceId: workspace,
      limit: 10,
    },
  });

  assert(result.evaluated === 1, `expected one evaluated policy, got ${result.evaluated}`);
  assert(result.enqueued === 1, `expected one enqueued scan, got ${result.enqueued}`);
  assert(result.skipped === 0, `expected zero skipped scans, got ${result.skipped}`);

  const queued = queuePublisher.all();
  assert(queued.length === 1, `expected one queued scan command, got ${queued.length}`);
  const queuedCommand = queued[0];
  assert(queuedCommand !== undefined, 'scheduler must enqueue one scan execution command');
  assert(queuedCommand.commandType === 'ingestion.scan.execute', 'scheduler must enqueue scan execution command');
  assert(
    queuedCommand.payload.providerKey === 'hacker-news',
    `expected HN provider payload, got ${JSON.stringify(queuedCommand.payload)}`,
  );
  const sourceQuery = queuedCommand.payload.sourceQuery;
  assert(
    sourceQuery !== undefined &&
      sourceQuery !== null &&
      typeof sourceQuery === 'object' &&
      'mode' in sourceQuery &&
      sourceQuery.mode === 'listing',
    `expected listing source query, got ${JSON.stringify(sourceQuery)}`,
  );

  const latestJob = await jobs.findLatestBySourceBinding({
    tenantId: tenant,
    workspaceId: workspace,
    sourceBindingId: 'source-binding-scheduler-smoke',
  });
  assert(latestJob?.toSnapshot().status === 'enqueued', 'scheduled scan job must be marked enqueued');

  const advancedPolicy = await policies.findBySourceBinding({
    tenantId: tenant,
    workspaceId: workspace,
    sourceBindingId: 'source-binding-scheduler-smoke',
  });
  assert(
    advancedPolicy?.toSnapshot().nextRunAt.toISOString() === '2026-06-06T10:04:00.000Z',
    `scheduled policy must advance next run, got ${advancedPolicy?.toSnapshot().nextRunAt.toISOString()}`,
  );

  assert(
    metrics.counterValue('monitoring_scan_scheduler_runs_total', {
      status: 'succeeded',
      worker: 'ingestion-worker',
    }) === 1,
    'scheduler handler must record succeeded metric',
  );
  assert(
    metrics.latestGaugeValue('monitoring_scan_scheduler_last_enqueued', { worker: 'ingestion-worker' }) === 1,
    'scheduler handler must record enqueued gauge',
  );

  console.log('Scan scheduler command smoke OK');
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
