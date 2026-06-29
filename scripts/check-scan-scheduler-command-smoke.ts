import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { InMemoryQueuePublisher } from '@social-monitor/platform-queue/adapters/in-memory';
import { WorkerRuntime } from '@social-monitor/platform-worker';
import { FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { InMemoryScanJobRepository } from '../libs/monitoring/adapters/persistence/in-memory-scan-job.repository';
import { InMemoryScanPolicyRepository } from '../libs/monitoring/adapters/persistence/in-memory-scan-policy.repository';
import { InMemorySourceBindingRepository } from '../libs/monitoring/adapters/persistence/in-memory-source-binding.repository';
import { InMemoryScanQueueAdapter } from '../libs/monitoring/adapters/queue/in-memory-scan-queue.adapter';
import { ScanJob, ScanPolicy, SourceBinding } from '../libs/monitoring/domain';
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
    interestId: 'topic-scheduler-smoke',
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
  await bindings.save(SourceBinding.create({
    id: 'source-binding-scheduler-smoke-reddit-fresh',
    tenantId: tenant,
    workspaceId: workspace,
    interestId: 'topic-scheduler-smoke-reddit',
    providerKey: 'reddit',
    capabilityProfileVersion: 1,
    config: {
      subreddit: 'programming',
      listing: 'hot',
    },
    createdAt: new Date('2026-06-06T09:00:00.000Z'),
  }));
  await policies.save(ScanPolicy.create({
    id: 'scan-policy-scheduler-smoke-reddit-fresh',
    tenantId: tenant,
    workspaceId: workspace,
    sourceBindingId: 'source-binding-scheduler-smoke-reddit-fresh',
    intervalSeconds: 60,
    freshnessSeconds: 60,
    retryBudget: 2,
    nextRunAt: new Date('2026-06-06T09:59:30.000Z'),
    createdAt: new Date('2026-06-06T09:00:00.000Z'),
  }));
  await jobs.save(ScanJob.request({
    id: 'reddit-fresh-completed-scan-job-scheduler-smoke',
    tenantId: tenant,
    workspaceId: workspace,
    sourceBindingId: 'source-binding-scheduler-smoke-reddit-fresh',
    scanPolicyId: 'scan-policy-scheduler-smoke-reddit-fresh',
    idempotencyKey: 'manual:reddit-fresh-completed-scan-job-scheduler-smoke',
    requestedAt: new Date('2026-06-06T09:54:00.000Z'),
  }).markEnqueued({
    enqueuedAt: new Date('2026-06-06T09:54:01.000Z'),
  }).markSucceeded({
    completedAt: new Date('2026-06-06T09:55:00.000Z'),
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
      includeDecisions: true,
    },
  });

  assert(result.evaluated === 2, `expected two evaluated policies, got ${result.evaluated}`);
  assert(result.enqueued === 1, `expected one enqueued scan, got ${result.enqueued}`);
  assert(result.skipped === 1, `expected one skipped scan, got ${result.skipped}`);
  assert(
    result.skippedByReason.fresh_success === 1,
    `expected one fresh-success skip, got ${JSON.stringify(result.skippedByReason)}`,
  );
  assert(
    Object.entries(result.skippedByReason)
      .filter(([reason]) => reason !== 'fresh_success')
      .every(([, value]) => value === 0),
    `expected only fresh-success skip reason, got ${JSON.stringify(result.skippedByReason)}`,
  );

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
  const decisions = result.decisions;
  assert(decisions !== undefined, 'scheduler command smoke must request decision evidence');
  assert(decisions.length === 2, `expected two scheduler decisions, got ${JSON.stringify(decisions)}`);
  const redditDecision = decisions.find(
    (decision) => decision.sourceBindingId === 'source-binding-scheduler-smoke-reddit-fresh',
  );
  assert(redditDecision !== undefined, `expected reddit decision evidence, got ${JSON.stringify(decisions)}`);
  assert(redditDecision.decision === 'skipped', `expected reddit skip decision, got ${JSON.stringify(redditDecision)}`);
  assert(redditDecision.reason === 'fresh_success', `expected reddit fresh-success skip, got ${JSON.stringify(redditDecision)}`);
  assert(
    redditDecision.configuredIntervalSeconds === 60 &&
      redditDecision.effectiveIntervalSeconds === 900 &&
      redditDecision.freshnessSeconds === 900 &&
      redditDecision.providerMinimumIntervalEnforced === true,
    `expected reddit provider minimum cadence evidence, got ${JSON.stringify(redditDecision)}`,
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
  const redditPolicy = await policies.findBySourceBinding({
    tenantId: tenant,
    workspaceId: workspace,
    sourceBindingId: 'source-binding-scheduler-smoke-reddit-fresh',
  });
  assert(
    redditPolicy?.toSnapshot().nextRunAt.toISOString() === '2026-06-06T10:14:30.000Z',
    `fresh reddit policy must advance by provider minimum interval, got ${redditPolicy?.toSnapshot().nextRunAt.toISOString()}`,
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
  assert(
    metrics.latestGaugeValue('monitoring_scan_scheduler_last_skipped_by_reason', {
      reason: 'fresh_success',
      worker: 'ingestion-worker',
    }) === 1,
    'scheduler handler must record fresh-success skip reason gauge',
  );

  console.log('Scan scheduler command smoke OK');
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
