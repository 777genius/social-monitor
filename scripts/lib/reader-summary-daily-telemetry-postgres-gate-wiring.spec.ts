import { readFileSync } from "node:fs";

describe("reader summary daily telemetry PostgreSQL gate wiring", () => {
  it("reopens the ordered release migration boundary after staged hardening", () => {
    const source = readFileSync(
      "scripts/check-reader-summary-daily-terminal-authority-postgres.ts",
      "utf8",
    );
    const stagedResume = [
      'runReaderSummaryPublicationBootstrapSql("post",',
      'runReaderSummaryPublicationBootstrapSql("pre",',
      "installPublicationAndFollowingMigrations(workspace)",
      "removeInstalledReaderSummaryMigration(workspace, telemetryMigration)",
      "applyOrderedReaderSummaryMigrations(adminDatabaseUrl, workspace)",
      "assertAuthority(auditor, first, second, migrationAdminRole,",
      'runReaderSummaryPublicationBootstrapSql("pre",',
      'cpSync(join("prisma/migrations", telemetryMigration)',
      "applyOrderedReaderSummaryMigrations(adminDatabaseUrl, workspace)",
      'runReaderSummaryPublicationBootstrapSql("post",',
      "assertReaderSummaryMigrationDatabaseMatchesSchema(targetDatabaseUrl)",
    ] as const;

    let previousIndex = source.indexOf("resolveRolledBackReaderSummaryMigration(");
    expect(previousIndex).toBeGreaterThanOrEqual(0);
    for (const statement of stagedResume) {
      const statementIndex = source.indexOf(statement, previousIndex + 1);
      expect(statementIndex).toBeGreaterThan(previousIndex);
      previousIndex = statementIndex;
    }
  });

  it("keeps the exact cursor gate on PG18 with diagnosed telemetry SQL", () => {
    const source = readFileSync(
      "scripts/check-reader-summary-daily-execution-cursor-postgres.ts",
      "utf8",
    );

    expect(source).toContain(
      '"prisma/migrations/20260824120000_reader_summary_daily_model_job_telemetry/migration.sql"',
    );
    expect(source).toContain(
      "await executePostgresMigrationWithDiagnostics(admin, {",
    );
    expect(source).toContain(
      '"daily execution cursor contract requires disposable PostgreSQL 18+"',
    );
    expect(source).toContain(
      'console.log("Reader summary daily execution cursor PostgreSQL 18 gate OK")',
    );
  });
});
