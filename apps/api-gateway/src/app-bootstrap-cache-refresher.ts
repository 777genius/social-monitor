import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';

import { AppBootstrapReaderSummaryCache } from './app-bootstrap-reader-summary-cache';

export const APP_BOOTSTRAP_REFRESH_SCHEDULER = Symbol(
  'APP_BOOTSTRAP_REFRESH_SCHEDULER',
);
export const APP_BOOTSTRAP_REFRESH_INTERVAL_MS = 60_000;

export interface AppBootstrapRefreshScheduler {
  schedule(intervalMs: number, callback: () => void): unknown;
  cancel(handle: unknown): void;
}

export const nodeAppBootstrapRefreshScheduler: AppBootstrapRefreshScheduler = {
  schedule(intervalMs, callback) {
    const handle = setInterval(callback, intervalMs);
    handle.unref();
    return handle;
  },
  cancel(handle) {
    clearInterval(handle as NodeJS.Timeout);
  },
};

@Injectable()
export class AppBootstrapCacheRefresher
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private timer: unknown;

  constructor(
    private readonly cache: AppBootstrapReaderSummaryCache,
    @Inject(APP_BOOTSTRAP_REFRESH_SCHEDULER)
    private readonly scheduler: AppBootstrapRefreshScheduler,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = this.scheduler.schedule(
      APP_BOOTSTRAP_REFRESH_INTERVAL_MS,
      () => this.cache.refreshAll(),
    );
  }

  onModuleDestroy(): void {
    if (this.timer !== undefined) {
      this.scheduler.cancel(this.timer);
      this.timer = undefined;
    }
  }
}
