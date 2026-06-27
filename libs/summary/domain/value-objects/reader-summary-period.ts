export const readerSummaryCadences = [
  "daily",
  "weekly",
  "monthly",
  "custom",
] as const;

export type ReaderSummaryCadence = (typeof readerSummaryCadences)[number];

export const scheduledReaderSummaryCadences = [
  "daily",
  "weekly",
  "monthly",
] as const;

export type ScheduledReaderSummaryCadence =
  (typeof scheduledReaderSummaryCadences)[number];

export type ReaderSummaryPeriod = {
  readonly cadence: ReaderSummaryCadence;
  readonly startedAt: Date;
  readonly endedAt: Date;
  readonly timezone: string;
  readonly periodKey: string;
};

export type ReaderSummaryPeriodInput = {
  readonly startedAt: Date;
  readonly endedAt: Date;
  readonly timezone: string;
};

export type ResolveReaderSummaryPeriodParams = {
  readonly cadence?: ReaderSummaryCadence;
  readonly period?: ReaderSummaryPeriodInput;
  readonly now: Date;
  readonly timezone?: string;
  readonly customMaxDays?: number;
};

export const DEFAULT_READER_SUMMARY_TIMEZONE = "UTC";
export const DEFAULT_READER_SUMMARY_CUSTOM_PERIOD_MAX_DAYS = 32;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_PERIOD_DURATION_MS_BY_CADENCE: Record<
  ReaderSummaryCadence,
  number
> = {
  daily: 36 * 60 * 60 * 1000,
  weekly: 8 * MS_PER_DAY,
  monthly: 32 * MS_PER_DAY,
  custom: DEFAULT_READER_SUMMARY_CUSTOM_PERIOD_MAX_DAYS * MS_PER_DAY,
};

export const resolveReaderSummaryPeriod = (
  params: ResolveReaderSummaryPeriodParams,
): ReaderSummaryPeriod => {
  const cadence = params.cadence ?? "daily";
  assertReaderSummaryCadence(cadence);

  if (cadence === "custom" && params.period === undefined) {
    throw new Error("Reader summary custom period must include explicit window");
  }

  const period =
    params.period === undefined
      ? defaultReaderSummaryPeriodForCadence({
          cadence: cadence as ScheduledReaderSummaryCadence,
          now: params.now,
          timezone: params.timezone ?? DEFAULT_READER_SUMMARY_TIMEZONE,
        })
      : buildReaderSummaryPeriod({
          cadence,
          startedAt: params.period.startedAt,
          endedAt: params.period.endedAt,
          timezone: params.period.timezone,
          customMaxDays: params.customMaxDays,
        });

  assertReaderSummaryPeriod(period, {
    customMaxDays: params.customMaxDays,
  });

  return period;
};

export const buildReaderSummaryPeriod = (params: {
  readonly cadence: ReaderSummaryCadence;
  readonly startedAt: Date;
  readonly endedAt: Date;
  readonly timezone: string;
  readonly customMaxDays?: number;
}): ReaderSummaryPeriod => {
  assertReaderSummaryCadence(params.cadence);
  assertReaderSummaryDate(params.startedAt, "start");
  assertReaderSummaryDate(params.endedAt, "end");
  assertReaderSummaryTimezone(params.timezone);

  const period: ReaderSummaryPeriod = {
    cadence: params.cadence,
    startedAt: new Date(params.startedAt.getTime()),
    endedAt: new Date(params.endedAt.getTime()),
    timezone: params.timezone.trim(),
    periodKey: readerSummaryPeriodKey({
      cadence: params.cadence,
      startedAt: params.startedAt,
      endedAt: params.endedAt,
      timezone: params.timezone,
    }),
  };
  assertReaderSummaryPeriod(period, {
    customMaxDays: params.customMaxDays,
  });

  return period;
};

