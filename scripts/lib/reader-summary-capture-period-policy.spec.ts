import {
  addUtcDays,
  resolveLiveObservationCutoff,
  resolveRecoveryTimestampPolicy,
  startOfUtcDay,
} from "./reader-summary-capture-period-policy";

const startedAt = new Date("2026-08-15T00:00:00.000Z");
const endedAt = new Date("2026-08-16T00:00:00.000Z");
const now = new Date("2026-08-15T16:15:00.000Z");

describe("reader summary capture period policy", () => {
  it("accepts a rolling observation cutoff inside the current UTC day", () => {
    const cutoff = new Date("2026-08-15T16:14:59.000Z");

    expect(resolveLiveObservationCutoff({
      value: cutoff,
      dailyReplayActive: false,
      recoveryActive: false,
      cadence: "daily",
      timezone: "UTC",
      periodStartedAt: startedAt,
      periodEndedAt: endedAt,
      now,
    })).toEqual(cutoff);
  });

  it.each([
    { dailyReplayActive: true, recoveryActive: false },
    { dailyReplayActive: false, recoveryActive: true },
  ])("rejects rolling cutoff for replay or recovery", (mode) => {
    expect(() => resolveLiveObservationCutoff({
      value: new Date("2026-08-15T12:00:00.000Z"),
      ...mode,
      cadence: "daily",
      timezone: "UTC",
      periodStartedAt: startedAt,
      periodEndedAt: endedAt,
      now,
    })).toThrow("requires a current exact UTC daily period");
  });

  it("rejects a future rolling cutoff", () => {
    expect(() => resolveLiveObservationCutoff({
      value: new Date("2026-08-15T16:15:01.000Z"),
      dailyReplayActive: false,
      recoveryActive: false,
      cadence: "daily",
      timezone: "UTC",
      periodStartedAt: startedAt,
      periodEndedAt: endedAt,
      now,
    })).toThrow("requires a current exact UTC daily period");
  });

  it("keeps historical recovery restricted to a completed UTC day", () => {
    expect(resolveRecoveryTimestampPolicy({
      argv: ["--historical-recovery"],
      envValue: "published_at",
      cadence: "daily",
      timezone: "UTC",
      periodStartedAt: startedAt,
      periodEndedAt: endedAt,
      now: new Date("2026-08-17T00:00:00.000Z"),
    })).toEqual({ active: true, policy: "published_at" });
  });

  it("provides UTC day helpers without local-time drift", () => {
    expect(startOfUtcDay(new Date("2026-08-15T21:30:00.000Z"))).toEqual(
      startedAt,
    );
    expect(addUtcDays(startedAt, 1)).toEqual(endedAt);
  });
});
