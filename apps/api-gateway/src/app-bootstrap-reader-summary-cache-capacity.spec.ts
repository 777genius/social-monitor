import { DomainError, type Clock } from '@social-monitor/shared-kernel';

import { AppBootstrapReaderSummaryCache } from './app-bootstrap-reader-summary-cache';
import type { ReaderSummaryBootstrapResponseDto } from './app-bootstrap.dto';

class MutableClock implements Clock {
  constructor(private milliseconds = 1_000) {}

  now(): Date {
    return new Date(this.milliseconds);
  }

  advance(milliseconds: number): void {
    this.milliseconds += milliseconds;
  }
}

const payload = (workspaceId: string): ReaderSummaryBootstrapResponseDto => ({
  tenantId: 'tenant-1',
  workspaceId,
  latest: { items: [] },
  periods: { items: [] },
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, resolve, reject };
};

const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

const createCache = (clock = new MutableClock(), maxEntries = 10) =>
  new AppBootstrapReaderSummaryCache(clock, 100, 1_000, maxEntries, {
    maxActiveLoads: 2,
    maxBackgroundLoads: 1,
  });

describe('AppBootstrapReaderSummaryCache capacity and lifecycle', () => {
  it('bounds distinct misses before invoking loaders and admits work after completion', async () => {
    const cache = createCache();
    const pending = deferred<ReaderSummaryBootstrapResponseDto>();
    const loader = jest.fn(() => pending.promise);
    const requests = Array.from({ length: 1_000 }, (_, index) =>
      cache.getOrLoad('tenant-1', `workspace-${index}`, loader),
    );
    // Attach handlers immediately; the overflow is expected to reject promptly.
    const all = Promise.allSettled(requests);
    await settle();
    expect(loader).toHaveBeenCalledTimes(2);

    pending.resolve(payload('completed'));
    const results = await all;
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(2);
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(rejected).toHaveLength(998);
    for (const result of rejected) {
      expect(result.reason).toBeInstanceOf(DomainError);
      expect(result.reason).toMatchObject({ code: 'operation.backpressure' });
    }

    const recovered = jest.fn(async () => payload('recovered'));
    await expect(cache.getOrLoad('tenant-1', 'recovered', recovered))
      .resolves.toEqual(payload('recovered'));
    expect(recovered).toHaveBeenCalledTimes(1);
  });

  it('coalesces a scope even when all active slots are occupied', async () => {
    const cache = createCache();
    const blocked = deferred<ReaderSummaryBootstrapResponseDto>();
    const loader = jest.fn(() => blocked.promise);
    const first = cache.getOrLoad('tenant-1', 'one', loader);
    const second = cache.getOrLoad('tenant-1', 'two', loader);
    const duplicate = cache.getOrLoad('tenant-1', 'one', loader);
    await settle();

    expect(loader).toHaveBeenCalledTimes(2);
    blocked.resolve(payload('ready'));
    await expect(Promise.all([first, second, duplicate])).resolves.toHaveLength(3);
  });

  it('keeps fresh and stale values available while cold reads occupy all slots', async () => {
    const clock = new MutableClock();
    const cache = createCache(clock);
    await cache.getOrLoad('tenant-1', 'stale', async () => payload('stale'));
    clock.advance(100);
    await cache.getOrLoad('tenant-1', 'fresh', async () => payload('fresh'));

    const blocked = deferred<ReaderSummaryBootstrapResponseDto>();
    const one = cache.getOrLoad('tenant-1', 'one', () => blocked.promise);
    const two = cache.getOrLoad('tenant-1', 'two', () => blocked.promise);
    const unused = jest.fn(async () => payload('unexpected'));
    await expect(cache.getOrLoad('tenant-1', 'fresh', unused)).resolves.toEqual(payload('fresh'));
    await expect(cache.getOrLoad('tenant-1', 'stale', unused)).resolves.toEqual(payload('stale'));
    expect(unused).not.toHaveBeenCalled();

    blocked.resolve(payload('finished'));
    await Promise.all([one, two]);
  });

  it('reserves foreground capacity while background work is blocked', async () => {
    const clock = new MutableClock();
    const cache = createCache(clock);
    const background = deferred<ReaderSummaryBootstrapResponseDto>();
    const firstLoader = jest.fn()
      .mockResolvedValueOnce(payload('one'))
      .mockReturnValue(background.promise);
    const secondLoader = jest.fn(async () => payload('two'));
    await cache.getOrLoad('tenant-1', 'one', firstLoader);
    await cache.getOrLoad('tenant-1', 'two', secondLoader);
    clock.advance(100);

    cache.refreshAll();
    await settle();
    expect(firstLoader).toHaveBeenCalledTimes(2);
    const foreground = deferred<ReaderSummaryBootstrapResponseDto>();
    const cold = cache.getOrLoad('tenant-1', 'cold', () => foreground.promise);
    await expect(cache.getOrLoad('tenant-1', 'two', secondLoader)).resolves.toEqual(payload('two'));
    await expect(cache.getOrLoad('tenant-1', 'overflow', secondLoader))
      .rejects.toMatchObject({ code: 'operation.backpressure' });
    expect(secondLoader).toHaveBeenCalledTimes(1);

    background.resolve(payload('one-refreshed'));
    foreground.resolve(payload('cold'));
    await cold;
    await settle();
    await expect(cache.getOrLoad('tenant-1', 'overflow', secondLoader)).resolves.toEqual(payload('two'));
  });

  it('does not evict a different stale scope when refreshing an existing entry', async () => {
    const clock = new MutableClock();
    const cache = createCache(clock, 2);
    await cache.getOrLoad('tenant-1', 'one', async () => payload('one'));
    await cache.getOrLoad('tenant-1', 'two', async () => payload('two'));
    clock.advance(100);

    await cache.getOrLoad('tenant-1', 'two', async () => payload('two-refreshed'));
    await settle();
    const blocked = deferred<ReaderSummaryBootstrapResponseDto>();
    await expect(cache.getOrLoad('tenant-1', 'one', () => blocked.promise)).resolves.toEqual(payload('one'));
    blocked.resolve(payload('one-refreshed'));
    await settle();
  });

  it('rotates background candidates so one failing scope does not starve the others', async () => {
    const clock = new MutableClock();
    const cache = createCache(clock);
    const order: string[] = [];
    const one = jest.fn()
      .mockResolvedValueOnce(payload('one'))
      .mockImplementation(async () => {
        order.push('one');
        throw new Error('temporarily unavailable');
      });
    const two = jest.fn()
      .mockResolvedValueOnce(payload('two'))
      .mockImplementation(async () => {
        order.push('two');
        return payload('two');
      });
    const three = jest.fn()
      .mockResolvedValueOnce(payload('three'))
      .mockImplementation(async () => {
        order.push('three');
        return payload('three');
      });
    await cache.getOrLoad('tenant-1', 'one', one);
    await cache.getOrLoad('tenant-1', 'two', two);
    await cache.getOrLoad('tenant-1', 'three', three);
    clock.advance(100);

    for (let tick = 0; tick < 3; tick += 1) {
      cache.refreshAll();
      await settle();
    }
    expect(order).toEqual(['one', 'two', 'three']);
    await expect(cache.getOrLoad('tenant-1', 'one', one)).resolves.toEqual(payload('one'));
    await settle();
  });

  it('expires idle scopes even when background refresh keeps their data fresh', async () => {
    const clock = new MutableClock();
    const cache = new AppBootstrapReaderSummaryCache(clock, 100, 1_000, 10, {
      maxActiveLoads: 2,
      maxBackgroundLoads: 1,
      maxIdleMs: 250,
    });
    const loader = jest.fn(async () => payload('one'));
    await cache.getOrLoad('tenant-1', 'one', loader);
    clock.advance(100);
    cache.refreshAll();
    await settle();
    clock.advance(100);
    cache.refreshAll();
    await settle();
    expect(loader).toHaveBeenCalledTimes(3);

    clock.advance(50);
    cache.refreshAll();
    await settle();
    expect(loader).toHaveBeenCalledTimes(3);
    await cache.getOrLoad('tenant-1', 'one', loader);
    expect(loader).toHaveBeenCalledTimes(4);
  });

  it('uses actual foreground access to extend an idle deadline during refresh', async () => {
    const clock = new MutableClock();
    const cache = new AppBootstrapReaderSummaryCache(clock, 100, 1_000, 10, {
      maxIdleMs: 250,
    });
    const refresh = deferred<ReaderSummaryBootstrapResponseDto>();
    const loader = jest.fn()
      .mockResolvedValueOnce(payload('one'))
      .mockReturnValue(refresh.promise);
    await cache.getOrLoad('tenant-1', 'one', loader);
    clock.advance(100);
    cache.refreshAll();
    await settle();
    clock.advance(100);
    await expect(cache.getOrLoad('tenant-1', 'one', loader)).resolves.toEqual(payload('one'));
    clock.advance(100);
    refresh.resolve(payload('refreshed'));
    await settle();

    cache.refreshAll();
    await expect(cache.getOrLoad('tenant-1', 'one', loader)).resolves.toEqual(payload('refreshed'));
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('does not restart an active loader after the stale window expires', async () => {
    const clock = new MutableClock();
    const cache = createCache(clock);
    const refresh = deferred<ReaderSummaryBootstrapResponseDto>();
    const loader = jest.fn()
      .mockResolvedValueOnce(payload('one'))
      .mockReturnValue(refresh.promise);
    await cache.getOrLoad('tenant-1', 'one', loader);
    clock.advance(100);
    await cache.getOrLoad('tenant-1', 'one', loader);
    clock.advance(1_000);
    const waiting = cache.getOrLoad('tenant-1', 'one', loader);
    await settle();
    expect(loader).toHaveBeenCalledTimes(2);

    refresh.resolve(payload('refreshed'));
    await expect(waiting).resolves.toEqual(payload('refreshed'));
  });

  it('releases a rejected foreground load and permits a later retry', async () => {
    const cache = createCache();
    const failed = deferred<ReaderSummaryBootstrapResponseDto>();
    const failing = cache.getOrLoad('tenant-1', 'one', () => failed.promise);
    const rejection = expect(failing).rejects.toThrow('read failed');
    failed.reject(new Error('read failed'));
    await rejection;

    await expect(cache.getOrLoad('tenant-1', 'one', async () => payload('recovered')))
      .resolves.toEqual(payload('recovered'));
  });

  it('stops queued loads before they start and rejects new admissions on shutdown', async () => {
    const cache = createCache();
    const loader = jest.fn(async () => payload('one'));
    const queued = cache.getOrLoad('tenant-1', 'one', loader);
    cache.onModuleDestroy();

    await expect(queued).rejects.toMatchObject({ code: 'external.dependency_unavailable' });
    await expect(cache.getOrLoad('tenant-1', 'one', loader))
      .rejects.toMatchObject({ code: 'external.dependency_unavailable' });
    cache.refreshAll();
    expect(loader).not.toHaveBeenCalled();
  });

  it('does not repopulate or schedule background work when a running load finishes after shutdown', async () => {
    const cache = createCache();
    const pending = deferred<ReaderSummaryBootstrapResponseDto>();
    const loader = jest.fn(() => pending.promise);
    const loading = cache.getOrLoad('tenant-1', 'one', loader);
    await settle();
    cache.onModuleDestroy();
    pending.resolve(payload('late'));

    await expect(loading).resolves.toEqual(payload('late'));
    cache.refreshAll();
    await expect(cache.getOrLoad('tenant-1', 'one', loader))
      .rejects.toMatchObject({ code: 'external.dependency_unavailable' });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it.each([
    { maxActiveLoads: 1 },
    { maxActiveLoads: 2, maxBackgroundLoads: 2 },
    { maxActiveLoads: 2, maxBackgroundLoads: 0 },
    { maxIdleMs: 0 },
  ])('rejects limits without a valid foreground reserve: %o', (limits) => {
    expect(() => new AppBootstrapReaderSummaryCache(new MutableClock(), 100, 1_000, 10, limits))
      .toThrow('Invalid bootstrap summary cache limits');
  });
});
