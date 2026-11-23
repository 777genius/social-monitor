import { NestStructuredLogger } from '@social-monitor/platform-logging';
import { FixedClock } from '@social-monitor/shared-kernel';

import { ScanQueueDrainLoop } from '../../apps/ingestion-worker/src/scan-queue-drain-loop';
import { DeliveryAttemptQueueDrainLoop } from '../../apps/delivery-service/src/delivery-attempt-queue-drain-loop';
import { SummaryReadyEventDrainLoop } from '../../apps/delivery-service/src/summary-ready-event-drain-loop';
import { SummaryJobQueueDrainLoop } from '../../apps/intelligence-worker/src/summary-job-queue-drain-loop';
import { SummaryJobPollingLoop } from '../../apps/intelligence-worker/src/summary-job-polling-loop';
import { ReaderSummaryJobQueueDrainLoop } from '../../apps/intelligence-worker/src/reader-summary-job-queue-drain-loop';

type Loop = { onModuleInit(): Promise<void>; onModuleDestroy(): Promise<void> };
const cases = [
  { name: 'scan', implementation: ScanQueueDrainLoop, scan: true },
  { name: 'delivery attempt', implementation: DeliveryAttemptQueueDrainLoop },
  { name: 'summary ready event', implementation: SummaryReadyEventDrainLoop },
  { name: 'summary job', implementation: SummaryJobQueueDrainLoop },
  { name: 'reader summary job', implementation: ReaderSummaryJobQueueDrainLoop },
];

function fixture(implementation: typeof cases[number]['implementation'], scan = false, runOnStart = false,
  executionPaused = false) {
  const queue = { drain: jest.fn(async () => [] as unknown[]) };
  const handler = { handle: jest.fn(async () => undefined) };
  const retryQueue = { claimRetries: jest.fn(async () => []) };
  const options = { enabled: true, runOnStart, intervalMs: 10, limit: 1, executionPaused };
  const metrics = { recordGauge: jest.fn() };
  const clock = new FixedClock(new Date('2026-10-30T12:00:00Z'));
  const loop = Reflect.construct(implementation, scan
    ? [queue, handler, retryQueue, options, metrics, clock]
    : [queue, handler, options, metrics, clock]) as Loop;
  return { loop, queue, handler };
}

function delivery() {
  return {
    command: { commandId: 'synthetic-command', commandType: 'synthetic', schemaVersion: 1,
      correlationId: 'synthetic', payload: {} },
    event: { eventId: 'synthetic-event' },
    diagnostics: { redelivered: false, deadLetterCount: 0 },
    ack: jest.fn(async () => undefined),
    nack: jest.fn(async (options: { requeue: boolean }) => { void options; }),
  };
}

test.each([ReaderSummaryJobQueueDrainLoop, SummaryJobQueueDrainLoop])('paused summary execution leaves queue deliveries untouched', async (implementation) => {
  jest.useFakeTimers();
  try {
    const f = fixture(implementation, false, true, true);
    await f.loop.onModuleInit();
    await jest.advanceTimersByTimeAsync(100);
    expect(f.queue.drain).not.toHaveBeenCalled();
    expect(f.handler.handle).not.toHaveBeenCalled();
    await f.loop.onModuleDestroy();
  } finally {
    jest.useRealTimers();
  }
});

test('paused summary execution does not poll legacy jobs', async () => {
  jest.useFakeTimers();
  try {
    const repository = { findRequested: jest.fn() };
    const handler = { handle: jest.fn() };
    const loop = Reflect.construct(SummaryJobPollingLoop, [handler, repository,
      { enabled: true, executionPaused: true, runOnStart: true, intervalMs: 10, limit: 1 }]) as Loop;
    await loop.onModuleInit();
    await jest.advanceTimersByTimeAsync(100);
    expect(repository.findRequested).not.toHaveBeenCalled();
    expect(handler.handle).not.toHaveBeenCalled();
    await loop.onModuleDestroy();
  } finally {
    jest.useRealTimers();
  }
});

