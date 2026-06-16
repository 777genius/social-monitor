import { FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { DeliveryAttempt } from '../../domain';
import type {
  DeliveryAttemptRepositoryPort,
  ListDeliveryAttemptsQuery,
  ListDeliveryAttemptsResult,
} from '../../ports';
import { QueueDeliveryAttemptUseCase } from './queue-delivery-attempt.use-case';

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

  async findQueued(): Promise<readonly DeliveryAttempt[]> {
    return [];
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

describe('QueueDeliveryAttemptUseCase', () => {
  it('queues delivery attempts idempotently', async () => {
    const useCase = new QueueDeliveryAttemptUseCase(
      new FakeDeliveryAttempts(),
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-06T00:00:00.000Z')),
    );
    const command = {
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      idempotencyKey: 'digest:tenant-1:user-1:window-1:hash-1',
      channel: 'email' as const,
      recipientKey: 'user-1',
      resourceType: 'digest' as const,
      resourceId: 'digest-window-1',
      maxRetries: 2,
    };

    const first = await useCase.execute(command);
    const second = await useCase.execute(command);

    expect(first).toEqual({
      ok: true,
      value: {
        deliveryAttemptId: 'delivery-attempt-1',
        state: 'queued',
        created: true,
      },
    });
    expect(second).toEqual({
      ok: true,
      value: {
        deliveryAttemptId: 'delivery-attempt-1',
        state: 'queued',
        created: false,
      },
    });
  });

  it('returns the raced existing attempt when persistence reports an idempotency conflict', async () => {
    const attempts = new SaveConflictAfterPersistingDeliveryAttempts();
    const useCase = new QueueDeliveryAttemptUseCase(
      attempts,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-06T00:00:00.000Z')),
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      idempotencyKey: 'digest:tenant-1:user-1:window-1:hash-1',
      channel: 'email',
      recipientKey: 'user-1',
      resourceType: 'digest',
      resourceId: 'digest-window-1',
      maxRetries: 2,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        deliveryAttemptId: 'delivery-attempt-1',
        state: 'queued',
        created: false,
      },
    });
  });
});

class SaveConflictAfterPersistingDeliveryAttempts extends FakeDeliveryAttempts {
  override async save(attempt: DeliveryAttempt): Promise<void> {
    await super.save(attempt);

    throw new Error('unique constraint conflict');
  }
}
