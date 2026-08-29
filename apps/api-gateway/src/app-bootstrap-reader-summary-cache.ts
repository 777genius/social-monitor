import type { Clock } from '@social-monitor/shared-kernel';

import type { ReaderSummaryBootstrapResponseDto } from './app-bootstrap.dto';

export const APP_BOOTSTRAP_READER_SUMMARY_CACHE_CLOCK = Symbol(
  'APP_BOOTSTRAP_READER_SUMMARY_CACHE_CLOCK',
);

export const APP_BOOTSTRAP_READER_SUMMARY_CACHE_TTL_MS = 30_000;
export const APP_BOOTSTRAP_READER_SUMMARY_CACHE_MAX_ENTRIES = 128;

const PUBLISHED_READER_SUMMARY_QUERY_IDENTITY =
  'published:workspace:daily:utc:latest-1:periods-40';

interface CacheEntry {
  readonly expiresAtMs: number;
  readonly value: ReaderSummaryBootstrapResponseDto;
}

export class AppBootstrapReaderSummaryCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<
    string,
    Promise<ReaderSummaryBootstrapResponseDto>
  >();

  constructor(
    private readonly clock: Clock,
    private readonly ttlMs: number,
    private readonly maxEntries: number,
  ) {
    if (
      !Number.isSafeInteger(ttlMs) ||
      ttlMs <= 0 ||
      !Number.isSafeInteger(maxEntries) ||
      maxEntries <= 0
    ) {
      throw new Error('Bootstrap summary cache bounds must be positive');
    }
  }

  getOrLoad(
    tenantId: string,
    workspaceId: string,
    loader: () => Promise<ReaderSummaryBootstrapResponseDto>,
  ): Promise<ReaderSummaryBootstrapResponseDto> {
    const key = JSON.stringify([
      tenantId,
      workspaceId,
      PUBLISHED_READER_SUMMARY_QUERY_IDENTITY,
    ]);
    const nowMs = this.clock.now().getTime();
    const cached = this.entries.get(key);
    if (cached && cached.expiresAtMs > nowMs) {
      return Promise.resolve(cached.value);
    }
    if (cached) {
      this.entries.delete(key);
    }

    const existingLoad = this.inFlight.get(key);
    if (existingLoad) {
      return existingLoad;
    }

    const pending = Promise.resolve()
      .then(loader)
      .then((value) => {
        this.store(key, value);
        return value;
      })
      .finally(() => {
        if (this.inFlight.get(key) === pending) {
          this.inFlight.delete(key);
        }
      });
    this.inFlight.set(key, pending);
    return pending;
  }

  private store(key: string, value: ReaderSummaryBootstrapResponseDto): void {
    const nowMs = this.clock.now().getTime();
    for (const [candidateKey, entry] of this.entries) {
      if (entry.expiresAtMs <= nowMs) {
        this.entries.delete(candidateKey);
      }
    }
    while (this.entries.size >= this.maxEntries) {
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (oldestKey === undefined) {
        break;
      }
      this.entries.delete(oldestKey);
    }
    this.entries.set(key, { value, expiresAtMs: nowMs + this.ttlMs });
  }
}
