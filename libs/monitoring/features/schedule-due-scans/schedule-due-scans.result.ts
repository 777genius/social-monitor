export type ScheduleDueScansSkipReason =
  | 'active_scan'
  | 'duplicate_window'
  | 'fresh_success'
  | 'provider_failure_backoff'
  | 'queue_backpressure'
  | 'rate_limit_backoff'
  | 'source_unavailable';

export type ScheduleDueScansSkipBreakdown = Readonly<
  Record<ScheduleDueScansSkipReason, number>
>;

export type ScheduleDueScansResult = {
  readonly scannedAt: Date;
  readonly evaluated: number;
  readonly enqueued: number;
  readonly skipped: number;
  readonly skippedByReason: ScheduleDueScansSkipBreakdown;
};
