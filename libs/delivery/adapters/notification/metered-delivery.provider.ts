import type { MetricsRecorderPort } from '@social-monitor/platform-metrics';

import type {
  DeliveryProviderPort,
  SendDeliveryRequest,
  SendDeliveryResult,
} from '../../ports';

export class MeteredDeliveryProvider implements DeliveryProviderPort {
  readonly channel: DeliveryProviderPort['channel'];

  constructor(
    private readonly delegate: DeliveryProviderPort,
    private readonly metrics: MetricsRecorderPort,
  ) {
    this.channel = delegate.channel;
  }

  async send(request: SendDeliveryRequest): Promise<SendDeliveryResult> {
    this.metrics.incrementCounter({
      name: 'delivery_attempts_total',
      labels: {
        channel: this.channel,
        resource_type: request.attempt.resourceType,
        status: 'started',
      },
    });

    const result = await this.delegate.send(request);
    this.metrics.incrementCounter({
      name: 'delivery_attempts_total',
      labels: {
        channel: this.channel,
        resource_type: request.attempt.resourceType,
        status: result.accepted ? 'delivered' : 'failed',
      },
    });

    if (!result.accepted) {
      this.metrics.incrementCounter({
        name: 'delivery_failures_total',
        labels: {
          channel: this.channel,
          resource_type: request.attempt.resourceType,
          retryable: result.retryable,
        },
      });
    }

    return result;
  }
}
