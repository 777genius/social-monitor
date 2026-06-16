import { AssembleDigestUseCase } from '@social-monitor/delivery/features/assemble-digest/assemble-digest.use-case';
import { QueueDeliveryAttemptUseCase } from '@social-monitor/delivery/features/queue-delivery-attempt/queue-delivery-attempt.use-case';
import { ScheduleDueDigestsUseCase } from '@social-monitor/delivery/features/schedule-due-digests/schedule-due-digests.use-case';
import { ScheduleDueDigestsCommandHandler } from '@social-monitor/delivery/interfaces/queue/schedule-due-digests-command.handler';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { WorkerRuntime } from '@social-monitor/platform-worker';
import { FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { DigestSchedulerLoop } from '../apps/delivery-service/src/digest-scheduler-loop';
import { InMemoryDeliveryAttemptRepository } from '../libs/delivery/adapters/persistence/in-memory-delivery-attempt.repository';
import { InMemoryDigestScheduleRepository } from '../libs/delivery/adapters/persistence/in-memory-digest-schedule.repository';
import { InMemoryDigestRepository } from '../libs/delivery/adapters/persistence/in-memory-digest.repository';
import { InMemoryDigestSourceReader } from '../libs/delivery/adapters/source/in-memory-digest-source.reader';
import { DigestSchedule } from '../libs/delivery/domain';

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `digest-scheduler-loop-smoke-${this.nextId}`;
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
  const tenant = tenantId('tenant-digest-scheduler-loop-smoke');
  const workspace = workspaceId('workspace-digest-scheduler-loop-smoke');
  const now = new Date('2026-06-06T10:00:00.000Z');
  const ids = new SequenceIdGenerator();
  const clock = new FixedClock(now);
  const schedules = new InMemoryDigestScheduleRepository();
  const digests = new InMemoryDigestRepository();
  const deliveryAttempts = new InMemoryDeliveryAttemptRepository();
  const digestSources = new InMemoryDigestSourceReader();
  const metrics = new InMemoryMetricsRecorder();
  const runtime = new WorkerRuntime({ serviceName: 'delivery-service' });
  runtime.onModuleInit();

  await schedules.save(DigestSchedule.create({
    id: 'digest-schedule-loop-smoke',
    tenantId: tenant,
    workspaceId: workspace,
    recipientKey: 'user-digest-loop-smoke',
    channel: 'in_app',
    topicIds: ['topic-digest-loop-smoke'],
    intervalSeconds: 3600,
    includeNoSignal: false,
    nextRunAt: new Date('2026-06-06T10:00:00.000Z'),
    createdAt: new Date('2026-06-06T09:00:00.000Z'),
  }));
  digestSources.addSummary({
    tenantId: tenant,
    workspaceId: workspace,
    summaryId: 'summary-digest-loop-smoke',
    topicId: 'topic-digest-loop-smoke',
    sourceWindowStartedAt: new Date('2026-06-06T09:00:00.000Z'),
    sourceWindowEndedAt: new Date('2026-06-06T09:59:00.000Z'),
    signal: 'high',
  });

  const loop = new DigestSchedulerLoop(
    new ScheduleDueDigestsCommandHandler(
      new ScheduleDueDigestsUseCase(
        schedules,
        new AssembleDigestUseCase(
          digests,
          digestSources,
          new QueueDeliveryAttemptUseCase(deliveryAttempts, ids, clock),
          ids,
          clock,
        ),
        clock,
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
  await loop.onApplicationShutdown('digest-scheduler-loop-smoke-complete');
  await runtime.onApplicationShutdown('digest-scheduler-loop-smoke-complete');

  assert(
    metrics.counterValue('delivery_digest_scheduler_runs_total', {
      status: 'succeeded',
      worker: 'delivery-service',
    }) === 1,
    'loop tick must record successful digest scheduler run',
  );
  assert(
    metrics.latestGaugeValue('delivery_digest_scheduler_last_assembled', { worker: 'delivery-service' }) === 1,
    'loop tick must record assembled gauge',
  );

  const listedAttempts = await deliveryAttempts.list({
    tenantId: tenant,
    workspaceId: workspace,
    limit: 10,
  });
  assert(listedAttempts.attempts.length === 1, 'assembled digest must queue one delivery attempt');
  const attempt = listedAttempts.attempts[0]?.toSnapshot();
  assert(attempt?.resourceType === 'digest', 'delivery attempt must target digest resource');

  const digest = (await digests.findById({
    tenantId: tenant,
    workspaceId: workspace,
    digestId: attempt.resourceId,
  }))?.toSnapshot();
  assert(digest?.summaryIds.includes('summary-digest-loop-smoke') === true, 'digest must include source summary');

  const advancedSchedule = await schedules.findById({
    tenantId: tenant,
    workspaceId: workspace,
    digestScheduleId: 'digest-schedule-loop-smoke',
  });
  assert(
    advancedSchedule?.toSnapshot().nextRunAt.toISOString() === '2026-06-06T11:00:00.000Z',
    `digest schedule must advance nextRunAt, got ${advancedSchedule?.toSnapshot().nextRunAt.toISOString()}`,
  );

  console.log('Digest scheduler loop smoke OK');
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
