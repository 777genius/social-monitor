import { DeliveryAttempt } from '@social-monitor/delivery/domain';
import { InMemoryDeliveryProvider } from '@social-monitor/delivery/adapters/notification/in-memory-delivery.provider';
import { InMemoryDeliveryAttemptRepository } from '@social-monitor/delivery/adapters/persistence/in-memory-delivery-attempt.repository';
import { InMemoryNotificationPreferenceReader } from '@social-monitor/delivery/adapters/preferences/in-memory-notification-preference.reader';
import { SendDeliveryAttemptUseCase } from '@social-monitor/delivery/features/send-delivery-attempt/send-delivery-attempt.use-case';
import { SendDeliveryAttemptCommandHandler } from '@social-monitor/delivery/interfaces/queue/send-delivery-attempt-command.handler';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { WorkerRuntime } from '@social-monitor/platform-worker';
import { FixedClock, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { DeliveryAttemptDispatchLoop } from '../apps/delivery-service/src/delivery-attempt-dispatch-loop';

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

async function main(): Promise<void> {
  const tenant = tenantId('tenant-delivery-dispatch-loop-smoke');
  const workspace = workspaceId('workspace-delivery-dispatch-loop-smoke');
  const deliveryAttemptId = 'delivery-attempt-dispatch-loop-smoke';
  const attempts = new InMemoryDeliveryAttemptRepository();
  const provider = new InMemoryDeliveryProvider('in_app');
  const metrics = new InMemoryMetricsRecorder();
  const runtime = new WorkerRuntime({ serviceName: 'delivery-service' });
  runtime.onModuleInit();

  await attempts.save(DeliveryAttempt.queue({
    id: deliveryAttemptId,
    tenantId: tenant,
    workspaceId: workspace,
    idempotencyKey: 'delivery-dispatch-loop-smoke:digest-1',
    channel: 'in_app',
    recipientKey: 'user-delivery-dispatch-loop-smoke',
    resourceType: 'digest',
    resourceId: 'digest-delivery-dispatch-loop-smoke',
    queuedAt: new Date('2026-06-06T00:00:00.000Z'),
    maxRetries: 2,
  }));

  const loop = new DeliveryAttemptDispatchLoop(
    new SendDeliveryAttemptCommandHandler(
      new SendDeliveryAttemptUseCase(
        attempts,
        [provider],
        new InMemoryNotificationPreferenceReader(),
        new FixedClock(new Date('2026-06-06T00:01:00.000Z')),
      ),
      metrics,
      runtime,
    ),
    attempts,
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
  await loop.onApplicationShutdown('delivery-attempt-dispatch-loop-smoke-complete');
  await runtime.onApplicationShutdown('delivery-attempt-dispatch-loop-smoke-complete');

  const attempt = await attempts.findById({ tenantId: tenant, workspaceId: workspace, deliveryAttemptId });
  const snapshot = attempt?.toSnapshot();
  assert(snapshot?.state === 'delivered', `expected delivered attempt, got ${snapshot?.state}`);
  assert(provider.getSentRequests().length === 1, 'dispatch loop must send exactly one provider request');
  assert(
    provider.getSentRequests()[0]?.content.body === 'Delivery resource digest:digest-delivery-dispatch-loop-smoke is ready.',
    'dispatch loop must render deterministic MVP delivery content',
  );
  assert(
    metrics.counterValue('delivery_attempt_dispatch_total', {
      status: 'started',
      worker: 'delivery-service',
    }) === 1,
    'dispatch loop must record started metric',
  );
  assert(
    metrics.counterValue('delivery_attempt_dispatch_total', {
      status: 'succeeded',
      worker: 'delivery-service',
    }) === 1,
    'dispatch loop must record succeeded metric',
  );

  const remaining = await attempts.findQueued({ tenantId: tenant, workspaceId: workspace, limit: 10 });
  assert(remaining.length === 0, `dispatch loop must drain queued attempts, got ${remaining.length}`);

  console.log('Delivery attempt dispatch loop smoke OK');
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
