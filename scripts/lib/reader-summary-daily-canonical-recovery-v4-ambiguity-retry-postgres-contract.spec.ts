import {
  assertReaderSummaryDailyCanonicalRecoveryV4AmbiguityRetryMigrationContract,
} from "./reader-summary-daily-canonical-recovery-v4-ambiguity-retry-postgres-contract";

describe("reader summary daily canonical recovery v4 ambiguity retry migration", () => {
  it("permits only the reviewed append-only Jul23 attempt-2 exception", () => {
    expect(() =>
      assertReaderSummaryDailyCanonicalRecoveryV4AmbiguityRetryMigrationContract(),
    ).not.toThrow();
  });
});
