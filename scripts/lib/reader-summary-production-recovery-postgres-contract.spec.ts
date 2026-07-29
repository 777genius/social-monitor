import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  assertReaderSummaryProductionRecoveryPostgresContract,
  seedReaderSummaryProductionRecoveryFixture,
} from "./reader-summary-production-recovery-postgres-contract";

describe("reader summary production recovery PostgreSQL contract", () => {
  const validationMigration = readFileSync(
    join(
      process.cwd(),
      "prisma/migrations/" +
        "20260729162000_reader_summary_production_recovery_validate_v2/" +
        "migration.sql",
    ),
    "utf8",
  );

  it("exports the real DB fixture and concurrency contract", () => {
    expect(seedReaderSummaryProductionRecoveryFixture).toBeInstanceOf(
      Function,
    );
    expect(assertReaderSummaryProductionRecoveryPostgresContract)
      .toBeInstanceOf(Function);
  });

  it("replaces only validation with the exact six-day v2 authority", () => {
    expect(validationMigration).toContain(
      'CREATE OR REPLACE FUNCTION\n"validate_reader_summary_production_recovery"',
    );
    expect(validationMigration).not.toContain(
      'CREATE OR REPLACE FUNCTION "prepare_reader_summary_production_recovery"',
    );
    expect(validationMigration).toContain(
      "reader_summary.production_recovery_authority.v2",
    );
    expect(validationMigration).toContain(
      "reader_summary.production_recovery.v2:",
    );
    expect(validationMigration).toContain(
      '"reader_summary_production_recovery_expected_counts_v2"',
    );
    for (const date of [
      "2026-07-23",
      "2026-07-24",
      "2026-07-25",
      "2026-07-26",
      "2026-07-27",
      "2026-07-28",
    ]) {
      expect(validationMigration).toContain(`'${date}'`);
    }
    expect(validationMigration).not.toMatch(
      /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\b/iu,
    );
    expect(validationMigration).not.toMatch(
      /\b(?:WHERE|AND|OR|ORDER BY)\s+"(?:id|recovery_id|tenant_id|workspace_id)"/iu,
    );
    expect(validationMigration).not.toMatch(/\bOR\s+CASE\b/iu);
    expect(
      validationMigration.match(/\bOR\s+\(\s*CASE\b[\s\S]*?\bEND\s*\)/giu),
    ).toHaveLength(2);
  });
});
