import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  isReviewedTelemetryFailureLog,
  oldReaderSummaryTelemetryMigrationSql,
  reviewedTelemetryFailureLog,
  superviseGuardedTelemetryResolve,
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
      "telemetry recovery function owner, ACL, metadata, or definition drifted",
      "telemetry recovery relevant role membership edges drifted",
      "telemetry recovery schema owner or exact nspacl drifted",
      "telemetry recovery relevant sequence owner, ACL, or default state drifted",
      "telemetry recovery production owner ACL invariants drifted",
      "telemetry recovery database guard is not held exactly once",
      "activity.backend_start = v_guard_backend_start_text::TIMESTAMPTZ",
      "social-monitor/telemetry-recovery-guard/",
      "pg_catalog.pg_get_functiondef(procedure.oid)",
      "5a256df7c312b06182ad56d4100df8c80067a7fd149aa34b4e3862e237502255",
      "edc719fa83b67fa8b4b8b4250614efe055cdd12f210000c778b03214ac90cb4d",
      "ea468303e63270fba8598848dfa8f642df8aad2436c0c1b2a8f57284e817f2b3",
      "ARRAY['INSERT','SELECT','UPDATE']::TEXT[]",
      "ARRAY['INSERT','SELECT']::TEXT[]",
      "('feed_items', ARRAY['SELECT']::TEXT[], 0, 0)",
      "('source_items', ARRAY['SELECT']::TEXT[], 0, 0)",
    ]) {
      expect(probe).toContain(contract);
    }
    expect(probe).toContain(telemetryOldChecksum);
    expect(probe).toContain(reviewedTelemetryFailureLog);
    expect(probe).not.toContain(telemetryCorrectedChecksum);
    expect(probe).not.toContain("logs ~*");
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
    const acquire = source.indexOf("const binding = await acquireGuardBinding");
    const authorize = source.indexOf(
      "reader-summary-telemetry-failed-migration-preflight.sql",
    );
    const resolve = source.indexOf("resolveWithGuardWatchdog({", authorize);
    const postflight = source.indexOf(
      "reader-summary-telemetry-migration-postflight.sql",
    );
    const unlock = source.indexOf("pg_advisory_unlock(1936879981, 1502026082)");
    const positions = [acquire, authorize, resolve, postflight, unlock];
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
    expect(acquire).toBeGreaterThan(-1);
    expect(source).toContain("process.once(signal, handler)");
    expect(source).toContain("signalChildProcessGroup(child.pid, \"SIGTERM\")");
  });

  it("removes only bootstrap CREATE/grant-option residue before old replay", () => {
    const source = readFileSync(
      "scripts/lib/reader-summary-telemetry-migration-recovery-postgres.ts", "utf8",
    );
    const prepare = source.indexOf(
      "await prepareReviewedTelemetryFailureAcl(params.admin)",
    );
    const replay = source.indexOf("const failed = runOrderedReaderSummaryMigrations");
    expect(prepare).toBeGreaterThan(-1);
    expect(replay).toBeGreaterThan(prepare);
    expect(source).toContain(
      "REVOKE GRANT OPTION FOR USAGE ON SCHEMA public FROM SESSION_USER CASCADE",
    );
    expect(source).toContain("GRANT USAGE ON SCHEMA public TO SESSION_USER");
  });

  it("terminates the child and never performs a second mutation on guard loss", async () => {
    for (const phase of ["before", "during", "after"] as const) {
      const child = deferred<{ status: number; stderr: string; stdout: string }>();
      const watchdog = deferred<void>();
      let starts = 0;
      let terminations = 0;
      let verifies = 0;
      const operation = superviseGuardedTelemetryResolve({
        startChild: () => {
          starts += 1;
          return {
            completion: child.promise,
            terminate: async () => {
              terminations += 1;
              child.resolve({ status: 143, stderr: "terminated", stdout: "" });
            },
          };
        },
        verifySameHolder: async () => { verifies += 1; },
        watchdog: watchdog.promise,
        watchdogReady: phase === "before"
          ? Promise.reject(new Error("guard lost before resolve"))
          : Promise.resolve(),
      });
      if (phase === "during") watchdog.reject(new Error("guard lost during resolve"));
      if (phase === "after") {
        child.resolve({ status: 0, stderr: "", stdout: "resolved" });
        watchdog.reject(new Error("guard lost after resolve"));
      }
      await expect(operation).rejects.toThrow(`guard lost ${phase}`);
      expect(starts).toBe(phase === "before" ? 0 : 1);
      expect(terminations).toBe(phase === "before" ? 0 : 1);
      expect(verifies).toBe(0);
    }
  });

  it("verifies the bound holder after exactly one successful child", async () => {
    let starts = 0;
    let verifies = 0;
    await expect(superviseGuardedTelemetryResolve({
      startChild: () => {
        starts += 1;
        return {
          completion: Promise.resolve({ status: 0, stderr: "", stdout: "ok" }),
          terminate: async () => undefined,
        };
      },
      verifySameHolder: async () => { verifies += 1; },
      watchdog: Promise.resolve(),
      watchdogReady: Promise.resolve(),
    })).resolves.toBeUndefined();
    expect(starts).toBe(1);
    expect(verifies).toBe(1);
  });
});

const deferred = <T>(): Readonly<{
  promise: Promise<T>;
  reject(error: Error): void;
  resolve(value: T): void;
}> => {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (error: Error) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, reject: rejectPromise, resolve: resolvePromise };
};

const digest = (input: string): string =>
  createHash("sha256").update(input).digest("hex");
