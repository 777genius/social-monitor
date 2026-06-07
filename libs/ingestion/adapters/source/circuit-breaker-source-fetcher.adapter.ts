import { type Clock, DomainError } from '@social-monitor/shared-kernel';

import type {
  FetchSourceItemsCommand,
  FetchSourceItemsResult,
  SourceFetcherPort,
} from '../../ports';

export type CircuitBreakerSourceFetcherOptions = {
  readonly failureThreshold: number;
  readonly cooldownSeconds: number;
};

type CircuitState = {
  readonly failureCount: number;
  readonly openedUntil?: Date;
};

export class CircuitBreakerSourceFetcherAdapter implements SourceFetcherPort {
  private readonly states = new Map<string, CircuitState>();

  constructor(
    private readonly delegate: SourceFetcherPort,
    private readonly clock: Clock,
    private readonly options: CircuitBreakerSourceFetcherOptions,
  ) {
    if (!Number.isInteger(options.failureThreshold) || options.failureThreshold < 1) {
      throw new Error('Source circuit breaker failureThreshold must be positive');
    }

    if (!Number.isInteger(options.cooldownSeconds) || options.cooldownSeconds < 1) {
      throw new Error('Source circuit breaker cooldownSeconds must be positive');
    }
  }

  async fetch(command: FetchSourceItemsCommand): Promise<FetchSourceItemsResult> {
    const key = this.stateKey(command);
    const state = this.states.get(key);

    if (state?.openedUntil !== undefined && state.openedUntil.getTime() > this.clock.now().getTime()) {
      throw new DomainError('external.dependency_unavailable', 'Source provider circuit is open', {
        sourceBindingId: command.sourceBindingId,
      });
    }

    try {
      const result = await this.delegate.fetch(command);
      this.states.delete(key);

      return result;
    } catch (error) {
      this.recordFailure(key);
      throw error;
    }
  }

  private recordFailure(key: string): void {
    const current = this.states.get(key);
    const failureCount = (current?.failureCount ?? 0) + 1;
    const openedUntil = failureCount >= this.options.failureThreshold
      ? new Date(this.clock.now().getTime() + this.options.cooldownSeconds * 1000)
      : undefined;

    this.states.set(key, {
      failureCount,
      openedUntil,
    });
  }

  private stateKey(command: FetchSourceItemsCommand): string {
    return [
      command.tenantId,
      command.workspaceId,
      command.sourceBindingId,
    ].join(':');
  }
}
