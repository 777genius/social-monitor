export type ReaderSummaryUsageContext = {
  readonly jobId: string;
  readonly periodStartedAt: string;
};

export interface ReaderSummaryUsageScope {
  run<T>(context: ReaderSummaryUsageContext, action: () => Promise<T>): Promise<T>;
}

export const NOOP_READER_SUMMARY_USAGE_SCOPE: ReaderSummaryUsageScope = {
  run: (_context, action) => action(),
};
