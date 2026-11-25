import {
  buildReaderSummaryPeriod,
  completedReaderSummaryPeriodForCadence,
  defaultReaderSummaryPeriodForCadence,
  readerSummaryPeriodKey,
  resolveReaderSummaryPeriod,
} from "./reader-summary-period";

describe("ReaderSummaryPeriod", () => {
  it("derives the current daily period in the requested timezone", () => {
    const period = defaultReaderSummaryPeriodForCadence({
      cadence: "daily",
      now: new Date("2026-06-22T10:30:00.000Z"),
      timezone: "Europe/Kiev",
    });

    expect(period).toEqual({
      cadence: "daily",
      startedAt: new Date("2026-06-21T21:00:00.000Z"),
      endedAt: new Date("2026-06-22T21:00:00.000Z"),
      timezone: "Europe/Kiev",
      periodKey:
        "daily:2026-06-21T21:00:00.000Z:2026-06-22T21:00:00.000Z:Europe/Kiev",
    });
  });

  it("derives an ISO weekly period from Monday to Monday", () => {
    const period = defaultReaderSummaryPeriodForCadence({
      cadence: "weekly",
      now: new Date("2026-06-24T12:00:00.000Z"),
      timezone: "UTC",
    });

    expect(period.startedAt).toEqual(new Date("2026-06-22T00:00:00.000Z"));
    expect(period.endedAt).toEqual(new Date("2026-06-29T00:00:00.000Z"));
    expect(period.periodKey).toBe(
      "weekly:2026-06-22T00:00:00.000Z:2026-06-29T00:00:00.000Z:UTC",
    );
  });

  it("derives a calendar monthly period in timezone", () => {
    const period = defaultReaderSummaryPeriodForCadence({
      cadence: "monthly",
      now: new Date("2026-07-15T12:00:00.000Z"),
      timezone: "UTC",
    });

    expect(period.startedAt).toEqual(new Date("2026-07-01T00:00:00.000Z"));
    expect(period.endedAt).toEqual(new Date("2026-08-01T00:00:00.000Z"));
  });

  it("derives the latest completed daily, weekly and monthly periods", () => {
    expect(
      completedReaderSummaryPeriodForCadence({
        cadence: "daily",
        now: new Date("2026-06-24T12:00:00.000Z"),
        timezone: "UTC",
      }),
    ).toEqual(
      buildReaderSummaryPeriod({
        cadence: "daily",
        startedAt: new Date("2026-06-23T00:00:00.000Z"),
        endedAt: new Date("2026-06-24T00:00:00.000Z"),
        timezone: "UTC",
      }),
    );

    expect(
      completedReaderSummaryPeriodForCadence({
        cadence: "weekly",
        now: new Date("2026-06-24T12:00:00.000Z"),
        timezone: "UTC",
      }),
    ).toEqual(
      buildReaderSummaryPeriod({
        cadence: "weekly",
        startedAt: new Date("2026-06-15T00:00:00.000Z"),
        endedAt: new Date("2026-06-22T00:00:00.000Z"),
        timezone: "UTC",
      }),
    );

    expect(
      completedReaderSummaryPeriodForCadence({
        cadence: "monthly",
        now: new Date("2026-07-15T12:00:00.000Z"),
        timezone: "UTC",
      }),
    ).toEqual(
      buildReaderSummaryPeriod({
        cadence: "monthly",
        startedAt: new Date("2026-06-01T00:00:00.000Z"),
        endedAt: new Date("2026-07-01T00:00:00.000Z"),
        timezone: "UTC",
      }),
    );
  });

  it("rejects invalid timezone and inverted windows", () => {
    expect(() =>
      buildReaderSummaryPeriod({
        cadence: "daily",
        startedAt: new Date("2026-06-22T00:00:00.000Z"),
        endedAt: new Date("2026-06-23T00:00:00.000Z"),
        timezone: " ",
      }),
    ).toThrow("Reader summary period timezone is required");

    expect(() =>
      buildReaderSummaryPeriod({
        cadence: "weekly",
        startedAt: new Date("2026-06-23T00:00:00.000Z"),
        endedAt: new Date("2026-06-22T00:00:00.000Z"),
        timezone: "UTC",
      }),
    ).toThrow("Reader summary period end must be after start");
  });

  it("enforces cadence-specific maximum durations", () => {
    expect(() =>
      buildReaderSummaryPeriod({
        cadence: "weekly",
        startedAt: new Date("2026-06-01T00:00:00.000Z"),
        endedAt: new Date("2026-06-10T00:00:00.000Z"),
        timezone: "UTC",
      }),
    ).toThrow("Reader summary weekly period exceeds maximum duration");
  });

  it("requires explicit windows for custom periods", () => {
    expect(() =>
      resolveReaderSummaryPeriod({
        cadence: "custom",
        now: new Date("2026-06-24T12:00:00.000Z"),
        timezone: "UTC",
      }),
    ).toThrow("Reader summary custom period must include explicit window");
  });

  it("creates a deterministic period key", () => {
    expect(
      readerSummaryPeriodKey({
        cadence: "monthly",
        startedAt: new Date("2026-06-01T00:00:00.000Z"),
        endedAt: new Date("2026-07-01T00:00:00.000Z"),
        timezone: "UTC",
      }),
    ).toBe(
      "monthly:2026-06-01T00:00:00.000Z:2026-07-01T00:00:00.000Z:UTC",
    );
  });
});
