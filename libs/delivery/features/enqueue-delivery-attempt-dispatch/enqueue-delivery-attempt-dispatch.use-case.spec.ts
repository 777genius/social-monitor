import { FixedClock, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { DeliveryAttemptDispatchStore } from '../../application/contracts/delivery-attempt-workflow';
import { DeliveryAttempt } from '../../domain';
import { EnqueueDeliveryAttemptDispatchUseCase } from './enqueue-delivery-attempt-dispatch.use-case';

const scope = { tenantId: tenantId('tenant-test'), workspaceId: workspaceId('workspace-test'), deliveryAttemptId: 'attempt-test' };
const clock = new FixedClock(new Date('2026-10-30T10:00:00Z'));

describe('EnqueueDeliveryAttemptDispatchUseCase', () => {
  it('uses the atomic dispatch capability and injected identity/time', async () => {
    const attempt = DeliveryAttempt.queue({ id: scope.deliveryAttemptId, ...scope, idempotencyKey: 'stable',
      channel: 'webhook', recipientKey: 'recipient-test', resourceType: 'digest', resourceId: 'digest-test',
      queuedAt: clock.now(), maxRetries: 2 }).markAssembling({ assemblingAt: clock.now() });
    const store: jest.Mocked<DeliveryAttemptDispatchStore> = { dispatch: jest.fn().mockResolvedValue({ attempt, enqueued: true }) };
    const useCase = new EnqueueDeliveryAttemptDispatchUseCase(store, { generate: () => 'command-test' }, clock);
    await expect(useCase.execute({ ...scope, correlationId: 'correlation-test' })).resolves.toMatchObject({ ok: true, value: { enqueued: true, state: 'assembling' } });
    expect(store.dispatch).toHaveBeenCalledWith({ ...scope, correlationId: 'correlation-test', commandId: 'command-test',
      now: clock.now(), recoverBefore: new Date(clock.now().getTime() - 300_000) });
  });

  it('validates input without writing dispatch intent', async () => {
    const store: jest.Mocked<DeliveryAttemptDispatchStore> = { dispatch: jest.fn() };
    const useCase = new EnqueueDeliveryAttemptDispatchUseCase(store, { generate: () => 'command-test' }, clock);
    await expect(useCase.execute({ ...scope, correlationId: '' })).resolves.toMatchObject({ ok: false, error: { code: 'validation.failed' } });
    expect(store.dispatch).not.toHaveBeenCalled();
  });
});
