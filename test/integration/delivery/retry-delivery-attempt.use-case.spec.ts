import { CryptoIdGenerator } from '@social-monitor/shared-kernel';
import { InMemoryDeliveryAttemptRepository } from '@social-monitor/delivery/adapters/persistence/in-memory-delivery-attempt.repository';
import { FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type {
  DeliveryProviderPort,
  SendDeliveryRequest,
  SendDeliveryResult,
  NotificationPreferenceReaderPort,
} from '@social-monitor/delivery/ports';
import { QueueDeliveryAttemptUseCase } from '@social-monitor/delivery/features/queue-delivery-attempt/queue-delivery-attempt.use-case';
import { SendDeliveryAttemptUseCase } from '@social-monitor/delivery/features/send-delivery-attempt/send-delivery-attempt.use-case';
import { RetryDeliveryAttemptUseCase } from '@social-monitor/delivery/features/retry-delivery-attempt/retry-delivery-attempt.use-case';

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `delivery-attempt-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

class FakeDeliveryAttempts extends InMemoryDeliveryAttemptRepository {}

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
      attempts.workflow,
      [provider],
      new AllowAllPreferences(),
      new FixedClock(new Date('2026-06-06T00:01:00.000Z')),
      new CryptoIdGenerator(),
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
