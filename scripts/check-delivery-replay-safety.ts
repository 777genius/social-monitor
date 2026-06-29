import { correlationId, FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { InMemoryDeliveryProvider } from '../libs/delivery/adapters/notification/in-memory-delivery.provider';
import { InMemoryDeliveryAttemptRepository } from '../libs/delivery/adapters/persistence/in-memory-delivery-attempt.repository';
import { InMemoryRealtimeEventRepository } from '../libs/delivery/adapters/persistence/in-memory-realtime-event.repository';
import { InMemoryNotificationPreferenceReader } from '../libs/delivery/adapters/preferences/in-memory-notification-preference.reader';
import { ListRealtimeEventsUseCase } from '../libs/delivery/features/list-realtime-events/list-realtime-events.use-case';
import { QueueDeliveryAttemptUseCase } from '../libs/delivery/features/queue-delivery-attempt/queue-delivery-attempt.use-case';
import { RecordRealtimeEventUseCase } from '../libs/delivery/features/record-realtime-event/record-realtime-event.use-case';
import { SendDeliveryAttemptUseCase } from '../libs/delivery/features/send-delivery-attempt/send-delivery-attempt.use-case';

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `delivery-replay-smoke-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

async function main(): Promise<void> {
  await proveRealtimeReplaySafety();
  await proveDeliveryIdempotencyAndPreferenceRecheck();

  console.log('Delivery replay safety smoke OK');
}

async function proveRealtimeReplaySafety(): Promise<void> {
  const tenant = tenantId('tenant-delivery-replay-smoke');
  const workspace = workspaceId('workspace-delivery-replay-smoke');
  const channel = 'interest:topic-delivery-replay-smoke:summary-status';
  const repository = new InMemoryRealtimeEventRepository();
  const recorder = new RecordRealtimeEventUseCase(
    repository,
    new SequenceIdGenerator(),
    new FixedClock(new Date('2026-06-06T00:00:00.000Z')),
  );
  const lister = new ListRealtimeEventsUseCase(repository);
  let firstCursor = '';
  let latestCursor = '';

  for (let index = 1; index <= 105; index += 1) {
    const recorded = await recorder.execute({
      tenantId: tenant,
      workspaceId: workspace,
      channel,
      eventType: 'summary.status.changed.v1',
      resourceType: 'summary',
      resourceId: `summary-${index}`,
      correlationId: correlationId(`delivery-replay-corr-${index}`),
      payload: {
        status: 'completed',
        sequence: index,
      },
    });

    if (!recorded.ok) {
      throw recorded.error;
    }

    if (index === 1) {
      firstCursor = recorded.value.replayCursor;
    }

    latestCursor = recorded.value.replayCursor;
  }

  const staleReplay = await lister.execute({
    tenantId: tenant,
    workspaceId: workspace,
    channel,
    cursor: firstCursor,
    limit: 20,
  });
  assert(staleReplay.ok, 'stale replay should return a controlled resync result');
  assert(staleReplay.value.resyncRequired, 'stale replay cursor must require REST resync');
  assert(staleReplay.value.events.length === 0, 'stale replay must not return a partial event set');

  const currentSnapshot = await lister.execute({
    tenantId: tenant,
    workspaceId: workspace,
    channel,
    limit: 5,
  });
  assert(currentSnapshot.ok, 'current snapshot should succeed');
  assert(!currentSnapshot.value.resyncRequired, 'current snapshot must not require resync');
  assert(currentSnapshot.value.events[0]?.sequence === 6, 'current snapshot should start at retained sequence 6');
  assert(currentSnapshot.value.nextCursor !== undefined, 'paged current snapshot should return nextCursor');

  const caughtUp = await lister.execute({
    tenantId: tenant,
    workspaceId: workspace,
    channel,
    cursor: latestCursor,
    limit: 20,
  });
  assert(caughtUp.ok, 'caught-up replay should succeed');
  assert(!caughtUp.value.resyncRequired, 'latest cursor should not require resync');
  assert(caughtUp.value.events.length === 0, 'latest cursor should have no newer events');
}

async function proveDeliveryIdempotencyAndPreferenceRecheck(): Promise<void> {
  const tenant = tenantId('tenant-delivery-idempotency-smoke');
  const workspace = workspaceId('workspace-delivery-idempotency-smoke');
  const attempts = new InMemoryDeliveryAttemptRepository();
  const preferences = new InMemoryNotificationPreferenceReader();
  const provider = new InMemoryDeliveryProvider('email');
  const queue = new QueueDeliveryAttemptUseCase(
    attempts,
    new SequenceIdGenerator(),
    new FixedClock(new Date('2026-06-06T01:00:00.000Z')),
  );
  const command = {
    tenantId: tenant,
    workspaceId: workspace,
    idempotencyKey: 'email:tenant:user-1:summary-1',
    channel: 'email' as const,
    recipientKey: 'user-1',
    resourceType: 'summary' as const,
    resourceId: 'summary-1',
    maxRetries: 1,
  };

  const first = await queue.execute(command);
  const duplicate = await queue.execute(command);
  assert(first.ok && duplicate.ok, 'delivery queue attempts should succeed');
  assert(first.value.created, 'first delivery queue call should create attempt');
  assert(!duplicate.value.created, 'duplicate delivery queue call should reuse attempt');
  assert(first.value.deliveryAttemptId === duplicate.value.deliveryAttemptId, 'duplicate delivery attempt id mismatch');

  preferences.suppressRecipientChannel({
    tenantId: tenant,
    workspaceId: workspace,
    recipientKey: 'user-1',
    channel: 'email',
    reason: 'Recipient disabled email notifications',
  });

  const sent = await new SendDeliveryAttemptUseCase(
    attempts,
    [provider],
    preferences,
    new FixedClock(new Date('2026-06-06T01:01:00.000Z')),
  ).execute({
    tenantId: tenant,
    workspaceId: workspace,
    deliveryAttemptId: first.value.deliveryAttemptId,
    content: {
      subject: 'Summary ready',
      body: 'Summary body',
    },
  });

  assert(sent.ok, 'suppressed delivery send should return success result');
  assert(sent.value.attempt.state === 'suppressed', `expected suppressed attempt, got ${sent.value.attempt.state}`);
  assert(provider.getSentRequests().length === 0, 'provider must not be called after preference recheck suppression');
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}
