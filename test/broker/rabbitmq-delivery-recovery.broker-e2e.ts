import { brokerCommand, brokerCommandType, RabbitMqBrokerFixture, rabbitMqBrokerTestUrl } from './support/rabbitmq-broker-fixture';

describe('RabbitMQ delivery ownership against a real quorum broker', () => {
  let url: string;
  let fixture: RabbitMqBrokerFixture | undefined;

  beforeAll(() => { url = rabbitMqBrokerTestUrl(); });
  beforeEach(async () => {
    fixture = new RabbitMqBrokerFixture(url);
    await fixture.start();
  });
  afterEach(async () => { await fixture?.close(); });

  it('settles duplicate command IDs per delivery occurrence and reports broker redelivery', async () => {
    const f = fixture!;
    await f.publisher.publish(brokerCommand('same-command-id', 'acknowledged'));
    await f.publisher.publish(brokerCommand('same-command-id', 'requeued'));
    const [first, second] = await f.deliveries(2);
    expect(first!.diagnostics.redelivered).toBe(false);
    expect(second!.diagnostics.redelivered).toBe(false);
    await first!.ack();
    await second!.nack({ requeue: true });
    const [redelivery] = await f.deliveries(1);
    expect(redelivery!.command).toMatchObject({ commandId: 'same-command-id', payload: { occurrence: 'requeued' } });
    expect(redelivery!.diagnostics).toMatchObject({ redelivered: true, deadLetterCount: 0,
      publishedAtEpochMs: Date.parse('2026-11-04T00:00:00.000Z') });
    await redelivery!.ack();
    await expect(first!.ack()).rejects.toThrow('not pending');
    await f.expectFullySettled();
  });

  it('recovers a captured native channel without closing a replacement holding its redelivered siblings', async () => {
    const f = fixture!;
    await f.publisher.publish(brokerCommand('first', 'first'));
    await f.publisher.publish(brokerCommand('second', 'second'));
    const old = await f.rawDeliveries(2);
    await f.channel.recoverDelivery(old[0]!);
    const current = await f.rawDeliveries(2);
    expect(current.map((message) => message.fields.redelivered)).toEqual([true, true]);
    expect(current.map((message) => message.fields.deliveryTag)).toEqual(old.map((message) => message.fields.deliveryTag));
    await expect(f.channel.ack(old[1]!)).rejects.toThrow('origin channel closed');
    await f.channel.recoverDelivery(old[1]!);
    for (const message of current) await f.channel.ack(message);
    // This RPC must still succeed on the replacement after cleanup of the old sibling.
    await f.channel.prefetch(2);
    await f.expectFullySettled();
  });

  it('releases stale deliveries after a broker protocol error while replacement work remains settleable', async () => {
    const f = fixture!;
    await f.publisher.publish(brokerCommand('protocol-first', 'first'));
    await f.publisher.publish(brokerCommand('protocol-second', 'second'));
    const old = await f.deliveries(2);
    // RabbitMQ itself rejects this incompatible declaration and closes the channel.
    await expect(f.channel.assertQueue(f.queue, { durable: false })).rejects.toThrow(/PRECONDITION_FAILED|406/);
    const current = await f.deliveries(2);
    expect(current.every((delivery) => delivery.diagnostics.redelivered)).toBe(true);
    await expect(old[0]!.ack()).rejects.toThrow('origin channel closed');
    for (const delivery of old) await delivery.release!();
    for (const delivery of current) await delivery.ack();
    await f.channel.prefetch(2);
    await f.expectFullySettled();
  });

  it('dead-letters poison and wrong command types with broker rejection metadata, retaining a valid sibling', async () => {
    const f = fixture!;
    await f.publishRaw(Buffer.from('{malformed'));
    await f.publishRaw(Buffer.from(JSON.stringify({ ...brokerCommand('wrong-type', 'wrong'), commandType: 'other.execute' })));
    await f.publisher.publish(brokerCommand('valid', 'valid'));
    await f.expectReadyCount(3);
    expect(await f.reader.drain({ commandType: brokerCommandType, limit: 2 })).toEqual([]);
    const [valid] = await f.deliveries(1);
    expect(valid!.command.commandId).toBe('valid');
    await valid!.ack();
    const dead = await f.rawDeliveries(2, f.deadLetterQueue);
    expect(dead.map((message) => message.content.toString()).sort()).toEqual([
      '{malformed', JSON.stringify({ ...brokerCommand('wrong-type', 'wrong'), commandType: 'other.execute' }),
    ].sort());
    for (const message of dead) {
      expect(message.properties.headers?.['x-death']).toEqual(expect.arrayContaining([
        expect.objectContaining({ count: 1, reason: 'rejected', queue: f.queue }),
      ]));
      await f.channel.ack(message);
    }
    await f.expectFullySettled();
    await f.expectReadyCount(0, f.deadLetterQueue);
  });

  it('reasserts the reader route after a deleted queue closes the acquisition channel', async () => {
    const f = fixture!;
    await f.admin.deleteQueue(f.queue);
    await expect(f.reader.drain({ commandType: brokerCommandType, limit: 1 })).rejects.toThrow(/NOT_FOUND|404/);
    // The next worker tick must repair the reader declaration instead of failing forever.
    await expect(f.reader.drain({ commandType: brokerCommandType, limit: 1 })).resolves.toEqual([]);
    await f.publishRaw(Buffer.from(JSON.stringify(brokerCommand('restored', 'restored'))));
    const [delivery] = await f.deliveries(1);
    expect(delivery!.command.commandId).toBe('restored');
    await delivery!.ack();
    await f.expectFullySettled();
  });
});
