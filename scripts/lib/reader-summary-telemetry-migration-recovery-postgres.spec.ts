import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  isReviewedTelemetryFailureLog,
  oldReaderSummaryTelemetryMigrationSql,
  reviewedTelemetryFailureLog,
  telemetryCorrectedChecksum,
  telemetryOldChecksum,
} from "./reader-summary-telemetry-migration-recovery-postgres";

const migrationPath =
  "prisma/migrations/20260824120000_reader_summary_daily_model_job_telemetry/migration.sql";

describe("reader summary telemetry old-checksum recovery fixture", () => {
  it("derives only the exact already-attempted migration bytes", () => {
    const corrected = readFileSync(migrationPath, "utf8");
    const old = oldReaderSummaryTelemetryMigrationSql(corrected);

    expect(digest(corrected)).toBe(telemetryCorrectedChecksum);
    expect(digest(old)).toBe(telemetryOldChecksum);
    expect(old).toContain(`) OWNER TO social_monitor_reader_summary_daily_publication_definer;
REVOKE CREATE ON SCHEMA public
  FROM social_monitor_reader_summary_daily_publication_definer;
SET LOCAL ROLE social_monitor_reader_summary_daily_publication_definer;`);
    expect(old).not.toContain("v_owner_had_schema_create");
    expect(old).not.toContain("GRANT CREATE ON SCHEMA public TO %I");
  });

  it("rejects corrected migration drift before deriving old bytes", () => {
    const corrected = readFileSync(migrationPath, "utf8");
    expect(() => oldReaderSummaryTelemetryMigrationSql(
      corrected.replace("-- Expand-only telemetry", "-- changed telemetry"),
    )).toThrow("requires the exact corrected migration");
  });

  it("rejects every prefix, suffix, case, and additional-error log mutation", () => {
    const observed = reviewedTelemetryFailureLog.replace(
      "line: Some(<server-line>)", "line: Some(3655)",
    );
    expect(isReviewedTelemetryFailureLog(observed)).toBe(true);
    expect(isReviewedTelemetryFailureLog(observed.replaceAll("\n", "\r\n")))
      .toBe(true);
    for (const mutation of [
      `prefix\n${observed}`,
      `${observed}suffix`,
      `${observed}ERROR: appended unrelated failure\n`,
      observed.replace("permission denied", "Permission denied"),
      observed.replace("42501", "42502"),
    ]) {
      expect(isReviewedTelemetryFailureLog(mutation)).toBe(false);
    }
  });

  it("pins fail-closed catalog, failure, rollback, and ACL predicates", () => {
    const probe = readFileSync(
      "ops/deploy/reader-summary-telemetry-failed-migration-preflight.sql", "utf8",
    );
    for (const contract of [
      "v_rows <> 1 OR v_unfinished <> 1",
      "finished_at IS NULL AND rolled_back_at IS NULL",
      "applied_steps_count = 0 AND logs IS NOT NULL",
      "v_normalized_logs IS DISTINCT FROM v_expected_logs",
      "Database error code: 42501",
      "routine: Some(\"aclcheck_error\")",
      "telemetry recovery object rollback invariants drifted",
      "telemetry recovery legacy terminal EXECUTE ACL drifted",
      "telemetry recovery temporary definer membership survived",
      "telemetry recovery owner, CREATE, or v1 claim state drifted",
      "telemetry recovery production owner ACL invariants drifted",
      "telemetry recovery database guard is not held exactly once",
      "ARRAY['INSERT','SELECT','UPDATE']::TEXT[]",
      "ARRAY['INSERT','SELECT']::TEXT[]",
      "('feed_items', ARRAY['SELECT']::TEXT[])",
      "('source_items', ARRAY['SELECT']::TEXT[])",
    ]) {
      expect(probe).toContain(contract);
    }
    expect(probe).toContain(telemetryOldChecksum);
    expect(probe).toContain(reviewedTelemetryFailureLog);
    expect(probe).not.toContain(telemetryCorrectedChecksum);
    expect(probe).not.toContain("logs ~*");
    expect(probe).not.toContain("ARRAY['DELETE'");
  });

  it("pins each recovery SQL blob and rejects appended authorization text", () => {
    const library = readFileSync(
      "ops/deploy/reader-summary-telemetry-migration-recovery-lib.sh", "utf8",
    );
    for (const [file, variable] of [
      ["reader-summary-telemetry-migration-state.sql", "STATE"],
      ["reader-summary-telemetry-failed-migration-preflight.sql", "PREFLIGHT"],
      ["reader-summary-telemetry-migration-postflight.sql", "POSTFLIGHT"],
    ] as const) {
      const sql = readFileSync(`ops/deploy/${file}`, "utf8");
      const pinned = library.match(new RegExp(
        `READER_SUMMARY_TELEMETRY_${variable}_SHA256=([0-9a-f]{64})`, "u",
      ))?.[1];
      expect(pinned).toBe(digest(sql));
      expect(digest(`${sql}\nERROR: appended unrelated failure`)).not.toBe(pinned);
    }
  });

  it("holds one advisory guard across authorization, resolve, and postflight", () => {
    const source = readFileSync(
      "scripts/lib/reader-summary-telemetry-migration-recovery-postgres.ts", "utf8",
    );
    const acquire = source.indexOf("pg_try_advisory_lock(1936879981, 1502026082)");
    const authorize = source.indexOf(
      "reader-summary-telemetry-failed-migration-preflight.sql",
    );
    const resolve = source.indexOf(
      "resolveRolledBackReaderSummaryMigration(", authorize,
    );
    const postflight = source.indexOf(
      "reader-summary-telemetry-migration-postflight.sql",
    );
    const unlock = source.indexOf("pg_advisory_unlock(1936879981, 1502026082)");
    const positions = [acquire, authorize, resolve, postflight, unlock];
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
    expect(acquire).toBeGreaterThan(-1);
  });
});

const digest = (input: string): string =>
  createHash("sha256").update(input).digest("hex");
