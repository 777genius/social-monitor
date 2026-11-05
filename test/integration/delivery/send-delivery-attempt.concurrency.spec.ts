import { workspaceId } from '@social-monitor/shared-kernel';

import {
  allowDelivery, createDeliveryFixture, deferredDelivery,
} from '../../support/delivery-workflow';
import { SendDeliveryAttemptUseCase } from '@social-monitor/delivery/features/send-delivery-attempt/send-delivery-attempt.use-case';

describe('Delivery execution ownership', () => {
  it('lets one simultaneous sender call the provider and acknowledges completed replay', async () => {
    const f = await createDeliveryFixture();
    const entered = deferredDelivery<void>();
    const finish = deferredDelivery<{ accepted: true }>();
    const provider = { channel: 'webhook' as const, send: jest.fn(async () => {
      entered.resolve(); return finish.promise;
    }) };
    const sender = new SendDeliveryAttemptUseCase(f.store, [provider], allowDelivery, f.clock, f.ids);
    const command = { ...f.scope, content: { body: 'test' } };
    const first = sender.execute(command);
    await entered.promise;
    const duplicate = await sender.execute(command);
    expect(duplicate).toMatchObject({ ok: true, value: { attempt: { state: 'sending' } } });
    finish.resolve({ accepted: true });
    await expect(first).resolves.toMatchObject({ ok: true, value: { attempt: { state: 'delivered' } } });
    await expect(sender.execute(command)).resolves.toMatchObject({ ok: true, value: { attempt: { state: 'delivered' } } });
    expect(provider.send).toHaveBeenCalledTimes(1);
  });

  it('makes a thrown provider retryable with its original provider idempotency key', async () => {
    const f = await createDeliveryFixture();
    const provider = { channel: 'webhook' as const, send: jest.fn()
      .mockRejectedValueOnce(new Error('test disconnected'))
      .mockResolvedValueOnce({ accepted: true }) };
    const sender = new SendDeliveryAttemptUseCase(f.store, [provider], allowDelivery, f.clock, f.ids);
    const command = { ...f.scope, content: { body: 'test' } };
    await expect(sender.execute(command)).resolves.toMatchObject({ ok: true, value: { attempt: { state: 'failed_retryable', retryCount: 1 } } });
    expect(await f.repository.findQueued({ limit: 10 })).toHaveLength(1);
    await expect(sender.execute(command)).resolves.toMatchObject({ ok: true, value: { attempt: { state: 'delivered' } } });
    expect(provider.send.mock.calls.map(([request]) => request.attempt.idempotencyKey)).toEqual(['delivery:test:stable', 'delivery:test:stable']);
  });

  it('recovers a failed preference read before provider send and persists suppression on retry', async () => {
    const f = await createDeliveryFixture();
    const preferences = { getDeliveryPreference: jest.fn()
      .mockRejectedValueOnce(new Error('Test preferences unavailable'))
      .mockResolvedValueOnce({ allowed: false, reason: 'Recipient disabled delivery' }) };
    const provider = { channel: 'webhook' as const, send: jest.fn(async () => ({ accepted: true as const })) };
    const sender = new SendDeliveryAttemptUseCase(f.store, [provider], preferences, f.clock, f.ids);
    const command = { ...f.scope, content: { body: 'test' } };
    await expect(sender.execute(command)).resolves.toMatchObject({ ok: true, value: { attempt: { state: 'failed_retryable' } } });
    await expect(sender.execute(command)).resolves.toMatchObject({ ok: true, value: { attempt: { state: 'suppressed' } } });
    expect(await f.repository.findQueued({ limit: 10, recovery: { now: f.clock.now(), recoverBefore: f.clock.now() } })).toHaveLength(0);
    expect(provider.send).not.toHaveBeenCalled();
  });

  it('recovers expired sending while fencing its stale completion and another workspace', async () => {
    const f = await createDeliveryFixture();
    const now = f.clock.now();
    const firstToken = f.ids.generate();
    await f.store.claim({ ...f.scope, token: firstToken, now, expiresAt: new Date(now.getTime() + 100), recoverBefore: now });
    await f.store.startSending({ ...f.scope, token: firstToken, now });
    f.clock.advance(101);
    const secondToken = f.ids.generate();
    const claimed = await f.store.claim({ ...f.scope, token: secondToken, now: f.clock.now(),
      expiresAt: new Date(f.clock.now().getTime() + 100), recoverBefore: f.clock.now() });
    expect(claimed).toMatchObject({ claimed: true });
    expect(claimed?.attempt.toSnapshot()).toMatchObject({ state: 'assembling', retryCount: 1 });
    await expect(f.store.settle({ ...f.scope, token: firstToken, now: f.clock.now(), outcome: { kind: 'delivered' } })).resolves.toBeNull();
    await expect(f.store.startSending({ ...f.scope, workspaceId: workspaceId('00000000-0000-7000-8000-000000000099'), token: secondToken, now: f.clock.now() })).resolves.toBeNull();
    await f.store.startSending({ ...f.scope, token: secondToken, now: f.clock.now() });
    await expect(f.store.settle({ ...f.scope, token: secondToken, now: f.clock.now(), outcome: { kind: 'delivered' } })).resolves.toBeTruthy();
  });

  it('does not turn an uncertain outcome persistence error into provider failure', async () => {
    const f = await createDeliveryFixture();
    const settle = jest.spyOn(f.store, 'settle').mockRejectedValueOnce(new Error('Test commit acknowledgement lost'));
    const sender = new SendDeliveryAttemptUseCase(f.store, [{ channel: 'webhook', send: async () => ({ accepted: true }) }], allowDelivery, f.clock, f.ids);
    await expect(sender.execute({ ...f.scope, content: { body: 'test' } })).rejects.toThrow('commit acknowledgement lost');
    expect(settle).toHaveBeenCalledTimes(1);
    expect((await f.repository.findById(f.scope))?.toSnapshot().state).toBe('sending');
  });

  it('acknowledges a consumed failed command without spending another provider retry', async () => {
    const f = await createDeliveryFixture();
    const dispatchCommandId = f.ids.generate();
    await f.store.dispatch({ ...f.scope, commandId: dispatchCommandId, correlationId: 'test',
      now: f.clock.now(), recoverBefore: f.clock.now() });
    const provider = { channel: 'webhook' as const,
      send: jest.fn(async () => ({ accepted: false as const, retryable: true, reason: 'test 429' })) };
    const sender = new SendDeliveryAttemptUseCase(f.store, [provider], allowDelivery, f.clock, f.ids);
    const command = { ...f.scope, dispatchCommandId, content: { body: 'test' } };
    await expect(sender.execute(command)).resolves.toMatchObject({ ok: true, value: { attempt: { state: 'failed_retryable', retryCount: 1 } } });
    await expect(sender.execute(command)).resolves.toMatchObject({ ok: true, value: { attempt: { state: 'failed_retryable', retryCount: 1 } } });
    expect(provider.send).toHaveBeenCalledTimes(1);
    await sender.execute({ ...command, dispatchCommandId: undefined });
    expect(provider.send).toHaveBeenCalledTimes(2);
    await expect(sender.execute(command)).resolves.toMatchObject({ ok: true, value: { attempt: { state: 'failed_retryable', retryCount: 2 } } });
    expect(provider.send).toHaveBeenCalledTimes(2);
    const nextId = f.ids.generate();
    await f.store.dispatch({ ...f.scope, commandId: nextId, correlationId: 'test',
      now: f.clock.now(), recoverBefore: f.clock.now() });
    await sender.execute({ ...command, dispatchCommandId: nextId });
    expect(provider.send).toHaveBeenCalledTimes(3);
  });
});
