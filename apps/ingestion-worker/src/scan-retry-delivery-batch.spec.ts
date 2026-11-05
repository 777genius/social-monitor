import { FixedClock, tenantId, workspaceId } from '@social-monitor/shared-kernel';
import type { ScanRetryDelivery } from '@social-monitor/ingestion/ports';
import type { StructuredLogger } from '@social-monitor/platform-logging';

import { ScanRetryDeliveryBatch } from './scan-retry-delivery-batch';

const retry = (): ScanRetryDelivery => ({
  command: {
    tenantId: tenantId('tenant-sandbox'), workspaceId: workspaceId('workspace-sandbox'),
    scanJobId: 'scan-sandbox', interestId: 'interest-sandbox', sourceBindingId: 'binding-sandbox',
    scanPolicyId: 'policy-sandbox', providerKey: 'fake-source',
    sourceQuery: { mode: 'search', query: 'sandbox' }, correlationId: 'correlation-sandbox',
    causationId: 'causation-sandbox', attemptNumber: 1, nextAttemptNumber: 2,
    retryBudget: 3, failureReason: 'Provider unavailable',
  },
  ack: jest.fn(async () => undefined), nack: jest.fn(async () => undefined),
  renew: jest.fn(async () => true),
});
const logger: StructuredLogger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() };
const clock = new FixedClock(new Date('2026-10-30T12:00:00Z'));

describe('scan retry delivery batch', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('renews waiting and executing retries until each is settled', async () => {
    const first = retry();
    const second = retry();
    const batch = new ScanRetryDeliveryBatch([first, second], clock, logger);
    await jest.advanceTimersByTimeAsync(60_000);
    expect(first.renew).toHaveBeenCalledWith(clock.now());
    expect(second.renew).toHaveBeenCalledTimes(1);
    await batch.deliveries[0]!.ack();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(first.renew).toHaveBeenCalledTimes(1);
    expect(second.renew).toHaveBeenCalledTimes(2);
    await batch.releaseUnsettled();
    expect(first.ack).toHaveBeenCalledTimes(1);
    expect(first.nack).not.toHaveBeenCalled();
    expect(second.nack).toHaveBeenCalledWith({ requeue: true });
    expect(jest.getTimerCount()).toBe(0);
  });

  it('prevents starting a retry after ownership was lost', async () => {
    const claim = retry();
    jest.mocked(claim.renew).mockResolvedValue(false);
    const batch = new ScanRetryDeliveryBatch([claim], clock, logger);
    await jest.advanceTimersByTimeAsync(60_000);
    expect(batch.owns(batch.deliveries[0]!)).toBe(false);
    await batch.releaseUnsettled();
  });

  it('keeps failed settlement recoverable and attempts every release during shutdown', async () => {
    const first = retry();
    const second = retry();
    jest.mocked(first.ack).mockRejectedValue(new Error('Database unavailable'));
    const batch = new ScanRetryDeliveryBatch([first, second], clock, logger);
    await expect(batch.deliveries[0]!.ack()).rejects.toThrow('Database unavailable');
    jest.mocked(first.nack).mockRejectedValue(new Error('Release unavailable'));
    await expect(batch.releaseUnsettled()).rejects.toThrow('Release unavailable');
    expect(second.nack).toHaveBeenCalledWith({ requeue: true });
    expect(jest.getTimerCount()).toBe(0);
  });
});
