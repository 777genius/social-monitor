import {
  APP_BOOTSTRAP_PUBLIC_PRIME_INITIAL_DELAY_MS,
  APP_BOOTSTRAP_PUBLIC_PRIME_RETRY_DELAY_MS,
  AppBootstrapPublicPrimer,
  type AppBootstrapPublicPrimeClient,
  type AppBootstrapPublicPrimeScheduler,
} from './app-bootstrap-public-primer';

describe('AppBootstrapPublicPrimer', () => {
  it('does not schedule public traffic outside production', () => {
    const client = { request: jest.fn() };
    const scheduler = { schedule: jest.fn(), cancel: jest.fn() };
    const primer = new AppBootstrapPublicPrimer(
      false,
      client,
      scheduler,
    );

    primer.onApplicationBootstrap();

    expect(scheduler.schedule).not.toHaveBeenCalled();
  });

  it('primes after startup and retries a transient public failure', async () => {
    const callbacks: Array<() => void> = [];
    const handles: symbol[] = [];
    const scheduler: AppBootstrapPublicPrimeScheduler = {
      schedule: jest.fn((delayMs, callback) => {
        expect(delayMs).toBe(
          callbacks.length === 0
            ? APP_BOOTSTRAP_PUBLIC_PRIME_INITIAL_DELAY_MS
            : APP_BOOTSTRAP_PUBLIC_PRIME_RETRY_DELAY_MS,
        );
        const handle = Symbol('timer');
        callbacks.push(callback);
        handles.push(handle);
        return handle;
      }),
      cancel: jest.fn(),
    };
    const client: AppBootstrapPublicPrimeClient = {
      request: jest
        .fn()
        .mockRejectedValueOnce(new Error('proxy not ready'))
        .mockResolvedValueOnce(undefined),
    };
    const primer = new AppBootstrapPublicPrimer(true, client, scheduler);

    primer.onApplicationBootstrap();
    callbacks[0]?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(scheduler.schedule).toHaveBeenCalledTimes(2);

    callbacks[1]?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(client.request).toHaveBeenCalledTimes(2);
    expect(scheduler.schedule).toHaveBeenCalledTimes(2);

    primer.onModuleDestroy();
    expect(scheduler.cancel).not.toHaveBeenCalled();
  });

  it('cancels a pending startup prime during shutdown', () => {
    const handle = Symbol('timer');
    const scheduler: AppBootstrapPublicPrimeScheduler = {
      schedule: jest.fn(() => handle),
      cancel: jest.fn(),
    };
    const client = { request: jest.fn() };
    const primer = new AppBootstrapPublicPrimer(true, client, scheduler);

    primer.onApplicationBootstrap();
    primer.onModuleDestroy();

    expect(scheduler.cancel).toHaveBeenCalledWith(handle);
    expect(client.request).not.toHaveBeenCalled();
  });
});
