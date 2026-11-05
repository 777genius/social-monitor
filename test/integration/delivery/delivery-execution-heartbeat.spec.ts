import { createDeliveryFixture, allowDelivery, deferredDelivery } from '../../support/delivery-workflow';
import { SendDeliveryAttemptUseCase } from '@social-monitor/delivery/features/send-delivery-attempt/send-delivery-attempt.use-case';

describe('Delivery execution heartbeat', () => {
  afterEach(() => { jest.useRealTimers(); });

  it('keeps a slow provider owned beyond its initial lease', async () => {
    jest.useFakeTimers();
    const f = await createDeliveryFixture();
    const entered = deferredDelivery<void>();
    const finish = deferredDelivery<{ accepted: true }>();
    const provider = { channel: 'webhook' as const, send: jest.fn(async () => { entered.resolve(); return finish.promise; }) };
    const sender = new SendDeliveryAttemptUseCase(f.store, [provider], allowDelivery, f.clock, f.ids,
      { leaseMs: 300, dispatchRecoveryMs: 300 });
    const command = { ...f.scope, content: { body: 'test' } };
    const first = sender.execute(command);
    await entered.promise;
    for (let i = 0; i < 4; i += 1) {
      f.clock.advance(100);
      await jest.advanceTimersByTimeAsync(100);
    }
    await expect(sender.execute(command)).resolves.toMatchObject({ ok: true, value: { attempt: { state: 'sending' } } });
    expect(provider.send).toHaveBeenCalledTimes(1);
    finish.resolve({ accepted: true });
    await expect(first).resolves.toMatchObject({ ok: true, value: { attempt: { state: 'delivered' } } });
    expect(jest.getTimerCount()).toBe(0);
  });

  it('aborts a provider after lost ownership and refuses its late accepted outcome', async () => {
    jest.useFakeTimers();
    const f = await createDeliveryFixture();
    const entered = deferredDelivery<void>();
    const finish = deferredDelivery<{ accepted: true }>();
    let signal: AbortSignal | undefined;
    const sender = new SendDeliveryAttemptUseCase(f.store, [{ channel: 'webhook', send: async (request) => {
      signal = request.signal; entered.resolve(); return finish.promise;
    } }], allowDelivery, f.clock, f.ids, { leaseMs: 300, dispatchRecoveryMs: 300 });
    jest.spyOn(f.store, 'renew').mockResolvedValueOnce(false);
    const first = sender.execute({ ...f.scope, content: { body: 'test' } });
    await entered.promise;
    f.clock.advance(100);
    await jest.advanceTimersByTimeAsync(100);
    expect(signal?.aborted).toBe(true);
    finish.resolve({ accepted: true });
    await expect(first).resolves.toMatchObject({ ok: false, error: { code: 'operation.conflict' } });
    expect((await f.repository.findById(f.scope))?.toSnapshot().state).toBe('sending');
    expect(jest.getTimerCount()).toBe(0);
  });
});
