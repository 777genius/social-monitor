import type { ReaderSummaryJobStatus, ReaderSummaryPeriod } from "../../domain";

export type RequestReaderSummaryResult = {
  readonly readerSummaryJobId: string;
  readonly period: {
    readonly cadence: ReaderSummaryPeriod["cadence"];
    readonly startedAt: string;
    readonly endedAt: string;
    readonly timezone: string;
    readonly periodKey: string;
  };
  readonly status: ReaderSummaryJobStatus;
  readonly created: boolean;
};
