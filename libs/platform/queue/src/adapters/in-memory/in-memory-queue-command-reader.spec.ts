import { InMemoryQueueCommandReader } from './in-memory-queue-command-reader';
import { InMemoryQueuePublisher } from './in-memory-queue-publisher';

const command = { commandId: 'synthetic-repeatable-id', commandType: 'synthetic.execute', schemaVersion: 1,
  correlationId: 'synthetic-correlation', payload: { value: 'fixture' } };
const request = { commandType: command.commandType, limit: 1 };

describe('in-memory command delivery ownership', () => {
  it('requeues the acquired occurrence with redelivery diagnostics, then removes acknowledged work', async () => {
    const publisher = new InMemoryQueuePublisher();
    const reader = new InMemoryQueueCommandReader(publisher);
    await publisher.publish(command);
    const [first] = await reader.drain(request);
    expect(await reader.drain(request)).toEqual([]);
    expect(first!.diagnostics.redelivered).toBe(false);
    await first!.nack({ requeue: true });
    const [replay] = await reader.drain(request);
    expect(replay!.command).toEqual(command);
    expect(replay!.diagnostics.redelivered).toBe(true);
    await replay!.ack();
    expect(await reader.drain(request)).toEqual([]);
    await expect(first!.ack()).rejects.toThrow('already settled');
    await expect(replay!.nack({ requeue: true })).rejects.toThrow('already settled');
  });

  it('keeps repeated ids as distinct occurrences across competing readers and concurrent settlement', async () => {
    const publisher = new InMemoryQueuePublisher();
    await publisher.publish(command);
    await publisher.publish(command);
    const left = new InMemoryQueueCommandReader(publisher);
    const right = new InMemoryQueueCommandReader(publisher);
    const [[first], [second]] = await Promise.all([left.drain(request), right.drain(request)]);
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    const results = await Promise.allSettled([first!.nack({ requeue: true }), first!.nack({ requeue: true })]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    await second!.nack({ requeue: false });
    expect(await right.drain({ ...request, limit: 10 })).toHaveLength(1);
    expect(await left.drain(request)).toEqual([]);
  });

  it('releases unprocessed work idempotently without changing legacy destructive drain', async () => {
    const publisher = new InMemoryQueuePublisher();
    await publisher.publish(command);
    const [delivery] = await new InMemoryQueueCommandReader(publisher).drain(request);
    await Promise.all([delivery!.release!(), delivery!.release!()]);
    expect(publisher.drain(request)).toEqual([command]);
    expect(publisher.drain(request)).toEqual([]);
  });
});
