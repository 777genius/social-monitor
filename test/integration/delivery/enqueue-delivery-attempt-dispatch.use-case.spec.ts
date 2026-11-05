import { CommandOutboxDispatcher } from '@social-monitor/platform-queue';

import { createDeliveryFixture } from '../../support/delivery-workflow';
import { SendDeliveryAttemptUseCase } from '@social-monitor/delivery/features/send-delivery-attempt/send-delivery-attempt.use-case';
import { EnqueueDeliveryAttemptDispatchUseCase } from '@social-monitor/delivery/features/enqueue-delivery-attempt-dispatch/enqueue-delivery-attempt-dispatch.use-case';

describe('EnqueueDeliveryAttemptDispatchUseCase', () => {
  it('commits dispatch intent before an immediate consumer and preserves its final state', async () => {
    const f = await createDeliveryFixture();
    const enqueue = new EnqueueDeliveryAttemptDispatchUseCase(f.store, f.ids, f.clock);
    const provider = { channel: 'webhook' as const, send: jest.fn(async () => ({ accepted: true as const })) };
    const sender = new SendDeliveryAttemptUseCase(f.store, [provider], {
      getDeliveryPreference: async () => ({ allowed: true as const }),
    }, f.clock, f.ids);
    const result = await enqueue.execute({ ...f.scope, correlationId: 'correlation-test' });
    expect(result).toMatchObject({ ok: true, value: { enqueued: true, state: 'assembling' } });
    expect(provider.send).not.toHaveBeenCalled();
    const relay = new CommandOutboxDispatcher(f.store, {
      publish: async (command) => {
        const sent = await sender.execute({ ...f.scope, dispatchCommandId: command.commandId, content: { body: 'test' } });
        expect(sent).toMatchObject({ ok: true, value: { attempt: { state: 'delivered' } } });
      },
    }, f.ids, f.clock);
    await expect(relay.dispatchBatch(10)).resolves.toEqual({ published: 1, retrying: 0, failed: 0 });
    expect((await f.repository.findById(f.scope))?.toSnapshot().state).toBe('delivered');
    expect(provider.send).toHaveBeenCalledTimes(1);
    await expect(relay.dispatchBatch(10)).resolves.toEqual({ published: 0, retrying: 0, failed: 0 });
  });

  it('commits a single intent under simultaneous dispatch and retries publication with the same identity', async () => {
    const f = await createDeliveryFixture();
    const enqueue = new EnqueueDeliveryAttemptDispatchUseCase(f.store, f.ids, f.clock);
    const results = await Promise.all([
      enqueue.execute({ ...f.scope, correlationId: 'a' }),
      enqueue.execute({ ...f.scope, correlationId: 'b' }),
    ]);
    expect(results.filter((result) => result.ok && result.value.enqueued)).toHaveLength(1);
    const ids: string[] = [];
    let fail = true;
    const relay = new CommandOutboxDispatcher(f.store, {
      publish: async (command) => {
        ids.push(command.commandId);
        if (fail) { fail = false; throw new Error('Test broker unavailable'); }
      },
    }, f.ids, f.clock);
    await expect(relay.dispatchBatch(10)).resolves.toMatchObject({ retrying: 1 });
    f.clock.advance(1_001);
    await expect(relay.dispatchBatch(10)).resolves.toMatchObject({ published: 1 });
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
  });

  it('recovers an abandoned assembling intent with a bounded retry budget', async () => {
    const f = await createDeliveryFixture(0);
    const enqueue = new EnqueueDeliveryAttemptDispatchUseCase(f.store, f.ids, f.clock);
    await enqueue.execute({ ...f.scope, correlationId: 'a' });
    f.clock.advance(300_001);
    expect(await f.repository.findQueued({ limit: 10 })).toHaveLength(0);
    expect(await f.repository.findQueued({ limit: 10, recovery: {
      now: f.clock.now(), recoverBefore: new Date(f.clock.now().getTime() - 300_000),
    } })).toHaveLength(1);
    const result = await enqueue.execute({ ...f.scope, correlationId: 'b' });
    expect(result).toMatchObject({ ok: true, value: { enqueued: false, state: 'dead_lettered' } });
    expect((await f.repository.findById(f.scope))?.toSnapshot().retryCount).toBe(1);
  });
});
