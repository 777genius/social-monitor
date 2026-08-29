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
    const cache = new AppBootstrapReaderSummaryCache(clock, 100, 10);
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
    expect(loader).toHaveBeenCalledTimes(3);
  });

  it('collapses concurrent misses for the same fixed query identity', async () => {
    const cache = new AppBootstrapReaderSummaryCache(
      new MutableClock(1_000),
      100,
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

  it('evicts entries at the configured maximum', async () => {
    const cache = new AppBootstrapReaderSummaryCache(
      new MutableClock(1_000),
      100,
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
