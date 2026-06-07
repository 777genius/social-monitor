import { tenantId, type Clock, workspaceId } from '@social-monitor/shared-kernel';

import type {
  DeliveryProviderPort,
  SendDeliveryRequest,
  SendDeliveryResult,
} from '../../ports';
import { CircuitBreakerDeliveryProvider } from './circuit-breaker-delivery.provider';

class MutableClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return new Date(this.current.getTime());
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}

class QueuedDeliveryProvider implements DeliveryProviderPort {
  readonly channel = 'webhook';
  readonly requests: SendDeliveryRequest[] = [];

  constructor(private readonly results: SendDeliveryResult[]) {}

  async send(request: SendDeliveryRequest): Promise<SendDeliveryResult> {
    this.requests.push(request);

    return this.results.shift() ?? { accepted: true };
  }
}

const request: SendDeliveryRequest = {
  attempt: {
    id: 'delivery-attempt-1',
    tenantId: tenantId('tenant-1'),
    workspaceId: workspaceId('workspace-1'),
    idempotencyKey: 'digest:1',
    channel: 'webhook',
    recipientKey: 'endpoint-1',
    resourceType: 'digest',
    resourceId: 'digest-1',
    state: 'sending',
    retryCount: 0,
    maxRetries: 3,
    queuedAt: new Date('2026-06-07T00:00:00.000Z'),
    sendingAt: new Date('2026-06-07T00:00:01.000Z'),
  },
  content: {
    body: 'Digest body',
  },
};

describe('CircuitBreakerDeliveryProvider', () => {
  it('opens after threshold failures and returns retryable failure without provider call', async () => {
    const clock = new MutableClock(new Date('2026-06-07T00:00:00.000Z'));
    const delegate = new QueuedDeliveryProvider([
      { accepted: false, retryable: true, reason: 'Provider unavailable' },
      { accepted: false, retryable: true, reason: 'Provider unavailable' },
      { accepted: true, providerMessageId: 'unexpected' },
    ]);
    const provider = new CircuitBreakerDeliveryProvider(delegate, clock, {
      failureThreshold: 2,
      cooldownSeconds: 60,
    });

    await expect(provider.send(request)).resolves.toEqual({
      accepted: false,
      retryable: true,
      reason: 'Provider unavailable',
    });
    await expect(provider.send(request)).resolves.toEqual({
      accepted: false,
      retryable: true,
      reason: 'Provider unavailable',
    });
    await expect(provider.send(request)).resolves.toEqual({
      accepted: false,
      retryable: true,
      reason: 'Delivery provider circuit is open',
    });

    expect(delegate.requests).toHaveLength(2);
  });

  it('allows delivery after cooldown and resets failures after success', async () => {
    const clock = new MutableClock(new Date('2026-06-07T00:00:00.000Z'));
    const delegate = new QueuedDeliveryProvider([
      { accepted: false, retryable: true, reason: 'Provider unavailable' },
      { accepted: true, providerMessageId: 'provider-message-1' },
      { accepted: false, retryable: true, reason: 'Provider unavailable' },
    ]);
    const provider = new CircuitBreakerDeliveryProvider(delegate, clock, {
      failureThreshold: 1,
      cooldownSeconds: 60,
    });

    await expect(provider.send(request)).resolves.toMatchObject({ accepted: false });
    await expect(provider.send(request)).resolves.toEqual({
      accepted: false,
      retryable: true,
      reason: 'Delivery provider circuit is open',
    });
    clock.advance(60_001);
    await expect(provider.send(request)).resolves.toEqual({
      accepted: true,
      providerMessageId: 'provider-message-1',
    });
    await expect(provider.send(request)).resolves.toMatchObject({
      accepted: false,
      reason: 'Provider unavailable',
    });

    expect(delegate.requests).toHaveLength(3);
  });
});
