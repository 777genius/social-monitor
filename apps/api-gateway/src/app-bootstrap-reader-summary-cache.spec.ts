import type { Clock } from '@social-monitor/shared-kernel';

import type { ReaderSummaryBootstrapResponseDto } from './app-bootstrap.dto';
import { AppBootstrapReaderSummaryCache } from './app-bootstrap-reader-summary-cache';

class MutableClock implements Clock {
  constructor(private nowMs: number) {}

  now(): Date {
    return new Date(this.nowMs);
  }

  advance(milliseconds: number): void {
    this.nowMs += milliseconds;
  }
}

const payload = (
  tenantId: string,
  workspaceId: string,
): ReaderSummaryBootstrapResponseDto => ({
  tenantId,
  workspaceId,
  latest: { items: [] },
  periods: { items: [] },
});

describe('AppBootstrapReaderSummaryCache', () => {
  it('uses tenant and workspace scope and expires with its injected clock', async () => {
    const clock = new MutableClock(1_000);
    const cache = new AppBootstrapReaderSummaryCache(clock, 100, 1_000, 10);
    const loader = jest.fn(async (tenantId: string, workspaceId: string) =>
      payload(tenantId, workspaceId),
    );

    await cache.getOrLoad('tenant-1', 'workspace-1', () =>
      loader('tenant-1', 'workspace-1'),
    );
    await cache.getOrLoad('tenant-1', 'workspace-1', () =>
      loader('tenant-1', 'workspace-1'),
    );
    await cache.getOrLoad('tenant-2', 'workspace-1', () =>
      loader('tenant-2', 'workspace-1'),
    );
    expect(loader).toHaveBeenCalledTimes(2);

    clock.advance(100);
    await cache.getOrLoad('tenant-1', 'workspace-1', () =>
      loader('tenant-1', 'workspace-1'),
    );
    await Promise.resolve();
    expect(loader).toHaveBeenCalledTimes(3);
  });

  it('serves bounded stale data while a single refresh runs', async () => {
    const clock = new MutableClock(1_000);
    const cache = new AppBootstrapReaderSummaryCache(clock, 100, 1_000, 10);
    const initial = payload('tenant-1', 'workspace-1');
    const refreshed = payload('tenant-1', 'workspace-refreshed');
    await cache.getOrLoad('tenant-1', 'workspace-1', async () => initial);
    clock.advance(100);

    let resolve!: (value: ReaderSummaryBootstrapResponseDto) => void;
    const refresh = new Promise<ReaderSummaryBootstrapResponseDto>(
      (complete) => {
        resolve = complete;
      },
    );
    const loader = jest.fn(() => refresh);

    await expect(
      cache.getOrLoad('tenant-1', 'workspace-1', loader),
    ).resolves.toEqual(initial);
    await expect(
      cache.getOrLoad('tenant-1', 'workspace-1', loader),
    ).resolves.toEqual(initial);
    expect(loader).toHaveBeenCalledTimes(1);

    resolve(refreshed);
    await refresh;
    await Promise.resolve();
    await expect(
      cache.getOrLoad('tenant-1', 'workspace-1', loader),
    ).resolves.toEqual(refreshed);
  });

  it('blocks for a new value after the stale bound expires', async () => {
    const clock = new MutableClock(1_000);
    const cache = new AppBootstrapReaderSummaryCache(clock, 100, 1_000, 10);
    await cache.getOrLoad('tenant-1', 'workspace-1', async () =>
      payload('tenant-1', 'workspace-1'),
    );
    clock.advance(1_100);

    const refreshed = payload('tenant-1', 'workspace-refreshed');
    await expect(
      cache.getOrLoad('tenant-1', 'workspace-1', async () => refreshed),
    ).resolves.toEqual(refreshed);
  });

  it('collapses concurrent misses for the same fixed query identity', async () => {
    const cache = new AppBootstrapReaderSummaryCache(
      new MutableClock(1_000),
      100,
      1_000,
      10,
    );
    let resolve!: (value: ReaderSummaryBootstrapResponseDto) => void;
    const deferred = new Promise<ReaderSummaryBootstrapResponseDto>(
      (complete) => {
        resolve = complete;
      },
    );
    const loader = jest.fn(() => deferred);

    const first = cache.getOrLoad('tenant-1', 'workspace-1', loader);
    const second = cache.getOrLoad('tenant-1', 'workspace-1', loader);
    resolve(payload('tenant-1', 'workspace-1'));

    await expect(Promise.all([first, second])).resolves.toEqual([
      payload('tenant-1', 'workspace-1'),
      payload('tenant-1', 'workspace-1'),
    ]);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('does not cache failures', async () => {
    const cache = new AppBootstrapReaderSummaryCache(
      new MutableClock(1_000),
      100,
      1_000,
      10,
    );
    const loader = jest.fn().mockRejectedValue(new Error('read failed'));

    await expect(
      cache.getOrLoad('tenant-1', 'workspace-1', loader),
    ).rejects.toThrow('read failed');
    await expect(
      cache.getOrLoad('tenant-1', 'workspace-1', loader),
    ).rejects.toThrow('read failed');
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('refreshes every known scope without blocking callers', async () => {
    const cache = new AppBootstrapReaderSummaryCache(
      new MutableClock(1_000),
      100,
      1_000,
      10,
    );
    const loader = jest.fn(async (workspaceId: string) =>
      payload('tenant-1', workspaceId),
    );
    await cache.getOrLoad('tenant-1', 'workspace-1', () =>
      loader('workspace-1'),
    );
    await cache.getOrLoad('tenant-1', 'workspace-2', () =>
      loader('workspace-2'),
    );

    cache.refreshAll();
    await Promise.resolve();
    await Promise.resolve();

    expect(loader).toHaveBeenCalledTimes(4);
  });

  it('evicts entries at the configured maximum', async () => {
    const cache = new AppBootstrapReaderSummaryCache(
      new MutableClock(1_000),
      100,
      1_000,
      1,
    );
    const loader = jest.fn(async (workspaceId: string) =>
      payload('tenant-1', workspaceId),
    );

    await cache.getOrLoad('tenant-1', 'workspace-1', () =>
      loader('workspace-1'),
    );
    await cache.getOrLoad('tenant-1', 'workspace-2', () =>
      loader('workspace-2'),
    );
    await cache.getOrLoad('tenant-1', 'workspace-1', () =>
      loader('workspace-1'),
    );

    expect(loader).toHaveBeenCalledTimes(3);
  });
});
