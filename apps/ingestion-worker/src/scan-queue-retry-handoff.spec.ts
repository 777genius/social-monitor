import { NestStructuredLogger } from '@social-monitor/platform-logging';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { DomainError, FixedClock, tenantId, workspaceId } from '@social-monitor/shared-kernel';
import type { ScanRetryDelivery } from '@social-monitor/ingestion/ports';

import { ScanQueueDrainLoop } from './scan-queue-drain-loop';
import type { QueueCommandDelivery } from './scan-command-queue-reader';

const primaryDelivery = (): QueueCommandDelivery => ({
  command: { commandId: 'primary-sandbox', commandType: 'ingestion.scan.execute', schemaVersion: 1,
    correlationId: 'correlation-sandbox', payload: {} },
  diagnostics: { redelivered: false, deadLetterCount: 0 },
  ack: jest.fn(async () => undefined), nack: jest.fn(async () => undefined),
});
const retryDelivery = (): ScanRetryDelivery => ({
  command: {
    tenantId: tenantId('tenant-sandbox'), workspaceId: workspaceId('workspace-sandbox'),
    scanJobId: 'scan-sandbox', interestId: 'interest-sandbox', sourceBindingId: 'binding-sandbox',
    scanPolicyId: 'policy-sandbox', providerKey: 'fake-source', sourceQuery: { mode: 'search', query: 'sandbox' },
    correlationId: 'correlation-sandbox', causationId: 'causation-sandbox', attemptNumber: 1,
    nextAttemptNumber: 2, retryBudget: 3, failureReason: 'Provider unavailable',
  },
  ack: jest.fn(async () => undefined), nack: jest.fn(async () => undefined), renew: jest.fn(async () => true),
});

const fixture = () => {
  const queue = { drain: jest.fn(async () => [] as readonly QueueCommandDelivery[]) };
  const retries = { claimRetries: jest.fn(async () => [] as readonly ScanRetryDelivery[]) };
  const handler = { handle: jest.fn(async () => undefined) };
  const loop = Reflect.construct(ScanQueueDrainLoop, [queue, handler, retries,
    { enabled: true, runOnStart: false, intervalMs: 10, limit: 3 },
    new InMemoryMetricsRecorder(), new FixedClock(new Date('2026-10-30T12:00:00Z')),
  ]) as ScanQueueDrainLoop;
  return { queue, retries, handler, loop };
};

describe('scan broker and retry claim handoff', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(NestStructuredLogger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(NestStructuredLogger.prototype, 'info').mockImplementation(() => undefined);
  });
  afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

  it('requeues acquired broker work when retry claiming fails and recovers next tick', async () => {
    const context = fixture();
    const acquired = primaryDelivery();
    context.queue.drain.mockResolvedValueOnce([acquired]);
    context.retries.claimRetries.mockRejectedValueOnce(new Error('Retry database unavailable'));
    await context.loop.onModuleInit();
    await jest.advanceTimersByTimeAsync(10);
    expect(acquired.nack).toHaveBeenCalledWith({ requeue: true });
    expect(context.handler.handle).not.toHaveBeenCalled();
    context.queue.drain.mockResolvedValueOnce([acquired]);
    await jest.advanceTimersByTimeAsync(10);
    expect(acquired.ack).toHaveBeenCalledTimes(1);
    await context.loop.onModuleDestroy();
  });

  it('releases both broker deliveries and retry claims when a later drain fails', async () => {
    const context = fixture();
    const acquired = primaryDelivery();
    const retry = retryDelivery();
    context.queue.drain.mockResolvedValueOnce([acquired]).mockRejectedValueOnce(new Error('Extra drain unavailable'));
    context.retries.claimRetries.mockResolvedValueOnce([retry]);
    await context.loop.onModuleInit();
    await jest.advanceTimersByTimeAsync(10);
    expect(acquired.nack).toHaveBeenCalledWith({ requeue: true });
    expect(retry.nack).toHaveBeenCalledWith({ requeue: true });
    await context.loop.onModuleDestroy();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('attempts to release every unprocessed broker delivery after settlement failure', async () => {
    const context = fixture();
    const first = primaryDelivery();
    const second = primaryDelivery();
    jest.mocked(first.nack).mockRejectedValue(new Error('Settlement unavailable'));
    context.queue.drain.mockResolvedValueOnce([first, second]);
    context.handler.handle.mockRejectedValueOnce(new Error('Handler unavailable'));
    await context.loop.onModuleInit();
    await jest.advanceTimersByTimeAsync(10);
    expect(second.nack).toHaveBeenCalledWith({ requeue: true });
    expect(context.handler.handle).toHaveBeenCalledTimes(1);
    await context.loop.onModuleDestroy();
  });

  it('acknowledges an attempt whose next retry was durably recorded', async () => {
    const context = fixture();
    const retry = retryDelivery();
    context.retries.claimRetries.mockResolvedValueOnce([retry]);
    context.handler.handle.mockRejectedValueOnce(new DomainError('external.dependency_unavailable', 'Provider unavailable', {
      reason: 'scan_failure_recorded', disposition: 'retry_scheduled',
    }));
    await context.loop.onModuleInit();
    await jest.advanceTimersByTimeAsync(10);
    expect(retry.ack).toHaveBeenCalledTimes(1);
    expect(retry.nack).not.toHaveBeenCalled();
    await context.loop.onModuleDestroy();
  });

  it('returns an unprocessed retry claim when shutdown begins during primary work', async () => {
    const context = fixture();
    const retry = retryDelivery();
    context.queue.drain.mockResolvedValueOnce([primaryDelivery()]);
    context.retries.claimRetries.mockResolvedValueOnce([retry]);
    context.handler.handle.mockImplementationOnce(async () => { void context.loop.onModuleDestroy(); });
    await context.loop.onModuleInit();
    await jest.advanceTimersByTimeAsync(10);
    await context.loop.onModuleDestroy();
    expect(context.handler.handle).toHaveBeenCalledTimes(1);
    expect(retry.nack).toHaveBeenCalledWith({ requeue: true });
    expect(jest.getTimerCount()).toBe(0);
  });
});
