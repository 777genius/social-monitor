import { FixedClock, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { DeliveryAttemptExecutionStore } from '../../application/contracts/delivery-attempt-workflow';
import { DeliveryAttempt } from '../../domain';
import type { DeliveryAttemptRepositoryPort } from '../../ports';
import { SendDeliveryAttemptUseCase } from '../send-delivery-attempt/send-delivery-attempt.use-case';
import { RetryDeliveryAttemptUseCase } from './retry-delivery-attempt.use-case';

const scope = { tenantId: tenantId('tenant-test'), workspaceId: workspaceId('workspace-test'), deliveryAttemptId: 'attempt-test' };
const clock = new FixedClock(new Date('2026-10-30T10:00:00Z'));
const queued = () => DeliveryAttempt.queue({ id: scope.deliveryAttemptId, ...scope, idempotencyKey: 'stable',
  channel: 'webhook', recipientKey: 'recipient-test', resourceType: 'digest', resourceId: 'digest-test',
  queuedAt: clock.now(), maxRetries: 2 });

const fixture = () => {
  const attempts: jest.Mocked<DeliveryAttemptRepositoryPort> = {
    save: jest.fn(), findById: jest.fn(), findByIdempotencyKey: jest.fn(), findQueued: jest.fn(), list: jest.fn(),
  };
  const execution: jest.Mocked<DeliveryAttemptExecutionStore> = {
    claim: jest.fn(), startSending: jest.fn(), settle: jest.fn(), renew: jest.fn(),
  };
  const sender = new SendDeliveryAttemptUseCase(execution, [], {
    getDeliveryPreference: async () => ({ allowed: true }),
  }, clock, { generate: () => 'retry-token-test' });
  return { attempts, execution, useCase: new RetryDeliveryAttemptUseCase(attempts, sender) };
};

describe('RetryDeliveryAttemptUseCase', () => {
  it('rejects non-retryable state before claiming provider execution', async () => {
    const f = fixture();
    f.attempts.findById.mockResolvedValue(queued());
    await expect(f.useCase.execute({ ...scope, content: { body: 'test' } })).resolves.toMatchObject({ ok: false, error: { code: 'operation.conflict' } });
    expect(f.execution.claim).not.toHaveBeenCalled();
  });

  it('delegates retryable state to the fenced execution workflow', async () => {
    const f = fixture();
    const failed = queued().markSending({ sendingAt: clock.now() }).fail({ failedAt: clock.now(), failureReason: 'test 429' });
    f.attempts.findById.mockResolvedValue(failed);
    const delivered = failed.markSending({ sendingAt: clock.now() }).markDelivered({ deliveredAt: clock.now() });
    f.execution.claim.mockResolvedValue({ attempt: delivered, claimed: false });
    await expect(f.useCase.execute({ ...scope, content: { body: 'test' } })).resolves.toMatchObject({ ok: true, value: { attempt: { state: 'delivered', retryCount: 1 } } });
    expect(f.execution.claim).toHaveBeenCalledWith(expect.objectContaining({ ...scope, token: 'retry-token-test' }));
  });
});
