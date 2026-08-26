import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  oldReaderSummaryTelemetryMigrationSql,
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

  it("pins fail-closed catalog, failure, rollback, and ACL predicates", () => {
    const probe = readFileSync(
      "ops/deploy/reader-summary-telemetry-failed-migration-preflight.sql", "utf8",
    );
    for (const contract of [
      "v_bad_rows <> 0 OR v_rows > 2",
      "v_unfinished <> v_old_unfinished",
      "finished_at IS NULL AND rolled_back_at IS NULL",
      "finished_at IS NULL AND rolled_back_at IS NOT NULL",
      "applied_steps_count = 0 AND logs IS NOT NULL",
      "logs ~* 'permission denied for schema public'",
      "telemetry recovery transaction rollback invariants drifted",
      "telemetry recovery owner or v1 claim invariants drifted",
      "telemetry recovery production owner ACL invariants drifted",
      "reader_summary_daily_function_global_default_acl",
      "ARRAY['INSERT','SELECT','UPDATE']::TEXT[]",
      "ARRAY['INSERT','SELECT']::TEXT[]",
      "('feed_items', ARRAY['SELECT']::TEXT[])",
      "('source_items', ARRAY['SELECT']::TEXT[])",
    ]) {
      expect(probe).toContain(contract);
    }
    expect(probe).toContain(telemetryOldChecksum);
    expect(probe).toContain(telemetryCorrectedChecksum);
    expect(probe).not.toContain("ARRAY['DELETE'");
  });
});

const digest = (input: string): string =>
  createHash("sha256").update(input).digest("hex");
