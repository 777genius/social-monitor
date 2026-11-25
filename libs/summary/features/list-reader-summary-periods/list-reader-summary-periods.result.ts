import type { ReaderSummaryPeriodSummary } from "../../ports/reader-summary-artifact-repository.port";

export type ListReaderSummaryPeriodsResult = {
  readonly items: readonly ReaderSummaryPeriodSummary[];
  readonly nextCursor?: string;
};
