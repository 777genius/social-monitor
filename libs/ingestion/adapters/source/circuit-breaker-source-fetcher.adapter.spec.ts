import { tenantId, type Clock, type DomainError, workspaceId } from '@social-monitor/shared-kernel';

import type {
  FetchSourceItemsCommand,
  FetchSourceItemsResult,
  SourceFetcherPort,
} from '../../ports';
import { CircuitBreakerSourceFetcherAdapter } from './circuit-breaker-source-fetcher.adapter';

class MutableClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return new Date(this.current.getTime());
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}

class FailingSourceFetcher implements SourceFetcherPort {
  readonly calls: FetchSourceItemsCommand[] = [];

  async fetch(command: FetchSourceItemsCommand): Promise<FetchSourceItemsResult> {
    this.calls.push(command);
    throw new Error('Provider unavailable');
  }
}

const command: FetchSourceItemsCommand = {
  tenantId: tenantId('tenant-1'),
  workspaceId: workspaceId('workspace-1'),
  sourceBindingId: 'source-binding-1',
  scanJobId: 'scan-job-1',
  providerKey: 'fake-source',
  sourceQuery: { mode: 'search', query: 'monitoring' },
  correlationId: 'correlation-1',
  cursor: 'cursor-before-scan',
};

describe('CircuitBreakerSourceFetcherAdapter', () => {
  it('opens after threshold failures and skips provider calls during cooldown', async () => {
    const clock = new MutableClock(new Date('2026-06-07T00:00:00.000Z'));
    const delegate = new FailingSourceFetcher();
    const fetcher = new CircuitBreakerSourceFetcherAdapter(delegate, clock, {
      failureThreshold: 2,
      cooldownSeconds: 60,
    });

    await expect(fetcher.fetch(command)).rejects.toThrow('Provider unavailable');
    await expect(fetcher.fetch(command)).rejects.toThrow('Provider unavailable');
    await expect(fetcher.fetch(command)).rejects.toMatchObject({
      code: 'external.dependency_unavailable',
      message: 'Source provider circuit is open',
    } satisfies Partial<DomainError>);

    expect(delegate.calls).toHaveLength(2);
  });

  it('allows a provider call after cooldown expires', async () => {
    const clock = new MutableClock(new Date('2026-06-07T00:00:00.000Z'));
    const delegate = new FailingSourceFetcher();
    const fetcher = new CircuitBreakerSourceFetcherAdapter(delegate, clock, {
      failureThreshold: 1,
      cooldownSeconds: 60,
    });

    await expect(fetcher.fetch(command)).rejects.toThrow('Provider unavailable');
    await expect(fetcher.fetch(command)).rejects.toThrow('Source provider circuit is open');
    clock.advance(60_001);
    await expect(fetcher.fetch(command)).rejects.toThrow('Provider unavailable');

    expect(delegate.calls).toHaveLength(2);
  });
});
