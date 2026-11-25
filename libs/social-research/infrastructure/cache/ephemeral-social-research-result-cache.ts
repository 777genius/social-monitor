import type { Clock } from '@social-monitor/shared-kernel';

import type {
  SocialResearchResultCachePort,
} from '../../application/contracts/social-research-execution-policy';
import type {
  SocialSearchRun,
  SocialThread,
} from '../../application/contracts/social-research-gateway';

export type EphemeralSocialResearchResultCacheOptions = {
  readonly clock?: Clock;
  readonly ttlMs?: number;
  readonly maxEntries?: number;
};

type CacheEntry<T> = {
  readonly value: T;
  readonly expiresAtMs: number | undefined;
  readonly writtenAtMs: number;
};

export class EphemeralSocialResearchResultCache
  implements SocialResearchResultCachePort
{
  private readonly searchRuns = new Map<string, CacheEntry<SocialSearchRun>>();
  private readonly threads = new Map<string, CacheEntry<SocialThread>>();

  constructor(
    private readonly options: EphemeralSocialResearchResultCacheOptions = {},
  ) {}

  async readSearch(cacheKey: string): Promise<SocialSearchRun | null> {
    return this.read(this.searchRuns, cacheKey);
  }

  async writeSearch(cacheKey: string, run: SocialSearchRun): Promise<void> {
    this.write(this.searchRuns, cacheKey, run);
  }

  async readThread(cacheKey: string): Promise<SocialThread | null> {
    return this.read(this.threads, cacheKey);
  }

  async writeThread(cacheKey: string, thread: SocialThread): Promise<void> {
    this.write(this.threads, cacheKey, thread);
  }

  private read<T>(store: Map<string, CacheEntry<T>>, cacheKey: string): T | null {
    const entry = store.get(cacheKey);
    if (entry === undefined) {
      return null;
    }

    if (entry.expiresAtMs !== undefined && entry.expiresAtMs <= this.nowMs()) {
      store.delete(cacheKey);

      return null;
    }

    return entry.value;
  }

  private write<T>(
    store: Map<string, CacheEntry<T>>,
    cacheKey: string,
    value: T,
  ): void {
    const nowMs = this.nowMs();
    store.set(cacheKey, {
      value,
      writtenAtMs: nowMs,
      expiresAtMs:
        this.options.ttlMs === undefined ? undefined : nowMs + this.options.ttlMs,
    });
    this.enforceMaxEntries(store);
  }

  private enforceMaxEntries<T>(store: Map<string, CacheEntry<T>>): void {
    const maxEntries = this.options.maxEntries;
    if (maxEntries === undefined || store.size <= maxEntries) {
      return;
    }

    const entriesByAge = [...store.entries()].sort(
      ([, left], [, right]) => left.writtenAtMs - right.writtenAtMs,
    );
    for (const [cacheKey] of entriesByAge.slice(0, store.size - maxEntries)) {
      store.delete(cacheKey);
    }
  }

  private nowMs(): number {
    return this.options.clock?.now().getTime() ?? Date.now();
  }
}
