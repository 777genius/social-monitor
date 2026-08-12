export type ReaderSummaryDailyMaintenanceBounds = Readonly<{
  lowerInclusive: string;
  upperInclusive: string;
}>;

export const readerSummaryDailyJul31Aug3MaintenanceBounds:
  ReaderSummaryDailyMaintenanceBounds = Object.freeze({
    lowerInclusive: "2026-07-31",
    upperInclusive: "2026-08-03",
  });

export const assertReaderSummaryDailyMaintenanceBounds = (
  bounds: ReaderSummaryDailyMaintenanceBounds,
): void => {
  assertExactUtcDate(bounds.lowerInclusive, "maintenance lower bound");
  assertExactUtcDate(bounds.upperInclusive, "maintenance upper bound");
  if (bounds.lowerInclusive > bounds.upperInclusive) {
    throw new Error("Reader summary daily maintenance bounds are inverted");
  }
};

export const assertReaderSummaryDailyMaintenanceDate = (
  requestedUtcDate: string,
  bounds: ReaderSummaryDailyMaintenanceBounds,
): void => {
  assertReaderSummaryDailyMaintenanceBounds(bounds);
  assertExactUtcDate(requestedUtcDate, "maintenance cursor date");
  if (requestedUtcDate < bounds.lowerInclusive) {
    throw new Error("Reader summary daily maintenance cursor is below the lower bound");
  }
};

export const isAfterReaderSummaryDailyMaintenanceBounds = (
  requestedUtcDate: string,
  bounds: ReaderSummaryDailyMaintenanceBounds,
): boolean => {
  assertReaderSummaryDailyMaintenanceDate(requestedUtcDate, bounds);
  return requestedUtcDate > bounds.upperInclusive;
};

export const isAtReaderSummaryDailyMaintenanceUpperBound = (
  requestedUtcDate: string,
  bounds: ReaderSummaryDailyMaintenanceBounds,
): boolean => {
  assertReaderSummaryDailyMaintenanceDate(requestedUtcDate, bounds);
  return requestedUtcDate === bounds.upperInclusive;
};

export const assertExactUtcDate = (value: string, label: string): void => {
  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(value) ||
    new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`Reader summary daily ${label} must be an exact UTC date`);
  }
};
