import { RabbitMqQueueCommandReader } from './rabbitmq-queue-command-reader';
import { queueCommandFixture, queueMessageFixture, queueReaderFixture } from './rabbitmq-queue-reader.spec-support';

const options = { queue: 'synthetic', deadLetterExchange: 'synthetic.dlx', queueType: 'quorum' as const, deliveryLimit: 7 };
const request = { commandType: 'synthetic.execute', limit: 5 };

describe('RabbitMQ command acquisition and recovery', () => {
  it('rejects poison and wrong types once, preserves valid metadata and bounds poison reads', async () => {
    const malformed = { ...queueMessageFixture(), content: Buffer.from('{') };
    const wrong = { ...queueMessageFixture(), content: Buffer.from(JSON.stringify({ ...queueCommandFixture(), commandType: 'other' })) };
    const valid = queueMessageFixture('valid');
    valid.properties.headers = { 'x-death': [{
      count: 2, reason: 'rejected', queue: 'synthetic',
      time: { '!': 'timestamp', value: 1_700_000_000 },
      exchange: 'synthetic', 'routing-keys': ['synthetic.execute'],
    }] };
    const f = queueReaderFixture([malformed, wrong, valid]);
    const reader = new RabbitMqQueueCommandReader(f.channel, options);
    expect(await reader.drain({ ...request, limit: 2 })).toEqual([]);
    expect(f.channel.get).toHaveBeenCalledTimes(2);
    expect(f.channel.nack.mock.calls).toEqual([[malformed, false, false], [wrong, false, false]]);
    const [delivery] = await reader.drain(request);
    expect(delivery!.diagnostics).toMatchObject({ deadLetterCount: 2, deadLetterReason: 'rejected',
      deadLetterQueue: 'synthetic', publishedAtEpochMs: 1_700_000_000_000 });
    await delivery!.ack();
    await expect(delivery!.nack({ requeue: true })).rejects.toThrow('not pending');
    expect(f.channel.assertQueue).toHaveBeenCalledWith('synthetic', { durable: true,
      arguments: { 'x-queue-type': 'quorum', 'x-delivery-limit': 7, 'x-dead-letter-exchange': 'synthetic.dlx' } });
  });

  it('releases valid acquisitions when a later read or poison rejection fails', async () => {
    for (const failPoison of [false, true]) {
      const valid = queueMessageFixture('valid');
      const poison = { ...queueMessageFixture(), content: Buffer.from('{') };
      const f = queueReaderFixture([valid, poison]);
      if (failPoison) f.channel.nack.mockRejectedValueOnce(new Error('synthetic poison rejection failed'));
      else {
        const get = f.channel.get.getMockImplementation()!;
        f.channel.get.mockImplementationOnce(get).mockRejectedValueOnce(new Error('synthetic later read failed'));
      }
      const reader = new RabbitMqQueueCommandReader(f.channel, options);
      await expect(reader.drain(request)).rejects.toThrow(failPoison ? 'poison rejection' : 'later read');
      expect(f.channel.nack).toHaveBeenCalledWith(valid, false, true);
      expect(f.pending.size).toBe(0);
      const recovered = await reader.drain(request);
      expect(recovered.map((delivery) => delivery.command.commandId)).toEqual(['valid']);
      expect(recovered[0]!.diagnostics.redelivered).toBe(true);
      await recovered[0]!.ack();
    }
  });

  it('retains failed cleanup and blocks new acquisition until exact-origin recovery succeeds', async () => {
    const f = queueReaderFixture([queueMessageFixture('first'), queueMessageFixture('second')]);
    const get = f.channel.get.getMockImplementation()!;
    const recover = f.channel.recoverDelivery.getMockImplementation()!;
    f.channel.get.mockImplementationOnce(get).mockImplementationOnce(get)
      .mockRejectedValueOnce(new Error('synthetic third read failed'));
    f.channel.nack.mockRejectedValue(new Error('synthetic release failed'));
    f.channel.recoverDelivery.mockRejectedValue(new Error('synthetic origin remains open'));
    const reader = new RabbitMqQueueCommandReader(f.channel, options);
    await expect(reader.drain(request)).rejects.toMatchObject({ message: 'synthetic third read failed',
      errors: expect.arrayContaining([expect.objectContaining({ message: 'synthetic third read failed' })]) });
    expect(f.channel.nack).toHaveBeenCalledTimes(2);
    expect(f.channel.recoverDelivery).toHaveBeenCalledTimes(2);
    await expect(reader.drain(request)).rejects.toThrow('cleanup remains unresolved');
    expect(f.channel.get).toHaveBeenCalledTimes(3);
    f.channel.recoverDelivery.mockImplementation(recover);
    const recovered = await reader.drain(request);
    expect(recovered.map((delivery) => delivery.command.commandId)).toEqual(['first', 'second']);
    expect(recovered.every((delivery) => delivery.diagnostics.redelivered)).toBe(true);
    await Promise.all(recovered.map((delivery) => delivery.ack()));
  });

  it('validates limits before transport calls and prevents concurrent settlement', async () => {
    const f = queueReaderFixture([queueMessageFixture()]);
    const reader = new RabbitMqQueueCommandReader(f.channel, options);
    await expect(reader.drain({ ...request, limit: 0 })).rejects.toThrow('positive integer');
    expect(f.channel.assertQueue).not.toHaveBeenCalled();
    const [delivery] = await reader.drain(request);
    let finish!: () => void;
    f.channel.ack.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const ack = delivery!.ack();
    await expect(delivery!.nack({ requeue: true })).rejects.toThrow('not pending');
    const release = delivery!.release!();
    finish();
    await Promise.all([ack, release]);
    expect(f.channel.nack).not.toHaveBeenCalled();
  });

  it('reasserts the configured route after failed acquisition without redeclaring on healthy drains', async () => {
    const f = queueReaderFixture([]);
    const reader = new RabbitMqQueueCommandReader(f.channel, options);
    await reader.drain(request);
    f.channel.get.mockRejectedValueOnce(new Error('NOT_FOUND - deleted queue'));
    await expect(reader.drain(request)).rejects.toThrow('NOT_FOUND');
    expect(f.channel.assertQueue).toHaveBeenCalledTimes(1);

    await expect(reader.drain(request)).resolves.toEqual([]);
    expect(f.channel.assertExchange).toHaveBeenCalledTimes(2);
    expect(f.channel.assertQueue).toHaveBeenCalledTimes(2);
    expect(f.channel.prefetch).toHaveBeenCalledTimes(2);
    await reader.drain(request);
    expect(f.channel.assertQueue).toHaveBeenCalledTimes(2);
  });
});
