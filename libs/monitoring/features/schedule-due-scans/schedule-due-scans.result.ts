export type ScheduleDueScansResult = {
  readonly scannedAt: Date;
  readonly evaluated: number;
  readonly enqueued: number;
  readonly skipped: number;
};
