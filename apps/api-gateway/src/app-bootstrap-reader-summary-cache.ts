import { DomainError, type Clock } from '@social-monitor/shared-kernel';
import type { ReaderSummaryBootstrapResponseDto } from './app-bootstrap.dto';

export const APP_BOOTSTRAP_READER_SUMMARY_CACHE_CLOCK = Symbol(
  'APP_BOOTSTRAP_READER_SUMMARY_CACHE_CLOCK',
);
export const APP_BOOTSTRAP_READER_SUMMARY_CACHE_TTL_MS = 30_000;
export const APP_BOOTSTRAP_READER_SUMMARY_CACHE_STALE_MS = 5 * 60_000;
export const APP_BOOTSTRAP_READER_SUMMARY_CACHE_MAX_ENTRIES = 128;
export const APP_BOOTSTRAP_READER_SUMMARY_CACHE_MAX_ACTIVE_LOADS = 8;
export const APP_BOOTSTRAP_READER_SUMMARY_CACHE_MAX_BACKGROUND_LOADS = 1;

const PUBLISHED_READER_SUMMARY_QUERY_IDENTITY =
  'published:workspace:daily:utc:latest-1:periods-40';

type BootstrapLoader = () => Promise<ReaderSummaryBootstrapResponseDto>;

export interface AppBootstrapCacheLoadLimits {
  readonly maxActiveLoads: number;
  readonly maxBackgroundLoads: number;
  readonly maxIdleMs: number;
}

interface CacheEntry {
  readonly freshUntilMs: number;
  readonly staleUntilMs: number;
  readonly value: ReaderSummaryBootstrapResponseDto;
  readonly loader: BootstrapLoader;
  lastAccessedAtMs: number;
}

interface PendingLoad {
  readonly promise: Promise<ReaderSummaryBootstrapResponseDto>;
  lastAccessedAtMs: number;
}

export class AppBootstrapReaderSummaryCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, PendingLoad>();
  private readonly limits: AppBootstrapCacheLoadLimits;
  private backgroundLoads = 0;
  private lastRefreshedKey: string | undefined;
  private stopped = false;

  public constructor(
    private readonly clock: Clock,
    private readonly ttlMs: number,
    private readonly staleMs: number,
    private readonly maxEntries: number,
    limits: Partial<AppBootstrapCacheLoadLimits> = {},
  ) {
    this.limits = {
      maxActiveLoads: APP_BOOTSTRAP_READER_SUMMARY_CACHE_MAX_ACTIVE_LOADS,
      maxBackgroundLoads: APP_BOOTSTRAP_READER_SUMMARY_CACHE_MAX_BACKGROUND_LOADS,
      maxIdleMs: ttlMs + staleMs,
      ...limits,
    };
    if (
      !Number.isSafeInteger(ttlMs) ||
      ttlMs <= 0 ||
      !Number.isSafeInteger(staleMs) ||
      staleMs <= 0 ||
      !Number.isSafeInteger(maxEntries) ||
      maxEntries <= 0 ||
      !Number.isSafeInteger(this.limits.maxActiveLoads) ||
      this.limits.maxActiveLoads < 2 ||
      !Number.isSafeInteger(this.limits.maxBackgroundLoads) ||
      this.limits.maxBackgroundLoads < 1 ||
      this.limits.maxBackgroundLoads >= this.limits.maxActiveLoads ||
      !Number.isSafeInteger(this.limits.maxIdleMs) ||
      this.limits.maxIdleMs <= 0
    ) {
      throw new Error('Invalid bootstrap summary cache limits');
    }
  }

  public async getOrLoad(
    tenantId: string,
    workspaceId: string,
    loader: BootstrapLoader,
  ): Promise<ReaderSummaryBootstrapResponseDto> {
    if (this.stopped) {
      throw this.stoppingError();
    }

    const key = JSON.stringify([
      tenantId,
      workspaceId,
      PUBLISHED_READER_SUMMARY_QUERY_IDENTITY,
    ]);
    const nowMs = this.clock.now().getTime();
    const cached = this.entries.get(key);
    const pending = this.inFlight.get(key);
    if (cached) {
      cached.lastAccessedAtMs = nowMs;
    }
    if (pending) {
      pending.lastAccessedAtMs = nowMs;
    }

    if (cached && cached.freshUntilMs > nowMs) {
      return cached.value;
    }
    if (cached && cached.staleUntilMs > nowMs) {
      this.refresh(key, cached, loader);
      return cached.value;
    }
    if (cached) {
      this.entries.delete(key);
    }
    if (pending) {
      return pending.promise;
    }
    if (this.inFlight.size >= this.limits.maxActiveLoads) {
      throw new DomainError(
        'operation.backpressure',
        'Bootstrap summary load capacity is busy; retry shortly',
      );
    }
    return this.load(key, loader, nowMs, false);
  }

  public refreshAll(): void {
    if (this.stopped) {
      return;
    }
    const nowMs = this.clock.now().getTime();
    for (const [key, entry] of this.entries) {
      if (
        entry.lastAccessedAtMs + this.limits.maxIdleMs <= nowMs ||
        entry.staleUntilMs <= nowMs
      ) {
        this.entries.delete(key);
      }
    }

    // The snapshot is bounded by maxEntries. No background work waits in a queue.
    const keys = [...this.entries.keys()];
    const start =
      this.lastRefreshedKey === undefined
        ? 0
        : keys.indexOf(this.lastRefreshedKey) + 1;
    for (let offset = 0; offset < keys.length; offset += 1) {
      const key = keys[(start + offset) % keys.length]!;
      const entry = this.entries.get(key)!;
      if (entry.freshUntilMs > nowMs || this.inFlight.has(key)) {
        continue;
      }
      if (!this.canRefresh()) {
        break;
      }
      this.lastRefreshedKey = key;
      this.refresh(key, entry);
    }
  }

  public onModuleDestroy(): void {
    this.stopped = true;
    this.entries.clear();
    this.lastRefreshedKey = undefined;
    // Running loaders retain their slots until they actually settle.
  }

  private canRefresh(): boolean {
    return (
      !this.stopped &&
      this.backgroundLoads < this.limits.maxBackgroundLoads &&
      this.inFlight.size < this.limits.maxActiveLoads - 1
    );
  }

  private refresh(
    key: string,
    entry: CacheEntry,
    loader: BootstrapLoader = entry.loader,
  ): void {
    if (this.inFlight.has(key) || !this.canRefresh()) {
      return;
    }
    void this.load(key, loader, entry.lastAccessedAtMs, true).catch(
      () => undefined,
    );
  }

  private load(
    key: string,
    loader: BootstrapLoader,
    lastAccessedAtMs: number,
    background: boolean,
  ): Promise<ReaderSummaryBootstrapResponseDto> {
    if (background) {
      this.backgroundLoads += 1;
    }
    const promise = Promise.resolve()
      .then(() => {
        if (this.stopped) {
          throw this.stoppingError();
        }
        return loader();
      })
      .then((value) => {
        if (
          !this.stopped &&
          pending.lastAccessedAtMs + this.limits.maxIdleMs >
            this.clock.now().getTime()
        ) {
          this.store(key, value, loader, pending.lastAccessedAtMs);
        }
        return value;
      })
      .finally(() => {
        if (this.inFlight.get(key) === pending) {
          this.inFlight.delete(key);
        }
        if (background) {
          this.backgroundLoads -= 1;
        }
      });
    const pending: PendingLoad = { promise, lastAccessedAtMs };
    this.inFlight.set(key, pending);
    return promise;
  }

  private store(
    key: string,
    value: ReaderSummaryBootstrapResponseDto,
    loader: BootstrapLoader,
    lastAccessedAtMs: number,
  ): void {
    const nowMs = this.clock.now().getTime();
    for (const [entryKey, entry] of this.entries) {
      if (
        entry.staleUntilMs <= nowMs ||
        entry.lastAccessedAtMs + this.limits.maxIdleMs <= nowMs
      ) {
        this.entries.delete(entryKey);
      }
    }

    // Replacing a scope keeps its position for fair refresh rotation and must
    // not evict another still usable scope.
    if (!this.entries.has(key)) {
      while (this.entries.size >= this.maxEntries) {
        const oldestKey = this.entries.keys().next().value;
        if (oldestKey === undefined) {
          break;
        }
        this.entries.delete(oldestKey);
      }
    }
    this.entries.set(key, {
      value,
      loader,
      freshUntilMs: nowMs + this.ttlMs,
      staleUntilMs: nowMs + this.ttlMs + this.staleMs,
      lastAccessedAtMs,
    });
  }

  private stoppingError(): DomainError {
    return new DomainError(
      'external.dependency_unavailable',
      'Bootstrap summary cache is stopping',
    );
  }
}
