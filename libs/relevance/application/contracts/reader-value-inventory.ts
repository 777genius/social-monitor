import type { JsonObject, Result } from '@social-monitor/shared-kernel';
import type { ReaderValueSource } from '../../domain/reader-value/reader-value-source';
import type { ReaderValueDiscoveryScope, ReaderValuePreparedInput } from './reader-value-assessment-store';
import type { ReaderValueScoringConfiguration } from './reader-value-scoring-configuration';

export type ReaderValueInventoryCursor = { readonly publishedAt: string; readonly feedItemId: string };
export type ReaderValueInventoryItem = {
  readonly cursor: ReaderValueInventoryCursor;
  readonly sourceBindingId: string;
  readonly observedAt: string;
  /** DB revision wall clock used to reject post-cutoff source substitutions. */
  readonly sourceUpdatedAt: string;
  readonly source: ReaderValueSource;
  readonly sourceRevisionKey: string;
  readonly metadata: JsonObject;
  /**
   * Time the frozen metrics in `metadata` were observed:
   * `COALESCE(source_item_engagement_snapshots.last_observed_at,
   * feed_items.observed_at)`, read in the same statement as `metadata`. The
   * fallback is a lower bound of the metric age, not an exact snapshot time:
   * days without engagement snapshots still carry metrics captured with the
   * feed item, never earlier. Absent only in test fakes.
   */
  readonly engagementObservedAt?: string | null;
};
export interface ReaderValueInventory {
  page(scope: ReaderValueDiscoveryScope, backfillFrom: string, cursor: ReaderValueInventoryCursor | undefined,
    limit: number, sourceByteBudget?: number, exclusivePeriodEnd?: string): Promise<readonly ReaderValueInventoryItem[]>;
}

export interface ReaderValueInventorySnapshot {
  page(backfillFrom: string, cursor: ReaderValueInventoryCursor | undefined,
    limit: number, sourceByteBudget?: number, exclusivePeriodEnd?: string): Promise<readonly ReaderValueInventoryItem[]>;
}

/**
 * Preparation-only inventory boundary. Every page read by one operation must
 * observe one database snapshot; callers must finish reading before doing any
 * provider work or persistence.
 */
export interface ReaderValuePreparationInventory {
  readSnapshot<T>(scope: ReaderValueDiscoveryScope,
    operation: (snapshot: ReaderValueInventorySnapshot) => Promise<T>,
    options?: { readonly includeExpiredSources?: boolean }): Promise<T>;
}

export class ReaderValueInventoryByteCeilingExceeded extends Error {
  constructor() {
    super('Reader value inventory exceeds the source byte ceiling');
    this.name = 'ReaderValueInventoryByteCeilingExceeded';
  }
}

export class ReaderValueInventoryTimeCeilingExceeded extends Error {
  constructor() {
    super('Reader value inventory exceeds the preparation time ceiling');
    this.name = 'ReaderValueInventoryTimeCeilingExceeded';
  }
}

export class ReaderValueInventorySnapshotUnavailable extends Error {
  constructor() {
    super('Reader value inventory contains an unversioned visible source');
    this.name = 'ReaderValueInventorySnapshotUnavailable';
  }
}

export type ReaderValueInputFailure = 'unsafe_source';
/** Deterministic preparation, including durable terminal diagnostics; no HTTP or database access. */
export interface ReaderValueInputBuilder {
  readonly configuration: ReaderValueScoringConfiguration;
  prepare(source: ReaderValueSource, sourceRevisionKey: string): Result<ReaderValuePreparedInput, ReaderValueInputFailure>;
}
