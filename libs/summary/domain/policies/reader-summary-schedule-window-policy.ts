import {
  defaultReaderSummaryPeriodForCadence,
  type ScheduledReaderSummaryCadence,
} from "../value-objects/reader-summary-period";

export type ReaderSummaryScheduleReadyAtUtc = {
  readonly hour: number;
  readonly minute: number;
};

export const DEFAULT_READER_SUMMARY_SCHEDULE_READY_AT_UTC: ReaderSummaryScheduleReadyAtUtc =
  {
    hour: 6,
    minute: 0,
  };

export class ReaderSummaryScheduleWindowPolicy {
  constructor(
    private readonly readyAtUtc: ReaderSummaryScheduleReadyAtUtc = DEFAULT_READER_SUMMARY_SCHEDULE_READY_AT_UTC,
  ) {
    assertReaderSummaryScheduleReadyAtUtc(readyAtUtc);
  }

  canSchedule(params: {
    readonly cadence: ScheduledReaderSummaryCadence;
    readonly now: Date;
  }): boolean {
    const currentPeriod = defaultReaderSummaryPeriodForCadence({
      cadence: params.cadence,
      now: params.now,
      timezone: "UTC",
    });
    const readyAt = new Date(
      currentPeriod.startedAt.getTime() +
        (this.readyAtUtc.hour * 60 + this.readyAtUtc.minute) * 60 * 1000,
    );

    return params.now.getTime() >= readyAt.getTime();
  }
}

export const readerSummaryScheduleReadyAtUtcLabel = (
  value: ReaderSummaryScheduleReadyAtUtc,
): string => {
  assertReaderSummaryScheduleReadyAtUtc(value);

  return `${value.hour.toString().padStart(2, "0")}:${value.minute
    .toString()
    .padStart(2, "0")} UTC`;
};

export const assertReaderSummaryScheduleReadyAtUtc = (
  value: ReaderSummaryScheduleReadyAtUtc,
): void => {
  if (
    !Number.isInteger(value.hour) ||
    value.hour < 0 ||
    value.hour > 23 ||
    !Number.isInteger(value.minute) ||
    value.minute < 0 ||
    value.minute > 59
  ) {
    throw new Error("Reader summary schedule ready time must be HH:mm UTC");
  }
};
