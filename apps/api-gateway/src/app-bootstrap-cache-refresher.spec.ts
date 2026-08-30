import {
  APP_BOOTSTRAP_REFRESH_INTERVAL_MS,
  AppBootstrapCacheRefresher,
  type AppBootstrapRefreshScheduler,
} from './app-bootstrap-cache-refresher';
import type { AppBootstrapReaderSummaryCache } from './app-bootstrap-reader-summary-cache';

describe('AppBootstrapCacheRefresher', () => {
  it('refreshes known entries on schedule and cancels on shutdown', () => {
    let scheduledCallback: (() => void) | undefined;
    const handle = Symbol('timer');
    const scheduler: AppBootstrapRefreshScheduler = {
      schedule: jest.fn((intervalMs, callback) => {
        expect(intervalMs).toBe(APP_BOOTSTRAP_REFRESH_INTERVAL_MS);
        scheduledCallback = callback;
        return handle;
      }),
      cancel: jest.fn(),
    };
    const cache = { refreshAll: jest.fn() };
    const refresher = new AppBootstrapCacheRefresher(
      cache as unknown as AppBootstrapReaderSummaryCache,
      scheduler,
    );

    refresher.onApplicationBootstrap();
    expect(cache.refreshAll).not.toHaveBeenCalled();
    scheduledCallback?.();
    expect(cache.refreshAll).toHaveBeenCalledTimes(1);

    refresher.onModuleDestroy();
    expect(scheduler.cancel).toHaveBeenCalledWith(handle);
  });
});
