import type {
  ReaderSummaryJobStatus,
  ReaderSummaryPeriod,
  ReaderSummaryScope,
} from "../../domain";

export type ReaderSummaryJobTimelineEvent = {
  readonly status: ReaderSummaryJobStatus;
  readonly occurredAt: string;
  readonly message: string;
};

export type GetReaderSummaryJobStatusResult = {
  readonly readerSummaryJobId: string;
  readonly scope: ReaderSummaryScope;
  readonly period: {
    readonly cadence: ReaderSummaryPeriod["cadence"];
    readonly startedAt: string;
    readonly endedAt: string;
    readonly timezone: string;
    readonly periodKey: string;
  };
  readonly status: ReaderSummaryJobStatus;
  readonly requestedAt: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly failedAt?: string;
  readonly readerSummaryId?: string;
  readonly failureReason?: string;
  readonly timeline: readonly ReaderSummaryJobTimelineEvent[];
};
