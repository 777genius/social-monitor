import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type {
  DeliveryProviderPort,
  SendDeliveryRequest,
  SendDeliveryResult,
} from '../../ports';
import { MeteredDeliveryProvider } from './metered-delivery.provider';

class FakeDeliveryProvider implements DeliveryProviderPort {
  readonly channel = 'webhook';

  constructor(private readonly result: SendDeliveryResult) {}

  async send(): Promise<SendDeliveryResult> {
    return this.result;
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
    queuedAt: new Date('2026-06-06T00:00:00.000Z'),
    sendingAt: new Date('2026-06-06T00:00:01.000Z'),
  },
  content: {
    body: 'Digest body',
  },
};

describe('MeteredDeliveryProvider', () => {
  it('records delivery lifecycle metrics for accepted sends', async () => {
    const metrics = new InMemoryMetricsRecorder();
    const provider = new MeteredDeliveryProvider(
      new FakeDeliveryProvider({ accepted: true, providerMessageId: 'provider-message-1' }),
      metrics,
    );

    await expect(provider.send(request)).resolves.toEqual({
      accepted: true,
      providerMessageId: 'provider-message-1',
    });

    expect(metrics.counterValue('delivery_attempts_total', {
      channel: 'webhook',
      resource_type: 'digest',
      status: 'started',
    })).toBe(1);
    expect(metrics.counterValue('delivery_attempts_total', {
      channel: 'webhook',
      resource_type: 'digest',
      status: 'delivered',
    })).toBe(1);
  });

  it('records retryable failure metrics without raw failure reason labels', async () => {
    const metrics = new InMemoryMetricsRecorder();
    const provider = new MeteredDeliveryProvider(
      new FakeDeliveryProvider({ accepted: false, retryable: true, reason: 'https://secret.example/token' }),
      metrics,
    );

    await expect(provider.send(request)).resolves.toEqual({
      accepted: false,
      retryable: true,
      reason: 'https://secret.example/token',
    });

    expect(metrics.counterValue('delivery_attempts_total', {
      channel: 'webhook',
      resource_type: 'digest',
      status: 'failed',
    })).toBe(1);
    expect(metrics.counterValue('delivery_failures_total', {
      channel: 'webhook',
      resource_type: 'digest',
      retryable: true,
    })).toBe(1);
    expect(metrics.counters('delivery_failures_total')).toEqual([
      expect.objectContaining({
        labels: {
          channel: 'webhook',
          resource_type: 'digest',
          retryable: 'true',
        },
      }),
    ]);
  });
});