export const defaultReaderSummaryPeriodForCadence = (params: {
  readonly cadence: ScheduledReaderSummaryCadence;
  readonly now: Date;
  readonly timezone: string;
}): ReaderSummaryPeriod => {
  assertScheduledReaderSummaryCadence(params.cadence);
  assertReaderSummaryDate(params.now, "now");
  assertReaderSummaryTimezone(params.timezone);

  const zoned = zonedDateParts(params.now, params.timezone);

  if (params.cadence === "daily") {
    return buildReaderSummaryPeriod({
      cadence: "daily",
      startedAt: zonedLocalDateTimeToUtc({
        ...zoned,
        hour: 0,
        minute: 0,
        second: 0,
        millisecond: 0,
        timezone: params.timezone,
      }),
      endedAt: zonedLocalDateTimeToUtc({
        ...addLocalDays(zoned, 1),
        hour: 0,
        minute: 0,
        second: 0,
        millisecond: 0,
        timezone: params.timezone,
      }),
      timezone: params.timezone,
    });
  }

  if (params.cadence === "weekly") {
    const isoDay = isoWeekday(zoned);
    const weekStart = addLocalDays(zoned, 1 - isoDay);

    return buildReaderSummaryPeriod({
      cadence: "weekly",
      startedAt: zonedLocalDateTimeToUtc({
        ...weekStart,
        hour: 0,
        minute: 0,
        second: 0,
        millisecond: 0,
        timezone: params.timezone,
      }),
      endedAt: zonedLocalDateTimeToUtc({
        ...addLocalDays(weekStart, 7),
        hour: 0,
        minute: 0,
        second: 0,
        millisecond: 0,
        timezone: params.timezone,
      }),
      timezone: params.timezone,
    });
  }

  if (params.cadence === "monthly") {
    return buildReaderSummaryPeriod({
      cadence: "monthly",
      startedAt: zonedLocalDateTimeToUtc({
        year: zoned.year,
        month: zoned.month,
        day: 1,
        hour: 0,
        minute: 0,
        second: 0,
        millisecond: 0,
        timezone: params.timezone,
      }),
      endedAt: zonedLocalDateTimeToUtc({
        year: zoned.month === 12 ? zoned.year + 1 : zoned.year,
        month: zoned.month === 12 ? 1 : zoned.month + 1,
        day: 1,
        hour: 0,
        minute: 0,
        second: 0,
        millisecond: 0,
        timezone: params.timezone,
      }),
      timezone: params.timezone,
    });
  }

  throw new Error("Unsupported reader summary scheduled cadence");
};

export const completedReaderSummaryPeriodForCadence = (params: {
  readonly cadence: ScheduledReaderSummaryCadence;
  readonly now: Date;
  readonly timezone: string;
}): ReaderSummaryPeriod => {
  assertScheduledReaderSummaryCadence(params.cadence);
  assertReaderSummaryDate(params.now, "now");
  assertReaderSummaryTimezone(params.timezone);

  const current = defaultReaderSummaryPeriodForCadence(params);
  const currentStart = zonedDateParts(current.startedAt, params.timezone);

  if (params.cadence === "daily") {
    return buildReaderSummaryPeriod({
      cadence: "daily",
      startedAt: zonedLocalDateTimeToUtc({
        ...addLocalDays(currentStart, -1),
        hour: 0,
        minute: 0,
        second: 0,
        millisecond: 0,
        timezone: params.timezone,
      }),
      endedAt: current.startedAt,
      timezone: params.timezone,
    });
  }

  if (params.cadence === "weekly") {
    return buildReaderSummaryPeriod({
      cadence: "weekly",
      startedAt: zonedLocalDateTimeToUtc({
        ...addLocalDays(currentStart, -7),
        hour: 0,
        minute: 0,
        second: 0,
        millisecond: 0,
        timezone: params.timezone,
      }),
      endedAt: current.startedAt,
      timezone: params.timezone,
    });
  }

  const previousMonth = addLocalMonths(currentStart, -1);

  return buildReaderSummaryPeriod({
    cadence: "monthly",
    startedAt: zonedLocalDateTimeToUtc({
      ...previousMonth,
      day: 1,
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0,
      timezone: params.timezone,
    }),
    endedAt: current.startedAt,
    timezone: params.timezone,
  });
};

