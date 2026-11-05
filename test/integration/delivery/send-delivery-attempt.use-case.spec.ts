import { CryptoIdGenerator } from '@social-monitor/shared-kernel';
import { InMemoryDeliveryAttemptRepository } from '@social-monitor/delivery/adapters/persistence/in-memory-delivery-attempt.repository';
import { FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type {
  DeliveryAttemptRepositoryPort,
  DeliveryProviderPort,
  SendDeliveryRequest,
  SendDeliveryResult,
  NotificationPreferenceReaderPort,
} from '@social-monitor/delivery/ports';
import { QueueDeliveryAttemptUseCase } from '@social-monitor/delivery/features/queue-delivery-attempt/queue-delivery-attempt.use-case';
import { SendDeliveryAttemptUseCase } from '@social-monitor/delivery/features/send-delivery-attempt/send-delivery-attempt.use-case';

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `delivery-attempt-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

class FakeDeliveryAttempts extends InMemoryDeliveryAttemptRepository {}

class FakeDeliveryProvider implements DeliveryProviderPort {
  readonly requests: SendDeliveryRequest[] = [];

  constructor(
    readonly channel: DeliveryProviderPort['channel'],
    private readonly result: SendDeliveryResult,
  ) {}

  async send(request: SendDeliveryRequest): Promise<SendDeliveryResult> {
    this.requests.push(request);

    return this.result;
  }
}

class AllowAllPreferences implements NotificationPreferenceReaderPort {
  async getDeliveryPreference(): Promise<{ readonly allowed: true }> {
    return {
      allowed: true,
    };
  }
}

const queueAttempt = async (params: {
  readonly attempts: DeliveryAttemptRepositoryPort;
  readonly maxRetries: number;
}) => {
  const tenant = tenantId('tenant-1');
  const workspace = workspaceId('workspace-1');
  const queued = await new QueueDeliveryAttemptUseCase(
    params.attempts,
    new SequenceIdGenerator(),
    new FixedClock(new Date('2026-06-06T00:00:00.000Z')),
  ).execute({
    tenantId: tenant,
    workspaceId: workspace,
    idempotencyKey: 'email:tenant-1:user-1:digest-1',
    channel: 'email',
    recipientKey: 'user-1',
    resourceType: 'digest',
    resourceId: 'digest-1',
    maxRetries: params.maxRetries,
  });

  if (!queued.ok) {
    throw queued.error;
  }

  return {
    tenant,
    workspace,
    deliveryAttemptId: queued.value.deliveryAttemptId,
  };
};

describe('SendDeliveryAttemptUseCase', () => {
  it('marks an accepted provider send as delivered', async () => {
    const attempts = new FakeDeliveryAttempts();
    const queued = await queueAttempt({ attempts, maxRetries: 1 });
    const provider = new FakeDeliveryProvider('email', {
      accepted: true,
      providerMessageId: 'provider-message-1',
    });

    const result = await new SendDeliveryAttemptUseCase(
      attempts.workflow,
      [provider],
      new AllowAllPreferences(),
      new FixedClock(new Date('2026-06-06T00:01:00.000Z')),
      new CryptoIdGenerator(),
    ).execute({
      tenantId: queued.tenant,
      workspaceId: queued.workspace,
      deliveryAttemptId: queued.deliveryAttemptId,
      content: {
        subject: 'Digest',
        body: 'Digest body',
      },
    });

    expect(result).toEqual({
      ok: true,
      value: {
        attempt: expect.objectContaining({
          id: queued.deliveryAttemptId,
          state: 'delivered',
          sendingAt: '2026-06-06T00:01:00.000Z',
          deliveredAt: '2026-06-06T00:01:00.000Z',
        }),
        providerMessageId: 'provider-message-1',
      },
    });
    expect(provider.requests).toHaveLength(1);
  });

  it('dead-letters when provider failure exhausts retry budget', async () => {
    const attempts = new FakeDeliveryAttempts();
    const queued = await queueAttempt({ attempts, maxRetries: 0 });

    const result = await new SendDeliveryAttemptUseCase(
      attempts.workflow,
      [
        new FakeDeliveryProvider('email', {
          accepted: false,
          retryable: true,
          reason: 'Provider returned 429',
        }),
      ],
      new AllowAllPreferences(),
      new FixedClock(new Date('2026-06-06T00:01:00.000Z')),
      new CryptoIdGenerator(),
    ).execute({
      tenantId: queued.tenant,
      workspaceId: queued.workspace,
      deliveryAttemptId: queued.deliveryAttemptId,
      content: {
        body: 'Digest body',
      },
    });

    expect(result).toEqual({
      ok: true,
      value: {
        attempt: expect.objectContaining({
          id: queued.deliveryAttemptId,
          state: 'dead_lettered',
          retryCount: 1,
          failureReason: 'Provider returned 429',
          deadLetteredAt: '2026-06-06T00:01:00.000Z',
        }),
      },
    });
  });
});
