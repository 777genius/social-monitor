import { readFileSync } from "node:fs";
import { join } from "node:path";

const checker = readFileSync(
  join(
    process.cwd(),
    "scripts/check-reader-summary-production-recovery-postgres.ts",
  ),
  "utf8",
);
const releaseHelper = readFileSync(
  join(
    process.cwd(),
    "scripts/lib/reader-summary-production-recovery-release.ts",
  ),
  "utf8",
);

describe("reader summary production recovery release wiring", () => {
  it("wraps the one full staged forward pass in bootstrap authority", () => {
    const positions = [
      'params.runBootstrap(\n    "pre"',
      "for (const migration of params.migrations)",
      "applyOrderedReaderSummaryMigrations(",
      'params.runBootstrap(\n    "post"',
      "assertReaderSummaryDailyTelemetryReleaseDatabaseState(",
    ].map((needle) => releaseHelper.indexOf(needle));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
    expect(releaseHelper.match(/applyOrderedReaderSummaryMigrations\(/gu))
      .toHaveLength(1);
    const releaseCall = checker.indexOf(
      "await applyReaderSummaryProductionRecoveryRelease(",
    );
    const schemaParity = checker.indexOf(
      "assertReaderSummaryMigrationDatabaseMatchesSchema(",
      releaseCall,
    );
    const lateRecovery = checker.indexOf(
      "const legacyRecoveryAfterForward",
      releaseCall,
    );
    expect(releaseCall).toBeGreaterThan(-1);
    expect(schemaParity).toBeGreaterThan(releaseCall);
    expect(lateRecovery).toBeGreaterThan(schemaParity);
  });

  it("includes telemetry and global default ACL in the verified staged list", () => {
    expect(checker).toMatch(
      /const telemetryMigration =\s+"20260824120000_reader_summary_daily_model_job_telemetry";/u,
    );
    expect(checker).toMatch(
      /const defaultAclMigration =\s+"20260824121000_reader_summary_daily_function_global_default_acl";/u,
    );
    expect(checker).toContain(
      "(migration) => migration > dailyDeliveryC1Migration,",
    );
    expect(checker).not.toContain("migration !== telemetryMigration");
    expect(checker).not.toContain("migration !== defaultAclMigration");
    expect(checker).toContain(
      "...postDailyDeliveryMigrations,\n          ],",
    );
    expect(checker).toContain(
      "runBootstrap: runReaderSummaryPublicationBootstrapSql,",
    );
    expect(releaseHelper).toContain(
      "defaultAclMigration: params.defaultAclMigration,",
    );
    expect(releaseHelper).toContain(
      "telemetryMigration: params.telemetryMigration,",
    );
  });
});
