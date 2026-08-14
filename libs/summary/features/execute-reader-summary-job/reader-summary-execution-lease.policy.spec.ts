import { ReaderSummaryExecutionLeasePolicy } from "./reader-summary-execution-lease.policy";

describe("ReaderSummaryExecutionLeasePolicy", () => {
  it("derives an explicit stale boundary from the injected clock value", () => {
    const policy = new ReaderSummaryExecutionLeasePolicy(10 * 60 * 1_000);

    expect(
      policy
        .staleRunningStartedBefore(new Date("2026-08-14T12:30:00.000Z"))
        .toISOString(),
    ).toBe("2026-08-14T12:20:00.000Z");
  });

  it("rejects unbounded or fractional lease timeouts", () => {
    expect(() => new ReaderSummaryExecutionLeasePolicy(0)).toThrow(
      "positive integer",
    );
    expect(() => new ReaderSummaryExecutionLeasePolicy(1.5)).toThrow(
      "positive integer",
    );
    expect(
      () => new ReaderSummaryExecutionLeasePolicy(24 * 60 * 60 * 1_000 + 1),
    ).toThrow("no greater than 24 hours");
  });
});
