import { FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { DeliveryAttempt } from '../../domain';
import type {
  DeliveryAttemptRepositoryPort,
  ListDeliveryAttemptsQuery,
  ListDeliveryAttemptsResult,
} from '../../ports';
import { QueueDeliveryAttemptUseCase } from '../queue-delivery-attempt/queue-delivery-attempt.use-case';
import { ApplyDeliverySuppressionUseCase } from './apply-delivery-suppression.use-case';

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `delivery-attempt-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

class FakeDeliveryAttempts implements DeliveryAttemptRepositoryPort {
  private readonly attemptsById = new Map<string, DeliveryAttempt>();
  private readonly attemptsByIdempotencyKey = new Map<string, DeliveryAttempt>();

  async save(attempt: DeliveryAttempt): Promise<void> {
    const snapshot = attempt.toSnapshot();

    this.attemptsById.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`, attempt);
    this.attemptsByIdempotencyKey.set(
      `${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.idempotencyKey}`,
      attempt,
    );
  }

  async findById(params: Parameters<DeliveryAttemptRepositoryPort['findById']>[0]): Promise<DeliveryAttempt | null> {
    return this.attemptsById.get(`${params.tenantId}:${params.workspaceId}:${params.deliveryAttemptId}`) ?? null;
  }

  async findByIdempotencyKey(
    params: Parameters<DeliveryAttemptRepositoryPort['findByIdempotencyKey']>[0],
  ): Promise<DeliveryAttempt | null> {
    return this.attemptsByIdempotencyKey.get(`${params.tenantId}:${params.workspaceId}:${params.idempotencyKey}`) ?? null;
  }

  async list(query: ListDeliveryAttemptsQuery): Promise<ListDeliveryAttemptsResult> {
    return {
      attempts: [...this.attemptsById.values()].filter((attempt) => {
        const snapshot = attempt.toSnapshot();

        return snapshot.tenantId === query.tenantId && snapshot.workspaceId === query.workspaceId;
      }),
      nextCursor: undefined,
    };
  }
}

describe('ApplyDeliverySuppressionUseCase', () => {
  it('suppresses no-signal delivery when preference disallows no-signal notifications', async () => {
    const tenant = tenantId('tenant-1');
    const workspace = workspaceId('workspace-1');
    const attempts = new FakeDeliveryAttempts();
    const queued = await new QueueDeliveryAttemptUseCase(
      attempts,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-06T00:00:00.000Z')),
    ).execute({
      tenantId: tenant,
      workspaceId: workspace,
      idempotencyKey: 'summary:tenant-1:user-1:summary-1',
      channel: 'in_app',
      recipientKey: 'user-1',
      resourceType: 'summary',
      resourceId: 'summary-1',
    });

    if (!queued.ok) {
      throw queued.error;
    }

    const result = await new ApplyDeliverySuppressionUseCase(
      attempts,
      new FixedClock(new Date('2026-06-06T00:01:00.000Z')),
    ).execute({
      tenantId: tenant,
      workspaceId: workspace,
      deliveryAttemptId: queued.value.deliveryAttemptId,
      resourceSignal: 'no_signal',
      policy: {
        allowNoSignal: false,
        highSignalOnly: false,
        repeatedFailureSuppressed: false,
      },
    });

    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        suppressed: true,
        attempt: expect.objectContaining({
          state: 'suppressed',
          suppressionReason: 'No-signal resource suppressed by preference',
          suppressedAt: '2026-06-06T00:01:00.000Z',
        }),
      }),
    });
  });
});
