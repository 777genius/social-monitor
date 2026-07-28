import {
  assertReaderSummaryProductionRecoveryPostgresContract,
  seedReaderSummaryProductionRecoveryFixture,
} from "./reader-summary-production-recovery-postgres-contract";

describe("reader summary production recovery PostgreSQL contract", () => {
  it("exports the real DB fixture and concurrency contract", () => {
    expect(seedReaderSummaryProductionRecoveryFixture).toBeInstanceOf(
      Function,
    );
    expect(assertReaderSummaryProductionRecoveryPostgresContract)
      .toBeInstanceOf(Function);
  });
});
