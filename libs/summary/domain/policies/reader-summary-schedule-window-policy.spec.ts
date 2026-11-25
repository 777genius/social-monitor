import {
  ReaderSummaryScheduleWindowPolicy,
  readerSummaryScheduleReadyAtUtcLabel,
} from "./reader-summary-schedule-window-policy";

describe("ReaderSummaryScheduleWindowPolicy", () => {
  it("allows daily scheduling only after the shared UTC ready time", () => {
    const policy = new ReaderSummaryScheduleWindowPolicy({
      hour: 6,
      minute: 0,
    });

    expect(
      policy.canSchedule({
        cadence: "daily",
        now: new Date("2026-07-15T05:59:59.999Z"),
      }),
    ).toBe(false);
    expect(
      policy.canSchedule({
        cadence: "daily",
        now: new Date("2026-07-15T06:00:00.000Z"),
      }),
    ).toBe(true);
  });

  it("allows weekly scheduling after Monday 06:00 UTC and catches up later", () => {
    const policy = new ReaderSummaryScheduleWindowPolicy({
      hour: 6,
      minute: 0,
    });

    expect(
      policy.canSchedule({
        cadence: "weekly",
        now: new Date("2026-07-13T05:59:59.999Z"),
      }),
    ).toBe(false);
    expect(
      policy.canSchedule({
        cadence: "weekly",
        now: new Date("2026-07-13T06:00:00.000Z"),
      }),
    ).toBe(true);
    expect(
      policy.canSchedule({
        cadence: "weekly",
        now: new Date("2026-07-15T12:00:00.000Z"),
      }),
    ).toBe(true);
  });

  it("allows monthly scheduling after the first day 06:00 UTC", () => {
    const policy = new ReaderSummaryScheduleWindowPolicy({
      hour: 6,
      minute: 0,
    });

    expect(
      policy.canSchedule({
        cadence: "monthly",
        now: new Date("2026-07-01T05:59:59.999Z"),
      }),
    ).toBe(false);
    expect(
      policy.canSchedule({
        cadence: "monthly",
        now: new Date("2026-07-01T06:00:00.000Z"),
      }),
    ).toBe(true);
  });

  it("formats and rejects unsupported ready times", () => {
    expect(readerSummaryScheduleReadyAtUtcLabel({ hour: 6, minute: 0 })).toBe(
      "06:00 UTC",
    );
    expect(
      () => new ReaderSummaryScheduleWindowPolicy({ hour: 24, minute: 0 }),
    ).toThrow("Reader summary schedule ready time must be HH:mm UTC");
  });
});
