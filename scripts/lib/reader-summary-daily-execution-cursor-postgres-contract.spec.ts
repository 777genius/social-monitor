import { readFileSync } from "node:fs";

import {
  assertReaderSummaryDailyActivationMigrationContract,
  assertReaderSummaryDailyMigrationContract,
} from "./reader-summary-daily-execution-cursor-postgres-contract";

const migrationPath =
  "prisma/migrations/20260802100000_reader_summary_daily_execution_cursor/migration.sql";

describe("reader summary daily execution cursor PostgreSQL contract", () => {
  it("pins serializable row-lock, lease, catch-up, and immutable source rules", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(() => assertReaderSummaryDailyMigrationContract(sql)).not.toThrow();
  });

  it("separates the durable model receipt from canonical publication advance", () => {
    const sql = readFileSync(
      "prisma/migrations/20260802143000_reader_summary_daily_execution_publication_activation/migration.sql",
      "utf8",
    );
    expect(() => assertReaderSummaryDailyActivationMigrationContract(sql)).not.toThrow();
  });

  it.each([
    ["table lock", "\nLOCK TABLE reader_summary_daily_execution_cursors;"],
    ["missing serializable", "current_setting('transaction_isolation') <> 'serializable'"],
    ["missing cutoff", "feed.\"observed_at\" <= invoked_at"],
    ["ambiguous cursor conflict", 'ON CONFLICT ON CONSTRAINT "reader_summary_daily_execution_cursors_pkey"'],
    ["ambiguous model conflict", 'ON CONFLICT ON CONSTRAINT "reader_summary_daily_model_jobs_pkey"'],
    ["model identity drift", "'reader-summary-daily:v1'"],
  ])("rejects %s drift", (_label, mutation) => {
    const sql = readFileSync(migrationPath, "utf8");
    const changed = mutation.startsWith("\n") ? `${sql}${mutation}` : sql.replaceAll(mutation, "removed");
    expect(() => assertReaderSummaryDailyMigrationContract(changed)).toThrow();
  });
});
