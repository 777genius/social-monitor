import { DeliveryAttempt } from '@social-monitor/delivery/domain';
import { InMemoryDeliveryProvider } from '@social-monitor/delivery/adapters/notification/in-memory-delivery.provider';
import { InMemoryDeliveryAttemptDispatchQueueAdapter } from '@social-monitor/delivery/adapters/messaging/in-memory-delivery-attempt-dispatch-queue.adapter';
import { InMemoryDeliveryAttemptRepository } from '@social-monitor/delivery/adapters/persistence/in-memory-delivery-attempt.repository';
import { InMemoryNotificationPreferenceReader } from '@social-monitor/delivery/adapters/preferences/in-memory-notification-preference.reader';
import { EnqueueDeliveryAttemptDispatchUseCase } from '@social-monitor/delivery/features/enqueue-delivery-attempt-dispatch/enqueue-delivery-attempt-dispatch.use-case';
import { SendDeliveryAttemptUseCase } from '@social-monitor/delivery/features/send-delivery-attempt/send-delivery-attempt.use-case';
import { SendDeliveryAttemptCommandHandler } from '@social-monitor/delivery/interfaces/queue/send-delivery-attempt-command.handler';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { InMemoryQueuePublisher } from '@social-monitor/platform-queue/adapters/in-memory';
import { WorkerRuntime } from '@social-monitor/platform-worker';
import { FixedClock, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { DeliveryAttemptQueueDrainLoop } from '../apps/delivery-service/src/delivery-attempt-queue-drain-loop';
import { InMemoryDeliveryAttemptQueueReader } from '../apps/delivery-service/src/delivery-attempt-queue-reader';

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

async function main(): Promise<void> {
  const tenant = tenantId('tenant-delivery-attempt-queue-drain-smoke');
  const workspace = workspaceId('workspace-delivery-attempt-queue-drain-smoke');
  const deliveryAttemptId = 'delivery-attempt-queue-drain-smoke';
  const attempts = new InMemoryDeliveryAttemptRepository();
  const queuePublisher = new InMemoryQueuePublisher();
  const metrics = new InMemoryMetricsRecorder();
  const provider = new InMemoryDeliveryProvider('webhook');
  const runtime = new WorkerRuntime({ serviceName: 'delivery-service' });
  runtime.onModuleInit();

  await attempts.save(DeliveryAttempt.queue({
    id: deliveryAttemptId,
    tenantId: tenant,
    workspaceId: workspace,
    idempotencyKey: 'delivery-attempt-queue-drain-smoke:summary-1',
    channel: 'webhook',
    recipientKey: 'webhook-endpoint-delivery-attempt-queue-drain-smoke',
    resourceType: 'summary',
    resourceId: 'summary-delivery-attempt-queue-drain-smoke',
    queuedAt: new Date('2026-06-16T04:10:00.000Z'),
    maxRetries: 2,
  }));

  const enqueueDispatch = new EnqueueDeliveryAttemptDispatchUseCase(
    attempts,
    new InMemoryDeliveryAttemptDispatchQueueAdapter(queuePublisher, metrics),
    new FixedClock(new Date('2026-06-16T04:11:00.000Z')),
  );

  const enqueued = await enqueueDispatch.execute({
    tenantId: tenant,
    workspaceId: workspace,
    deliveryAttemptId,
    correlationId: 'correlation-delivery-attempt-queue-drain-smoke',
  });

  if (!enqueued.ok) {
    throw enqueued.error;
  }

  assert(enqueued.value.enqueued, 'delivery dispatch enqueue use case must publish a command');
  assert(enqueued.value.state === 'assembling', 'queued dispatch attempt must move to assembling state');
  assert(queuePublisher.all().length === 1, 'delivery dispatch queue must contain one command');
  assert(
    metrics.counterValue('queue_commands_enqueued_total', {
      command_type: 'delivery.attempt.send',
      job_type: 'delivery',
      status: 'enqueued',
    }) === 1,
    'delivery dispatch enqueue must record queue enqueue metric',
  );

  const loop = new DeliveryAttemptQueueDrainLoop(
    new InMemoryDeliveryAttemptQueueReader(queuePublisher),
    new SendDeliveryAttemptCommandHandler(
      new SendDeliveryAttemptUseCase(
        attempts,
        [provider],
        new InMemoryNotificationPreferenceReader(),
        new FixedClock(new Date('2026-06-16T04:12:00.000Z')),
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
  await loop.onApplicationShutdown('delivery-attempt-queue-drain-smoke-complete');
  await runtime.onApplicationShutdown('delivery-attempt-queue-drain-smoke-complete');

  const persisted = await attempts.findById({ tenantId: tenant, workspaceId: workspace, deliveryAttemptId });
  const snapshot = persisted?.toSnapshot();
  assert(snapshot?.state === 'delivered', `expected delivered queued attempt, got ${snapshot?.state}`);
  assert(queuePublisher.all().length === 0, 'delivery attempt queue drain loop must ack and remove command');
  assert(provider.getSentRequests().length === 1, 'delivery queue drain loop must send one provider request');
  assert(
    provider.getSentRequests()[0]?.content.body ===
      'Delivery resource summary:summary-delivery-attempt-queue-drain-smoke is ready.',
    'delivery queue drain loop must preserve deterministic MVP delivery content',
  );
  assert(
    metrics.counterValue('delivery_attempt_dispatch_total', {
      status: 'started',
      worker: 'delivery-service',
    }) === 1,
    'delivery queue drain loop must record started dispatch metric',
  );
  assert(
    metrics.counterValue('delivery_attempt_dispatch_total', {
      status: 'succeeded',
      worker: 'delivery-service',
    }) === 1,
    'delivery queue drain loop must record succeeded dispatch metric',
  );

  console.log('Delivery attempt queue drain loop smoke OK');
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
