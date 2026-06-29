import { ProjectSummaryReadyEventHandler } from '@social-monitor/delivery/interfaces/events/project-summary-ready-event.handler';
import { InMemoryRealtimeEventRepository } from '@social-monitor/delivery/adapters/persistence/in-memory-realtime-event.repository';
import { ProjectSummaryReadyEventUseCase } from '@social-monitor/delivery/features/project-summary-ready-event/project-summary-ready-event.use-case';
import { RecordRealtimeEventUseCase } from '@social-monitor/delivery/features/record-realtime-event/record-realtime-event.use-case';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { WorkerRuntime } from '@social-monitor/platform-worker';
import { FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `summary-ready-projection-smoke-${this.nextId}`;
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
  const tenant = tenantId('tenant-summary-ready-projection-smoke');
  const workspace = workspaceId('workspace-summary-ready-projection-smoke');
  const realtimeEvents = new InMemoryRealtimeEventRepository();
  const metrics = new InMemoryMetricsRecorder();
  const runtime = new WorkerRuntime({ serviceName: 'delivery-service' });
  runtime.onModuleInit();

  const handler = new ProjectSummaryReadyEventHandler(
    new ProjectSummaryReadyEventUseCase(
      new RecordRealtimeEventUseCase(
        realtimeEvents,
        new SequenceIdGenerator(),
        new FixedClock(new Date('2026-06-06T00:02:00.000Z')),
      ),
    ),
    metrics,
    runtime,
  );

  const result = await handler.handle({
    eventId: 'summary-ready-projection-event-1',
    eventType: 'summary.ready',
    schemaVersion: 1,
    occurredAt: '2026-06-06T00:01:00.000Z',
    tenantId: tenant,
    workspaceId: workspace,
    correlationId: 'summary-ready-projection-correlation-1',
    causationId: 'summary-job-projection-smoke',
    payload: {
      tenantId: tenant,
      workspaceId: workspace,
      interestId: 'topic-summary-ready-projection-smoke',
      summaryJobId: 'summary-job-projection-smoke',
      summaryId: 'summary-projection-smoke',
      status: 'completed',
    },
  });

  await runtime.onApplicationShutdown('summary-ready-projection-handler-smoke-complete');

  assert(result.channel === 'interest:topic-summary-ready-projection-smoke:summary-status', 'handler must return realtime channel');
  assert(result.sequence === 1, `handler must assign realtime sequence 1, got ${result.sequence}`);

  const replay = await realtimeEvents.list({
    tenantId: tenant,
    workspaceId: workspace,
    channel: 'interest:topic-summary-ready-projection-smoke:summary-status',
    limit: 10,
  });
  const event = replay.events[0]?.toSnapshot();
  assert(event?.eventType === 'summary.status.changed.v1', `unexpected realtime event type ${event?.eventType}`);
  assert(event.resourceId === 'summary-projection-smoke', `unexpected realtime resource id ${event.resourceId}`);
  assert(
    metrics.counterValue('delivery_realtime_projection_events_total', {
      projection: 'summary_ready',
      status: 'started',
      worker: 'delivery-service',
    }) === 1,
    'handler must record started projection metric',
  );
  assert(
    metrics.counterValue('delivery_realtime_projection_events_total', {
      projection: 'summary_ready',
      status: 'succeeded',
      worker: 'delivery-service',
    }) === 1,
    'handler must record succeeded projection metric',
  );

  console.log('Summary ready projection handler smoke OK');
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
