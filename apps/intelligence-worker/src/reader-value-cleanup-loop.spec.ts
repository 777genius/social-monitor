import { CleanupReaderValueCacheUseCase } from '@social-monitor/relevance/application/use-cases/cleanup-reader-value-cache.use-case';
import { ReaderValueCleanupLoop } from './reader-value-cleanup-loop';
import { resolveReaderValueCleanupOptions } from './reader-value-provider-tokens';

describe('reader-value cleanup timer', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('runs at startup and every minute without a scorer, and stops cleanly', async () => {
    const next = jest.fn().mockResolvedValue(null);
    const options = resolveReaderValueCleanupOptions({});
    const useCase = new CleanupReaderValueCacheUseCase({ next }, { cleanup: jest.fn() }, options.policy);
    const loop = new ReaderValueCleanupLoop(useCase, options);
    await loop.onModuleInit();
    expect(next).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(60_000);
    expect(next).toHaveBeenCalledTimes(2);
    await loop.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(120_000);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('does not allocate a database timer for an in-memory runtime', async () => {
    const loop = new ReaderValueCleanupLoop(null, resolveReaderValueCleanupOptions({}));
    await loop.onModuleInit();
    expect(jest.getTimerCount()).toBe(0);
    await loop.onModuleDestroy();
  });
});