export const assertReaderSummaryPeriod = (
  period: ReaderSummaryPeriod,
  options: { readonly customMaxDays?: number } = {},
): void => {
  assertReaderSummaryCadence(period.cadence);
  assertReaderSummaryDate(period.startedAt, "start");
  assertReaderSummaryDate(period.endedAt, "end");
  assertReaderSummaryTimezone(period.timezone);

  if (period.endedAt.getTime() <= period.startedAt.getTime()) {
    throw new Error("Reader summary period end must be after start");
  }

  const maxDuration =
    period.cadence === "custom"
      ? (options.customMaxDays ??
          DEFAULT_READER_SUMMARY_CUSTOM_PERIOD_MAX_DAYS) * MS_PER_DAY
      : MAX_PERIOD_DURATION_MS_BY_CADENCE[period.cadence];
  const duration = period.endedAt.getTime() - period.startedAt.getTime();

  if (duration > maxDuration) {
    throw new Error(
      `Reader summary ${period.cadence} period exceeds maximum duration`,
    );
  }

  const expectedKey = readerSummaryPeriodKey(period);
  if (period.periodKey !== expectedKey) {
    throw new Error("Reader summary period key must match cadence and window");
  }
};

export const assertReaderSummaryCadence: (
  cadence: string,
) => asserts cadence is ReaderSummaryCadence = (cadence) => {
  if (!readerSummaryCadences.includes(cadence as ReaderSummaryCadence)) {
    throw new Error("Unsupported reader summary cadence");
  }
};

export const assertScheduledReaderSummaryCadence: (
  cadence: string,
) => asserts cadence is ScheduledReaderSummaryCadence = (cadence) => {
  if (
    !scheduledReaderSummaryCadences.includes(
      cadence as ScheduledReaderSummaryCadence,
    )
  ) {
    throw new Error("Unsupported reader summary scheduled cadence");
  }
};

export const readerSummaryPeriodKey = (period: {
  readonly cadence: ReaderSummaryCadence;
  readonly startedAt: Date;
  readonly endedAt: Date;
  readonly timezone: string;
}): string => {
  assertReaderSummaryCadence(period.cadence);
  assertReaderSummaryDate(period.startedAt, "start");
  assertReaderSummaryDate(period.endedAt, "end");
  assertReaderSummaryTimezone(period.timezone);

  return [
    period.cadence,
    period.startedAt.toISOString(),
    period.endedAt.toISOString(),
    period.timezone.trim(),
  ].join(":");
};

const assertReaderSummaryDate = (value: Date, name: string): void => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`Reader summary period ${name} must be a valid date`);
  }
};

export const assertReaderSummaryTimezone = (timezone: string): void => {
  if (timezone.trim().length === 0) {
    throw new Error("Reader summary period timezone is required");
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(
      new Date("2026-01-01T00:00:00.000Z"),
    );
  } catch {
    throw new Error("Reader summary period timezone must be valid");
  }
};

type LocalDateParts = {
  readonly year: number;
  readonly month: number;
  readonly day: number;
};

type LocalDateTimeParts = LocalDateParts & {
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly millisecond: number;
  readonly timezone: string;
};

const zonedDateParts = (date: Date, timezone: string): LocalDateParts => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return {
    year: numberPart(parts, "year"),
    month: numberPart(parts, "month"),
    day: numberPart(parts, "day"),
  };
};

const zonedLocalDateTimeToUtc = (parts: LocalDateTimeParts): Date => {
  const localAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond,
  );
  let utc = new Date(localAsUtc);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const offset = timeZoneOffsetMs(utc, parts.timezone);
    utc = new Date(localAsUtc - offset);
  }

  return utc;
};

const timeZoneOffsetMs = (date: Date, timezone: string): number => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const asUtc = Date.UTC(
    numberPart(parts, "year"),
    numberPart(parts, "month") - 1,
    numberPart(parts, "day"),
    numberPart(parts, "hour"),
    numberPart(parts, "minute"),
    numberPart(parts, "second"),
    date.getUTCMilliseconds(),
  );

  return asUtc - date.getTime();
};

const numberPart = (
  parts: readonly Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPart["type"],
): number => {
  const value = parts.find((part) => part.type === type)?.value;
  if (value === undefined) {
    throw new Error(`Missing ${type} in reader summary period date`);
  }

  return Number.parseInt(value, 10);
};

const addLocalDays = (
  parts: LocalDateParts,
  days: number,
): LocalDateParts => {
  const next = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));

  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  };
};

const addLocalMonths = (
  parts: LocalDateParts,
  months: number,
): LocalDateParts => {
  const next = new Date(
    Date.UTC(parts.year, parts.month - 1 + months, 1),
  );

  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: 1,
  };
};

const isoWeekday = (parts: LocalDateParts): number => {
  const day = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day),
  ).getUTCDay();

  return day === 0 ? 7 : day;
};
