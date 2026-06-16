import { FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { DeliveryAttempt } from '../../domain';
import type {
  DeliveryAttemptRepositoryPort,
  DeliveryProviderPort,
  ListDeliveryAttemptsQuery,
  ListDeliveryAttemptsResult,
  SendDeliveryRequest,
  SendDeliveryResult,
  NotificationPreferenceReaderPort,
} from '../../ports';
import { QueueDeliveryAttemptUseCase } from '../queue-delivery-attempt/queue-delivery-attempt.use-case';
import { SendDeliveryAttemptUseCase } from '../send-delivery-attempt/send-delivery-attempt.use-case';
import { RetryDeliveryAttemptUseCase } from './retry-delivery-attempt.use-case';

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

class QueueingProvider implements DeliveryProviderPort {
  readonly requests: SendDeliveryRequest[] = [];

  constructor(
    readonly channel: DeliveryProviderPort['channel'],
    private readonly results: SendDeliveryResult[],
  ) {}

  async send(request: SendDeliveryRequest): Promise<SendDeliveryResult> {
    this.requests.push(request);

    return this.results.shift() ?? { accepted: true };
  }
}

class AllowAllPreferences implements NotificationPreferenceReaderPort {
  async getDeliveryPreference(): Promise<{ readonly allowed: true }> {
    return {
      allowed: true,
    };
  }
}

describe('RetryDeliveryAttemptUseCase', () => {
  it('retries retryable failure and marks delivered when provider accepts retry', async () => {
    const tenant = tenantId('tenant-1');
    const workspace = workspaceId('workspace-1');
    const attempts = new FakeDeliveryAttempts();
    const provider = new QueueingProvider('webhook', [
      {
        accepted: false,
        retryable: true,
        reason: 'Provider returned 429',
      },
      {
        accepted: true,
        providerMessageId: 'provider-message-2',
      },
    ]);
    const send = new SendDeliveryAttemptUseCase(
      attempts,
      [provider],
      new AllowAllPreferences(),
      new FixedClock(new Date('2026-06-06T00:01:00.000Z')),
    );
    const queued = await new QueueDeliveryAttemptUseCase(
      attempts,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-06T00:00:00.000Z')),
    ).execute({
      tenantId: tenant,
      workspaceId: workspace,
      idempotencyKey: 'webhook:tenant-1:user-1:digest-1',
      channel: 'webhook',
      recipientKey: 'webhook-endpoint-1',
      resourceType: 'digest',
      resourceId: 'digest-1',
      maxRetries: 2,
    });

    if (!queued.ok) {
      throw queued.error;
    }

    const firstSend = await send.execute({
      tenantId: tenant,
      workspaceId: workspace,
      deliveryAttemptId: queued.value.deliveryAttemptId,
      content: {
        body: 'Digest body',
      },
    });

    if (!firstSend.ok) {
      throw firstSend.error;
    }

    const retry = await new RetryDeliveryAttemptUseCase(attempts, send).execute({
      tenantId: tenant,
      workspaceId: workspace,
      deliveryAttemptId: queued.value.deliveryAttemptId,
      content: {
        body: 'Digest body',
      },
    });

    expect(firstSend.value.attempt.state).toBe('failed_retryable');
    expect(retry).toEqual({
      ok: true,
      value: {
        attempt: expect.objectContaining({
          id: queued.value.deliveryAttemptId,
          state: 'delivered',
          retryCount: 1,
        }),
        providerMessageId: 'provider-message-2',
      },
    });
    expect(provider.requests).toHaveLength(2);
  });
});
