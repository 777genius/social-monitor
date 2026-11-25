import { type Clock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { DeliveryAttempt } from '@social-monitor/delivery/domain';
import { InMemoryDeliveryAttemptRepository } from '@social-monitor/delivery/adapters/persistence/in-memory-delivery-attempt.repository';

export class DeliveryTestClock implements Clock {
  private value = new Date('2026-10-30T10:00:00.000Z');
  now(): Date { return new Date(this.value); }
  advance(milliseconds: number): void { this.value = new Date(this.value.getTime() + milliseconds); }
}

export class DeliveryTestIds implements IdGenerator {
  private sequence = 10;
  generate(): string { return `00000000-0000-7000-8000-${String(this.sequence++).padStart(12, '0')}`; }
}

export const deliveryTestScope = {
  tenantId: tenantId('00000000-0000-7000-8000-000000000001'),
  workspaceId: workspaceId('00000000-0000-7000-8000-000000000002'),
  deliveryAttemptId: '00000000-0000-7000-8000-000000000003',
};

export const queuedDelivery = (clock: Clock, maxRetries = 2): DeliveryAttempt => DeliveryAttempt.queue({
  id: deliveryTestScope.deliveryAttemptId,
  tenantId: deliveryTestScope.tenantId,
  workspaceId: deliveryTestScope.workspaceId,
  idempotencyKey: 'delivery:test:stable',
  channel: 'webhook', recipientKey: 'endpoint-test', resourceType: 'digest', resourceId: 'digest-test',
  queuedAt: clock.now(), maxRetries,
});

export const createDeliveryFixture = async (maxRetries = 2) => {
  const clock = new DeliveryTestClock();
  const repository = new InMemoryDeliveryAttemptRepository();
  await repository.save(queuedDelivery(clock, maxRetries));
  return { repository, store: repository.workflow, clock, ids: new DeliveryTestIds(), scope: deliveryTestScope };
};

export const allowDelivery = { getDeliveryPreference: async () => ({ allowed: true as const }) };

export const deferredDelivery = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};
