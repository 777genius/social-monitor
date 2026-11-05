import { FixedClock, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { DeliveryAttemptExecutionStore } from '../../application/contracts/delivery-attempt-workflow';
import { DeliveryAttempt } from '../../domain';
import { SendDeliveryAttemptUseCase } from './send-delivery-attempt.use-case';

const scope = { tenantId: tenantId('tenant-test'), workspaceId: workspaceId('workspace-test'), deliveryAttemptId: 'attempt-test' };
const clock = new FixedClock(new Date('2026-10-30T10:00:00Z'));

const fixture = () => {
  const store: jest.Mocked<DeliveryAttemptExecutionStore> = {
    claim: jest.fn(), startSending: jest.fn(), settle: jest.fn(), renew: jest.fn(),
  };
  const send = jest.fn(async () => ({ accepted: true as const }));
  const sender = new SendDeliveryAttemptUseCase(store, [{ channel: 'webhook', send }], {
    getDeliveryPreference: async () => ({ allowed: true }),
  }, clock, { generate: () => 'token-test' });
  return { store, send, sender };
};

describe('SendDeliveryAttemptUseCase', () => {
  it('validates input before claiming execution', async () => {
    const f = fixture();
    await expect(f.sender.execute({ ...scope, content: { body: '' } })).resolves.toMatchObject({ ok: false, error: { code: 'validation.failed' } });
    expect(f.store.claim).not.toHaveBeenCalled();
  });

  it('returns the durable replay without another provider call', async () => {
    const f = fixture();
    const queued = DeliveryAttempt.queue({ id: scope.deliveryAttemptId, ...scope, idempotencyKey: 'stable',
      channel: 'webhook', recipientKey: 'recipient-test', resourceType: 'digest', resourceId: 'digest-test',
      queuedAt: clock.now(), maxRetries: 2 });
    const delivered = queued.markSending({ sendingAt: clock.now() }).markDelivered({ deliveredAt: clock.now() });
    f.store.claim.mockResolvedValue({ claimed: false, attempt: delivered });
    await expect(f.sender.execute({ ...scope, content: { body: 'test' } })).resolves.toMatchObject({ ok: true, value: { attempt: { state: 'delivered' } } });
    expect(f.send).not.toHaveBeenCalled();
    expect(f.store.settle).not.toHaveBeenCalled();
  });
});
