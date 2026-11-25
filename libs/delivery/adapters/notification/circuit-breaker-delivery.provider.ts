import { type Clock } from '@social-monitor/shared-kernel';

import type {
  DeliveryProviderPort,
  SendDeliveryRequest,
  SendDeliveryResult,
} from '../../ports';

export type CircuitBreakerDeliveryProviderOptions = {
  readonly failureThreshold: number;
  readonly cooldownSeconds: number;
};

type CircuitState = {
  readonly failureCount: number;
  readonly openedUntil?: Date;
};

export class CircuitBreakerDeliveryProvider implements DeliveryProviderPort {
  readonly channel: DeliveryProviderPort['channel'];
  private state: CircuitState = { failureCount: 0 };

  constructor(
    private readonly delegate: DeliveryProviderPort,
    private readonly clock: Clock,
    private readonly options: CircuitBreakerDeliveryProviderOptions,
  ) {
    if (!Number.isInteger(options.failureThreshold) || options.failureThreshold < 1) {
      throw new Error('Delivery circuit breaker failureThreshold must be positive');
    }

    if (!Number.isInteger(options.cooldownSeconds) || options.cooldownSeconds < 1) {
      throw new Error('Delivery circuit breaker cooldownSeconds must be positive');
    }

    this.channel = delegate.channel;
  }

  async send(request: SendDeliveryRequest): Promise<SendDeliveryResult> {
    if (this.state.openedUntil !== undefined && this.state.openedUntil.getTime() > this.clock.now().getTime()) {
      return {
        accepted: false,
        retryable: true,
        reason: 'Delivery provider circuit is open',
      };
    }

    const result = await this.delegate.send(request);

    if (result.accepted) {
      this.state = { failureCount: 0 };

      return result;
    }

    this.recordFailure();

    return result;
  }

  private recordFailure(): void {
    const failureCount = this.state.failureCount + 1;
    const openedUntil = failureCount >= this.options.failureThreshold
      ? new Date(this.clock.now().getTime() + this.options.cooldownSeconds * 1000)
      : undefined;

    this.state = {
      failureCount,
      openedUntil,
    };
  }
}