describe.each(cases)('$name queue tick failure boundary', ({ implementation, ...entry }) => {
  let errorLog: jest.SpyInstance;
  beforeEach(() => {
    jest.useFakeTimers();
    errorLog = jest.spyOn(NestStructuredLogger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(NestStructuredLogger.prototype, 'info').mockImplementation(() => undefined);
  });
  afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

  it('contains transient drain failure and processes the next interval', async () => {
    const f = fixture(implementation, 'scan' in entry && entry.scan);
    const next = delivery();
    f.queue.drain.mockRejectedValueOnce(new Error('synthetic broker unavailable'))
      .mockResolvedValueOnce([next]);
    await f.loop.onModuleInit();
    await jest.advanceTimersByTimeAsync(10);
    expect(errorLog).toHaveBeenCalledWith('queue drain loop tick failed', expect.objectContaining({
      trigger: 'interval', error: 'synthetic broker unavailable',
    }));
    await jest.advanceTimersByTimeAsync(10);
    expect(f.handler.handle).toHaveBeenCalledTimes(1);
    expect(next.ack).toHaveBeenCalledTimes(1);
    await f.loop.onModuleDestroy();
    const drainCalls = f.queue.drain.mock.calls.length;
    await jest.advanceTimersByTimeAsync(50);
    expect(f.queue.drain).toHaveBeenCalledTimes(drainCalls);
  });

  it('contains failed negative settlement and permits a later successful delivery', async () => {
    const f = fixture(implementation, 'scan' in entry && entry.scan);
    const failed = delivery();
    failed.nack.mockRejectedValueOnce(new Error('synthetic stale channel'));
    const recovered = delivery();
    f.queue.drain.mockResolvedValueOnce([failed]).mockResolvedValueOnce([recovered]);
    f.handler.handle.mockRejectedValueOnce(new Error('synthetic handler failed'));
    await f.loop.onModuleInit();
    await jest.advanceTimersByTimeAsync(10);
    expect(errorLog).toHaveBeenCalledWith('queue drain loop tick failed', expect.objectContaining({
      error: 'synthetic stale channel',
    }));
    await jest.advanceTimersByTimeAsync(10);
    expect(recovered.ack).toHaveBeenCalledTimes(1);
    await f.loop.onModuleDestroy();
  });

  it('retains startup fail-fast behavior', async () => {
    const f = fixture(implementation, 'scan' in entry && entry.scan, true);
    f.queue.drain.mockRejectedValueOnce(new Error('synthetic startup failure'));
    await expect(f.loop.onModuleInit()).rejects.toThrow('synthetic startup failure');
    expect(jest.getTimerCount()).toBe(0);
    await f.loop.onModuleDestroy();
  });

  it('does not turn an acknowledgement failure into terminal rejection and releases every sibling', async () => {
    const f = fixture(implementation, 'scan' in entry && entry.scan);
    const first = delivery();
    const second = delivery();
    first.ack.mockRejectedValueOnce(new Error('synthetic acknowledgement uncertain'));
    f.queue.drain.mockResolvedValueOnce([first, second]);
    await f.loop.onModuleInit();
    await jest.advanceTimersByTimeAsync(10);
    expect(f.handler.handle).toHaveBeenCalledTimes(1);
    expect(first.nack.mock.calls).toEqual([[{ requeue: true }]]);
    expect(second.nack.mock.calls).toEqual([[{ requeue: true }]]);
    await f.loop.onModuleDestroy();
  });

  it('attempts every sibling release when both terminal settlement and cleanup fail', async () => {
    const f = fixture(implementation, 'scan' in entry && entry.scan);
    const first = delivery();
    const second = delivery();
    first.nack.mockRejectedValue(new Error('synthetic settlement unavailable'));
    f.queue.drain.mockResolvedValueOnce([first, second]);
    f.handler.handle.mockRejectedValueOnce(new Error('synthetic handler failure'));
    await f.loop.onModuleInit();
    await jest.advanceTimersByTimeAsync(10);
    expect(first.nack.mock.calls).toEqual([[{ requeue: false }], [{ requeue: true }]]);
    expect(second.nack).toHaveBeenCalledWith({ requeue: true });
    expect(f.handler.handle).toHaveBeenCalledTimes(1);
    await f.loop.onModuleDestroy();
  });
});
