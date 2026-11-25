import {
  assertReaderSummaryDailyCanonicalRecoveryV4InvalidProductRetrySetMigrationContract,
} from "./reader-summary-daily-canonical-recovery-v4-invalid-product-retry-set-postgres-contract";

describe("daily canonical recovery v4 invalid-product retry-set migration", () => {
  it("is staticly fail-closed", () => {
    expect(() =>
      assertReaderSummaryDailyCanonicalRecoveryV4InvalidProductRetrySetMigrationContract(),
    ).not.toThrow();
  });
});
