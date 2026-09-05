import type { GetMessage } from 'amqplib';
import { CryptoIdGenerator, FixedClock } from '@social-monitor/shared-kernel';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { WorkerRuntime } from '@social-monitor/platform-worker';
import { InMemoryRealtimeEventRepository } from '@social-monitor/delivery/adapters/persistence/in-memory-realtime-event.repository';
import { InMemoryReaderSummaryReadyProjectionStore } from '@social-monitor/delivery/adapters/persistence/in-memory-reader-summary-ready-projection.store';
import { ProjectReaderSummaryReadyEventUseCase } from '@social-monitor/delivery/features/project-reader-summary-ready-event/project-reader-summary-ready-event.use-case';
import { ProjectReaderSummaryReadyEventHandler } from '@social-monitor/delivery/interfaces/events/project-reader-summary-ready-event.handler';
import { ProjectSummaryReadyEventUseCase } from '@social-monitor/delivery/features/project-summary-ready-event/project-summary-ready-event.use-case';
import { RecordRealtimeEventUseCase } from '@social-monitor/delivery/features/record-realtime-event/record-realtime-event.use-case';
import { ProjectSummaryReadyEventHandler } from '@social-monitor/delivery/interfaces/events/project-summary-ready-event.handler';
import { SummaryReadyEventDispatcher } from '@social-monitor/delivery/interfaces/events/summary-ready-event.dispatcher';
import { readerSummaryReadyFixture } from '@social-monitor/delivery/test-support/reader-summary-ready.fixture';
import { RabbitMqSummaryReadyEventQueueReader, type RabbitMqSummaryReadyEventQueueReaderChannelPort } from './summary-ready-event-queue-reader';
import { SummaryReadyEventDrainLoop } from './summary-ready-event-drain-loop';
import { resolveDeliverySummaryReadyEventQueueOptions } from './delivery-service-provider-tokens';

function setup(input: readonly GetMessage[], failAck = false) {
  const messages = [...input];
  const channel = {
    assertExchange: jest.fn(), assertQueue: jest.fn(), bindQueue: jest.fn(), prefetch: jest.fn(),
    get: jest.fn(async () => messages.shift() ?? false), ack: jest.fn(async () => undefined), nack: jest.fn(),
  } satisfies RabbitMqSummaryReadyEventQueueReaderChannelPort;
  if (failAck) channel.ack.mockRejectedValueOnce(new Error('fixture lost ack'));
  const metrics = new InMemoryMetricsRecorder();
  const runtime = new WorkerRuntime({ serviceName: 'delivery-fixture' });
  runtime.onModuleInit();
  const events = new InMemoryRealtimeEventRepository();
  const reader = new ProjectReaderSummaryReadyEventHandler(new ProjectReaderSummaryReadyEventUseCase(
    new InMemoryReaderSummaryReadyProjectionStore(events, new CryptoIdGenerator())), metrics, runtime);
  const clock = new FixedClock(new Date('2026-09-04T00:03:00.000Z'));
  const legacy = new ProjectSummaryReadyEventHandler(new ProjectSummaryReadyEventUseCase(
    new RecordRealtimeEventUseCase(events, new CryptoIdGenerator(), clock)), metrics, runtime);
  const queue = new RabbitMqSummaryReadyEventQueueReader(channel, resolveDeliverySummaryReadyEventQueueOptions({}));
  const dispatcher = new SummaryReadyEventDispatcher(legacy, reader);
  return { channel, events, reader, dispatcher, runtime,
    loop: new SummaryReadyEventDrainLoop(queue, dispatcher,
      { enabled: true, intervalMs: 60_000, limit: input.length, runOnStart: true }, metrics, clock) };
}
function message(event: Record<string, unknown>, routingKey = String(event.eventType)): GetMessage {
  return { content: Buffer.from(JSON.stringify(event)), fields: { routingKey, redelivered: false },
    properties: { headers: {} } } as GetMessage;
}

describe('delivery shared summary ready queue', () => {
  it('binds both exact keys, projects ReaderSummary, preserves legacy behavior and dedupes a lost ack replay', async () => {
    const reader = readerSummaryReadyFixture();
    const old = { ...reader, eventType: 'summary.ready', causationId: 'fixture-cause',
      payload: { ...reader.payload, interestId: 'fixture-interest', summaryId: 'fixture-summary', summaryJobId: 'fixture-job' } };
    const fixture = setup([message(reader), message(reader), message(old)], true);
    try { await fixture.loop.onModuleInit(); } finally { await fixture.loop.onModuleDestroy(); }
    expect(fixture.channel.bindQueue.mock.calls).toEqual([
      ['events.delivery.summary.ready', 'social-monitor.events', 'reader_summary.ready'],
      ['events.delivery.summary.ready', 'social-monitor.events', 'summary.ready'],
    ]);
    expect(fixture.channel.ack).toHaveBeenCalledTimes(3);
    expect(fixture.channel.nack).toHaveBeenCalledTimes(1);
    const replay = await fixture.events.list({ ...reader.payload,
      channel: `workspace:${reader.workspaceId}:summary-status`, limit: 10 });
    expect(replay.events).toHaveLength(1);
    const legacyReplay = await fixture.events.list({ ...reader.payload,
      channel: 'interest:fixture-interest:summary-status', limit: 10 });
    expect(legacyReplay.events[0]?.toSnapshot()).toMatchObject({ eventType: 'summary.status.changed.v1', resourceId: 'fixture-summary' });
  });

  it('rejects unsupported routes and invalid payloads without an ack or downstream effect', async () => {
    const event = readerSummaryReadyFixture();
    const fixture = setup([
      { ...message(event), content: Buffer.from('{') },
      { ...message(event), content: Buffer.from('[]') },
      message({ ...event, schemaVersion: 2 }),
      message(event, 'summary.ready'),
      message({ ...event, eventType: 'summary.failed' }),
      message({ ...event, workspaceId: '00000000-0000-4000-8000-000000009099' }),
    ]);
    try { await fixture.loop.onModuleInit(); } finally { await fixture.loop.onModuleDestroy(); }
    expect(fixture.channel.nack).toHaveBeenCalledTimes(6);
    expect(fixture.channel.ack).not.toHaveBeenCalled();
    for (const call of fixture.channel.nack.mock.calls) expect(call.slice(1)).toEqual([false, false]);
    expect((await fixture.events.list({ ...event.payload,
      channel: `workspace:${event.workspaceId}:summary-status`, limit: 10 })).events).toHaveLength(0);
    await expect(fixture.dispatcher.handle({ eventType: 'anything' })).rejects.toThrow('Unsupported delivery event');
  });

  it('fails closed on a routing override', () => {
    for (const routingKey of ['#', '*', 'reader_summary.ready', 'summary.failed', '']) {
      expect(() => resolveDeliverySummaryReadyEventQueueOptions({ RABBITMQ_SUMMARY_READY_EVENT_ROUTING_KEY: routingKey })).toThrow();
    }
  });
});
