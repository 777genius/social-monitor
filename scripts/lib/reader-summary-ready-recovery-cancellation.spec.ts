import { EventEmitter } from 'node:events';
import type { ChannelModel, ConfirmChannel } from 'amqplib';
import { AmqplibRabbitMqChannel } from '@social-monitor/platform-queue/adapters/rabbitmq';
import { RabbitMqEventPublisher } from '@social-monitor/platform-events/adapters/rabbitmq';
import { readyRecoveryFixture } from './reader-summary-ready-recovery-fixture';
import { runReadyRecovery } from './reader-summary-ready-recovery-run';
import { assertRecoveryWindow, originalEnvelope } from './reader-summary-ready-recovery-manifest';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

describe('recovery terminal pre-wire cancellation', () => {
  let f: ReturnType<typeof readyRecoveryFixture>;
  beforeEach(() => { f = readyRecoveryFixture(2); jest.useFakeTimers(); });
  afterEach(() => { f.cleanup(); jest.useRealTimers(); });
  it.each(['connect', 'channel', 'assert', 'confirm', 'window'])('inhibits pending %s continuation after deadline, retains claims and never retries', async delay => {
    const reached = deferred<void>(), release = deferred<void>();
    const wait = async (phase: string) => { if ((delay === 'window' ? 'assert' : delay) === phase) { reached.resolve(); await release.promise; } };
    if (delay === 'window') f.manifest.window.expiresAt = new Date(f.options().clock.now().getTime() + 500).toISOString();
    const native = Object.assign(new EventEmitter(), {
      assertExchange: async () => { await wait('assert'); }, close: async () => undefined,
      publish: jest.fn(() => true), waitForConfirms: async () => { await wait('confirm'); },
    });
    const connection = Object.assign(new EventEmitter(), {
      createConfirmChannel: async () => { await wait('channel'); return native as unknown as ConfirmChannel; }, close: async () => undefined,
    });
    const connect = jest.fn(async () => { await wait('connect'); return connection as unknown as ChannelModel; });
    const channel = new AmqplibRabbitMqChannel({ url: 'amqp://synthetic', connect });
    const options = { ...f.options(), publisher: new RabbitMqEventPublisher(channel, { exchange: 'social-monitor.events', mandatory: true }),
      cancelPendingPublishes: () => channel.cancelPendingPublishes() };
    const run = runReadyRecovery(options);
    const failed = expect(run).rejects.toThrow('publish deadline');
    await reached.promise;
    await jest.advanceTimersByTimeAsync(delay === 'window' ? 500 : 15_000); await failed;
    release.resolve(); await jest.advanceTimersByTimeAsync(0);
    const sent = delay === 'confirm' ? 1 : 0;
    expect(native.publish).toHaveBeenCalledTimes(sent);
    if (sent) expect(native.publish.mock.calls[0]).toEqual(expect.arrayContaining([expect.objectContaining({ mandatory: true })]));
    expect(JSON.parse(f.receipt(`${f.snapshots[0]!.row.id}.uncertain`))).toMatchObject({ publishing: true, confirmed: false, acknowledged: false });
    expect(f.snapshots[1]!.row.publishAttempts).toBe(0);
    await expect(runReadyRecovery(options)).rejects.toThrow('apply_precondition_failed');
    await channel.close();
    await expect(options.publisher.publish(originalEnvelope(f.snapshots[0]!.row))).rejects.toThrow();
    expect(native.publish).toHaveBeenCalledTimes(sent); expect(connect).toHaveBeenCalledTimes(1);
  });
  it('checks the exclusive window immediately before the wire call after delayed assertion', async () => {
    const clock = { now: () => new Date(f.manifest.window.startedAt) };
    let current = clock.now(); clock.now = () => current;
    const native = Object.assign(new EventEmitter(), {
      assertExchange: async () => { current = new Date(f.manifest.window.expiresAt); },
      publish: jest.fn(() => true), waitForConfirms: async () => undefined, close: async () => undefined,
    });
    const connection = Object.assign(new EventEmitter(), {
      createConfirmChannel: async () => native as unknown as ConfirmChannel, close: async () => undefined,
    });
    const channel = new AmqplibRabbitMqChannel({ url: 'amqp://synthetic', connect: async () => connection as unknown as ChannelModel,
      beforePublish: () => assertRecoveryWindow(f.manifest, f.manifest.deployedSourceSha, clock.now()) });
    await expect(runReadyRecovery({ ...f.options(), clock,
      publisher: new RabbitMqEventPublisher(channel, { exchange: 'social-monitor.events' }),
      cancelPendingPublishes: () => channel.cancelPendingPublishes() })).rejects.toThrow('operation_window_closed');
    expect(native.publish).not.toHaveBeenCalled(); await channel.close();
  });
});
