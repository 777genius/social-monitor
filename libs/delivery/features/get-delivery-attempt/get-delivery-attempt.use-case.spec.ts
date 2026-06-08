import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { DeliveryAttempt, type DeliveryAttemptProps } from '../../domain';
import type {
  DeliveryAttemptRepositoryPort,
  ListDeliveryAttemptsQuery,
  ListDeliveryAttemptsResult,
} from '../../ports';
import { GetDeliveryAttemptUseCase } from './get-delivery-attempt.use-case';

class FakeDeliveryAttempts implements DeliveryAttemptRepositoryPort {
  private readonly attempts = new Map<string, DeliveryAttempt>();

  async save(attempt: DeliveryAttempt): Promise<void> {
    const snapshot = attempt.toSnapshot();
    this.attempts.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`, attempt);
  }

  async findById(params: Parameters<DeliveryAttemptRepositoryPort['findById']>[0]): Promise<DeliveryAttempt | null> {
    return this.attempts.get(`${params.tenantId}:${params.workspaceId}:${params.deliveryAttemptId}`) ?? null;
  }

  async findByIdempotencyKey(): Promise<DeliveryAttempt | null> {
    return null;
  }

  async list(_query: ListDeliveryAttemptsQuery): Promise<ListDeliveryAttemptsResult> {
    return {
      attempts: [...this.attempts.values()],
      nextCursor: undefined,
    };
  }
}

describe('GetDeliveryAttemptUseCase', () => {
  it('returns a scoped delivery attempt with UI-ready timestamps', async () => {
    const attempts = new FakeDeliveryAttempts();
    await attempts.save(makeDeliveryAttempt({ id: 'attempt-1' }));

    const result = await new GetDeliveryAttemptUseCase(attempts).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      deliveryAttemptId: 'attempt-1',
    });

    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        id: 'attempt-1',
        state: 'queued',
        queuedAt: '2026-06-06T00:00:00.000Z',
      }),
    });
  });

  it('does not leak delivery attempts across tenant scope', async () => {
    const attempts = new FakeDeliveryAttempts();
    await attempts.save(makeDeliveryAttempt({ id: 'attempt-1', tenantId: tenantId('tenant-2') }));

    await expect(new GetDeliveryAttemptUseCase(attempts).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      deliveryAttemptId: 'attempt-1',
    })).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'resource.not_found',
      }),
    });
  });

  it('rejects blank delivery attempt ids before repository lookup', async () => {
    await expect(new GetDeliveryAttemptUseCase(new FakeDeliveryAttempts()).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      deliveryAttemptId: ' ',
    })).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'validation.failed',
      }),
    });
  });
});

const makeDeliveryAttempt = (overrides: Partial<DeliveryAttemptProps> = {}): DeliveryAttempt => DeliveryAttempt.queue({
  id: 'attempt-1',
  tenantId: tenantId('tenant-1'),
  workspaceId: workspaceId('workspace-1'),
  idempotencyKey: 'delivery:summary-1',
  channel: 'webhook',
  recipientKey: 'webhook-1',
  resourceType: 'summary',
  resourceId: 'summary-1',
  queuedAt: new Date('2026-06-06T00:00:00.000Z'),
  maxRetries: 3,
  ...overrides,
});
