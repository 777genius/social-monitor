import type { RabbitMqQueueChannelPort } from '@social-monitor/platform-queue/adapters/rabbitmq';
import type { EventEnvelope } from '@social-monitor/shared-kernel';

import { RabbitMqEventPublisher } from './rabbitmq-event-publisher';

const event: EventEnvelope<Readonly<Record<string, unknown>>> = {
  eventId: 'synthetic-event', eventType: 'summary.ready', schemaVersion: 1,
  occurredAt: new Date('2026-11-04T00:00:00.000Z'), correlationId: 'synthetic-correlation',
  tenantId: 'synthetic-tenant', workspaceId: 'synthetic-workspace', payload: { summaryId: 'synthetic-summary' },
};

describe('RabbitMqEventPublisher publication outcome', () => {
  const fixture = () => {
    const channel: jest.Mocked<RabbitMqQueueChannelPort> = {
      assertExchange: jest.fn(async () => undefined),
      assertQueue: jest.fn(async () => undefined),
      bindQueue: jest.fn(async () => undefined),
      publishAndConfirm: jest.fn(async () => true),
    };
    return { channel, publisher: new RabbitMqEventPublisher(channel, { exchange: 'synthetic-events' }) };
  };

  it('accepts a confirmed event when amqplib reports a full local buffer', async () => {
    const { channel, publisher } = fixture();
    channel.publishAndConfirm.mockResolvedValue(false);
    await expect(publisher.publish(event)).resolves.toBeUndefined();
    expect(channel.publishAndConfirm).toHaveBeenCalledTimes(1);
    expect(channel.publishAndConfirm).toHaveBeenCalledWith('synthetic-events', 'summary.ready',
      expect.any(Buffer), expect.objectContaining({ messageId: event.eventId, mandatory: true }));
  });

  it('propagates an unconfirmed broker outcome to durable retry instead of reporting publication', async () => {
    const { channel, publisher } = fixture();
    const lost = new Error('synthetic broker connection closed before confirmation');
    channel.publishAndConfirm.mockRejectedValueOnce(lost);
    await expect(publisher.publish(event)).rejects.toBe(lost);
    channel.publishAndConfirm.mockResolvedValueOnce(true);
    await expect(publisher.publish(event)).resolves.toBeUndefined();
    expect(channel.publishAndConfirm).toHaveBeenCalledTimes(2);
    const [first, retry] = channel.publishAndConfirm.mock.calls;
    expect(retry?.[2]).toEqual(first?.[2]);
    expect(retry?.[3].messageId).toBe(first?.[3].messageId);
  });
});
