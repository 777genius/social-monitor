import type {
  ReaderSummaryScope,
  ScheduledReaderSummaryCadence,
} from "../../domain";

export type ScheduledPeriodicReaderSummaryResultItem = {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly scope: ReaderSummaryScope;
  readonly cadence: ScheduledReaderSummaryCadence;
  readonly period: {
    readonly startedAt: string;
    readonly endedAt: string;
    readonly timezone: string;
    readonly periodKey: string;
  };
  readonly readerSummaryJobId: string;
  readonly status: string;
  readonly created: boolean;
  readonly idempotencyKey: string;
};

export type SchedulePeriodicReaderSummariesResult = {
  readonly evaluated: number;
  readonly scheduled: number;
  readonly existing: number;
  readonly failed: number;
  readonly summaries: readonly ScheduledPeriodicReaderSummaryResultItem[];
  readonly failures: readonly {
    readonly scopeKey: string;
    readonly cadence: ScheduledReaderSummaryCadence;
    readonly message: string;
  }[];
};
