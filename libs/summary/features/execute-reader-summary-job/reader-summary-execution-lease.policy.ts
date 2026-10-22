// The production capture budget is 116 minutes and weekly generations run
// past three hours on provider retries. Keep the lease above those bounded
// runtimes so an in-flight maximum-budget generation remains fresh.
export const DEFAULT_READER_SUMMARY_EXECUTION_LEASE_MS = 6 * 60 * 60 * 1_000;
export const MAX_READER_SUMMARY_EXECUTION_LEASE_MS = 24 * 60 * 60 * 1_000;

export class ReaderSummaryExecutionLeasePolicy {
  constructor(
    readonly timeoutMs: number = DEFAULT_READER_SUMMARY_EXECUTION_LEASE_MS,
  ) {
    if (
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs <= 0 ||
      timeoutMs > MAX_READER_SUMMARY_EXECUTION_LEASE_MS
    ) {
      throw new Error(
        "Reader summary execution lease timeout must be a positive integer no greater than 24 hours",
      );
    }
  }

  staleRunningStartedBefore(now: Date): Date {
    return new Date(now.getTime() - this.timeoutMs);
  }
}
