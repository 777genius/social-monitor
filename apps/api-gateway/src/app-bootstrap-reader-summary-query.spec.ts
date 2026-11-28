import { FixedClock, ok, tenantId, workspaceId } from '@social-monitor/shared-kernel';
import type { ListReaderSummaryPeriodsUseCase } from '@social-monitor/summary/features/list-reader-summary-periods/list-reader-summary-periods.use-case';
import type { ListReaderSummariesUseCase } from '@social-monitor/summary/features/list-reader-summaries/list-reader-summaries.use-case';

import { AppBootstrapReaderSummaryCache } from './app-bootstrap-reader-summary-cache';
import { AppBootstrapReaderSummaryQuery } from './app-bootstrap-reader-summary-query';
import type { ReaderSummaryBootstrapResponseDto } from './app-bootstrap.dto';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, resolve, reject };
};

describe('AppBootstrapReaderSummaryQuery load ownership', () => {
  it.each(['latest', 'periods'] as const)(
    'retains its cache slot until the sibling read settles when %s throws',
    async (failedRead) => {
      type EmptyRead = ReturnType<typeof ok<{ items: never[] }>>;
      const latest = deferred<EmptyRead>();
      const periods = deferred<EmptyRead>();
      const cache = new AppBootstrapReaderSummaryCache(
        new FixedClock(new Date('2026-11-27T00:00:00.000Z')),
        100,
        1_000,
        10,
        { maxActiveLoads: 2, maxBackgroundLoads: 1 },
      );
      const query = new AppBootstrapReaderSummaryQuery(
        { execute: jest.fn(() => latest.promise) } as unknown as ListReaderSummariesUseCase,
        { execute: jest.fn(() => periods.promise) } as unknown as ListReaderSummaryPeriodsUseCase,
        cache,
      );
      const failure = new Error('temporary read failure');
      const read = query.execute({ tenantId: tenantId('tenant'), workspaceId: workspaceId('workspace') });
      const observed = read.catch((error: unknown) => error);
      const otherLoad = deferred<ReaderSummaryBootstrapResponseDto>();
      const occupied = cache.getOrLoad('tenant', 'other', () => otherLoad.promise);
      (failedRead === 'latest' ? latest : periods).reject(failure);
      await new Promise<void>((resolve) => setImmediate(resolve));

      const overflowLoader = jest.fn(async () => ({
        tenantId: 'tenant',
        workspaceId: 'overflow',
        latest: { items: [] },
        periods: { items: [] },
      }));
      await expect(cache.getOrLoad('tenant', 'overflow', overflowLoader))
        .rejects.toMatchObject({ code: 'operation.backpressure' });
      expect(overflowLoader).not.toHaveBeenCalled();

      (failedRead === 'latest' ? periods : latest).resolve(ok({ items: [] }));
      await expect(observed).resolves.toBe(failure);
      await expect(cache.getOrLoad('tenant', 'overflow', overflowLoader)).resolves.toMatchObject({
        workspaceId: 'overflow',
      });

      otherLoad.resolve({
        tenantId: 'tenant',
        workspaceId: 'other',
        latest: { items: [] },
        periods: { items: [] },
      });
      await occupied;
    },
  );
});
