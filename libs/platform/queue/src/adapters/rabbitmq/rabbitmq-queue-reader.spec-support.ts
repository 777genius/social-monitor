import type { GetMessage, Message } from 'amqplib';
import type { RabbitMqCommandReaderChannel } from './rabbitmq-queue-command-reader';

export const queueCommandFixture = (commandId = 'synthetic-command') => ({
  commandId, commandType: 'synthetic.execute', schemaVersion: 1,
  correlationId: 'synthetic-correlation', payload: { value: 'fixture' },
});

export const queueMessageFixture = (commandId = 'synthetic-command'): GetMessage => ({
  content: Buffer.from(JSON.stringify(queueCommandFixture(commandId))),
  fields: { deliveryTag: 1, redelivered: false, exchange: 'synthetic', routingKey: 'synthetic.execute', messageCount: 0 },
  properties: { headers: {}, timestamp: 1_700_000_000 },
} as GetMessage);

export function queueReaderFixture(input: readonly GetMessage[]) {
  const available = [...input];
  const pending = new Set<Message>();
  const channel = {
    assertExchange: jest.fn(async () => undefined),
    assertQueue: jest.fn(async () => undefined),
    prefetch: jest.fn(async () => undefined),
    get: jest.fn(async (_queue: string, _options: { readonly noAck: boolean }): Promise<GetMessage | false> => {
      void _queue;
      void _options;
      const message = available.shift();
      if (message === undefined) return false;
      pending.add(message);
      return message;
    }),
    ack: jest.fn(async (message: Message): Promise<void> => {
      if (!pending.delete(message)) throw new Error('Fixture delivery is no longer owned');
    }),
    nack: jest.fn(async (message: Message, _all: boolean, requeue: boolean): Promise<void> => {
      if (!pending.delete(message)) throw new Error('Fixture delivery is no longer owned');
      if (requeue) available.push({ ...message, fields: { ...message.fields, redelivered: true } } as GetMessage);
    }),
    recoverDelivery: jest.fn(async (_message: Message): Promise<void> => {
      void _message;
      for (const message of pending) {
        available.push({ ...message, fields: { ...message.fields, redelivered: true } } as GetMessage);
      }
      pending.clear();
    }),
  } satisfies RabbitMqCommandReaderChannel;
  return { channel, available, pending };
}
