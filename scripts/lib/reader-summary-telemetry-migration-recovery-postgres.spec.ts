import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

import {
  isReviewedTelemetryFailureLog,
  oldReaderSummaryTelemetryMigrationSql,
  reviewedTelemetryFailureLog,
  signalTelemetryMutationProcessGroup,
  superviseGuardedTelemetryResolve,
  telemetryCorrectedChecksum,
  telemetryOldChecksum,
  waitForTelemetryMutationProcessGroupReaped,
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
      "telemetry recovery complete role membership closure drifted",
      "SELECT count(*) = 14 AND count(*) FILTER (",
      "application_runtime(role_oid) AS (",
      "system_runtime(role_oid) AS (",
      "runtime_provisioner(role_oid) AS (",
      "AND NOT grantor_super AND grantor_createrole",
      "AND member_createrole AND grantor_super",
      "telemetry recovery effective role/object privileges drifted",
      "privilege = 'USAGE' OR role_oid = v_schema_owner",
      "AND count(*) = 7",
      "acl.grantee = 0 AND acl.privilege_type = 'USAGE'",
      "telemetry recovery schema owner or exact nspacl drifted",
      "telemetry recovery relevant sequence owner, ACL, or default state drifted",
      "telemetry recovery production owner ACL invariants drifted",
      "telemetry recovery database guard is not held exactly once",
      "activity.backend_start = v_guard_backend_start_text::TIMESTAMPTZ",
      "social-monitor/telemetry-guard/",
      "pg_catalog.pg_get_functiondef(procedure.oid)",
      "5a256df7c312b06182ad56d4100df8c80067a7fd149aa34b4e3862e237502255",
      "edc719fa83b67fa8b4b8b4250614efe055cdd12f210000c778b03214ac90cb4d",
      "ea468303e63270fba8598848dfa8f642df8aad2436c0c1b2a8f57284e817f2b3",
      "ARRAY['INSERT','SELECT','UPDATE']::TEXT[]",
      "ARRAY['INSERT','SELECT']::TEXT[]",
      "ARRAY['DELETE','INSERT','SELECT','UPDATE']::TEXT[]",
      "('feed_items', ARRAY['SELECT']::TEXT[], 0, 1,",
      "('source_items', ARRAY['SELECT']::TEXT[], 0, 1,",
    ]) {
      expect(probe).toContain(contract);
    }
    expect(probe).toContain(telemetryOldChecksum);
    expect(probe).toContain(reviewedTelemetryFailureLog);
    expect(probe).not.toContain(telemetryCorrectedChecksum);
    expect(probe).not.toContain("logs ~*");
  });

  it("rejects known PostgreSQL 18 structural and reserved-alias regressions", () => {
    const probe = readFileSync(
      "ops/deploy/reader-summary-telemetry-failed-migration-preflight.sql", "utf8",
    );
    const tag = "$reader_summary_telemetry_recovery_authorization$";
    const aclPredicateTerminator =
      "OR acl.privilege_type NOT IN ('SELECT','UPDATE')))))";
    expect(probe.split(aclPredicateTerminator)).toHaveLength(3);
    expect(hasCompletePreflightStructure(probe)).toBe(true);
    expect(hasCompletePreflightStructure(
      probe.replace(aclPredicateTerminator, aclPredicateTerminator.slice(0, -1)),
    )).toBe(false);
    expect(hasCompletePreflightStructure(
      probe.replace(`END;\n${tag};`, `END\n${tag};`),
    )).toBe(false);
    expect(hasPostgres18SafeConstraintAlias(probe)).toBe(true);
    expect(hasPostgres18SafeConstraintAlias(
      probe.replaceAll("constraint_row", "constraint"),
    )).toBe(false);
  });

  it("pins each recovery SQL blob and rejects appended authorization text", () => {
    const library = readFileSync(
      "ops/deploy/reader-summary-telemetry-migration-recovery-lib.sh", "utf8",
    );
    for (const [file, variable] of [
      ["reader-summary-telemetry-migration-state.sql", "STATE"],
      ["reader-summary-telemetry-failed-migration-preflight.sql", "PREFLIGHT"],
      ["reader-summary-telemetry-migration-postflight.sql", "POSTFLIGHT"],
      ["reader-summary-telemetry-recovery-attestation-authorize.sql",
        "ATTESTATION_AUTHORIZE"],
      ["reader-summary-telemetry-recovery-attestation-complete.sql",
        "ATTESTATION_COMPLETE"],
      ["reader-summary-telemetry-recovery-attestation-verify.sql",
        "ATTESTATION_VERIFY"],
    ] as const) {
      const sql = readFileSync(`ops/deploy/${file}`, "utf8");
      const pinned = library.match(new RegExp(
        `READER_SUMMARY_TELEMETRY_${variable}_SHA256=([0-9a-f]{64})`, "u",
      ))?.[1];
      expect(pinned).toBe(digest(sql));
      expect(digest(`${sql}\nERROR: appended unrelated failure`)).not.toBe(pinned);
    }
  });

  it("pins durable one-time receipt and continuous mutation-lease monitoring",
    () => {
      const source = readFileSync(
        "scripts/lib/reader-summary-telemetry-migration-recovery-postgres.ts",
        "utf8",
      );
      const postgresGate = readFileSync(
        "scripts/check-reader-summary-daily-terminal-authority-postgres.ts",
        "utf8",
      );
      const authorization = readFileSync(
        "ops/deploy/reader-summary-telemetry-recovery-attestation-authorize.sql",
        "utf8",
      );
      const verification = readFileSync(
        "ops/deploy/reader-summary-telemetry-recovery-attestation-verify.sql",
        "utf8",
      );
      expect(source).toContain("1502026084");
      expect(source).toContain("v_mutation_count");
      expect(source).toContain("v_recovery_backend_count");
      expect(source).not.toContain("v_quiet_ticks");
      expect(source).toContain(
        "1936879981, 1502026084\n        ) AS acquired",
      );
      expect(source).not.toContain(
        "AND pg_catalog.pg_try_advisory_lock(1936879981, 1502026084)",
      );
      expect(source).toContain("mutationRow?.acquired === true");
      expect(postgresGate).toContain(
        'ALTER TABLE public."_prisma_migrations" OWNER TO ${privileges.quotePostgresIdentifier(migrationAdminRole)}',
      );
      expect(source).toContain("assertCompletedAttestationIsImmutable");
      expect(source).toContain("missing runtime inheritance membership");
      expect(source).toContain("runtime inheritance membership option drift");
      expect(source).toContain("extra role membership edge");
      expect(source).toContain("missing schema PUBLIC usage ACL");
      expect(source).toContain("missing application runtime table ACL");
      expect(source).toContain("extra application runtime table ACL");
      expect(source).toContain("missing publication capability column ACL");
      expect(source).toContain("extra publication capability column ACL");
      expect(source).toContain(
        "GRANT %I TO %I WITH INHERIT FALSE GRANTED BY CURRENT_USER",
      );
      expect(source).toContain("completed telemetry recovery attestation accepted a replay transition");
      expect(source).toContain("ordinary deployment identity accepted attestation");
      expect(source).toContain('INSERT INTO public."_prisma_migrations"');
      expect(source).toContain("isExactHistoricalTelemetryFailure");
      expect(source).toContain(
        "PL/pgSQL function inline_code_block line 43 at EXECUTE",
      );
      expect(source).not.toMatch(
        /(?:UPDATE|DELETE FROM) public\."_prisma_migrations"/u,
      );
      expect(authorization).toContain(
        "social_monitor_telemetry_recovery_attestor",
      );
      expect(authorization).toContain(
        "social_monitor_telemetry_recovery.read_attestation()",
      );
      expect(authorization).toContain(
        "activity.backend_start = v_guard_start::TIMESTAMPTZ",
      );
      expect(authorization).toContain("activity.usename = session_user");
      expect(authorization).toContain(
        "activity.application_name = v_guard_application",
      );
      expect(authorization.split(
        "activity.backend_start = v_guard_start::TIMESTAMPTZ",
      )).toHaveLength(2);
      expect(authorization.split(
        "lock.pid = v_guard_pid::INTEGER",
      )).toHaveLength(3);
      expect(authorization).toContain(
        "SECURITY DEFINER changes current_user to the NOLOGIN attestor on PG18",
      );
      expect(authorization).toContain(
        "pg_has_role(v_session, v_database_owner, 'SET')",
      );
      expect(authorization).toContain(
        "format('SET LOCAL ROLE %I', v_database_owner)",
      );
      expect(authorization).toContain(
        "'REVOKE CREATE ON DATABASE %I FROM %I'",
      );
      expect(authorization).toContain("WHERE migration_name = v_name AND state = 'AUTHORIZED'");
      expect(authorization).toContain("WHERE migration_name = v_name AND state = 'RESOLVED'");
      expect(verification).toContain("attestation multiplicity is invalid");
      expect(verification).toContain("receipt_sha256");
      expect(verification).toContain("database_oid");
      expect(verification).toContain("jsonb_populate_record");
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
    expect(source).toContain(
      "signalTelemetryMutationProcessGroup(child.pid, \"SIGTERM\")",
    );
    expect(source).toContain("if (processGroupReaped) return");
    expect(source).not.toContain("if (child.exitCode !== null) return");
  });

  it("removes only bootstrap CREATE/grant-option residue before old replay", () => {
    const source = readFileSync(
      "scripts/lib/reader-summary-telemetry-migration-recovery-postgres.ts", "utf8",
    );
    const prepare = source.indexOf(
      "await prepareReviewedTelemetryFailureAcl(params.admin)",
    );
    const replay = source.indexOf(
      "await params.admin.query(oldReaderSummaryTelemetryMigrationSql(corrected))",
    );
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
        finishWatchdogAfterChild: async () => undefined,
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
    const watchdog = deferred<void>();
    await expect(superviseGuardedTelemetryResolve({
      finishWatchdogAfterChild: async () => { watchdog.resolve(); },
      startChild: () => {
        starts += 1;
        return {
          completion: Promise.resolve({ status: 0, stderr: "", stdout: "ok" }),
          terminate: async () => undefined,
        };
      },
      verifySameHolder: async () => { verifies += 1; },
      watchdog: watchdog.promise,
      watchdogReady: Promise.resolve(),
    })).resolves.toBeUndefined();
    expect(starts).toBe(1);
    expect(verifies).toBe(1);
  });

  it("forbids early watchdog success while the child or process group is alive",
    async () => {
      const child = deferred<{
        status: number;
        stderr: string;
        stdout: string;
      }>();
      let terminations = 0;
      await expect(superviseGuardedTelemetryResolve({
        finishWatchdogAfterChild: async () => undefined,
        startChild: () => ({
          completion: child.promise,
          terminate: async () => {
            terminations += 1;
            child.resolve({ status: 143, stderr: "terminated", stdout: "" });
          },
        }),
        verifySameHolder: async () => undefined,
        watchdog: Promise.resolve(),
        watchdogReady: Promise.resolve(),
      })).rejects.toThrow("watchdog ended before Prisma resolve");
      expect(terminations).toBe(1);
    });

  it.each(["delayed reconnect", "quiet gap"])(
    "keeps monitoring a %s until the child is definitively reaped",
    async () => {
      const child = deferred<{
        status: number;
        stderr: string;
        stdout: string;
      }>();
      const watchdog = deferred<void>();
      let settled = false;
      const operation = superviseGuardedTelemetryResolve({
        finishWatchdogAfterChild: async () => { watchdog.resolve(); },
        startChild: () => ({
          completion: child.promise,
          terminate: async () => undefined,
        }),
        verifySameHolder: async () => undefined,
        watchdog: watchdog.promise,
        watchdogReady: Promise.resolve(),
      }).finally(() => { settled = true; });
      await Promise.resolve();
      await Promise.resolve();
      expect(settled).toBe(false);
      child.resolve({ status: 0, stderr: "", stdout: "resolved" });
      await expect(operation).resolves.toBeUndefined();
    },
  );

  it.each(["second backend", "boundary race"])(
    "terminates exactly one mutation on %s watchdog failure",
    async (failure) => {
      const child = deferred<{
        status: number;
        stderr: string;
        stdout: string;
      }>();
      const watchdog = deferred<void>();
      let starts = 0;
      let terminations = 0;
      const operation = superviseGuardedTelemetryResolve({
        finishWatchdogAfterChild: async () => undefined,
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
        verifySameHolder: async () => undefined,
        watchdog: watchdog.promise,
        watchdogReady: Promise.resolve(),
      });
      if (failure === "boundary race") {
        child.resolve({ status: 0, stderr: "", stdout: "resolved" });
        await Promise.resolve();
      }
      watchdog.reject(new Error(failure));
      await expect(operation).rejects.toThrow(failure);
      expect(starts).toBe(1);
      expect(terminations).toBe(1);
    },
  );

  it("terminates descendants even after the process-group leader exits",
    async () => {
      if (process.platform === "win32") return;
      const child = spawn("/bin/sh", [
        "-c", "sleep 30 </dev/null >/dev/null 2>&1 & exit 0",
      ], { detached: true, stdio: "ignore" });
      const pid = child.pid;
      expect(pid).toBeDefined();
      await new Promise<void>((resolve, reject) => {
        child.once("error", reject);
        child.once("close", () => resolve());
      });
      let reaped = false;
      const completion = waitForTelemetryMutationProcessGroupReaped(pid)
        .then(() => { reaped = true; });
      await new Promise((resolve) => setTimeout(resolve, 25));
      expect(reaped).toBe(false);
      let timeout: NodeJS.Timeout | undefined;
      try {
        signalTelemetryMutationProcessGroup(pid, "SIGTERM");
        await Promise.race([
          completion,
          new Promise<never>((_resolve, reject) => {
            timeout = setTimeout(() => reject(new Error(
              "descendant process group was not reaped",
            )), 2_000);
          }),
        ]);
      } finally {
        if (timeout !== undefined) clearTimeout(timeout);
        signalTelemetryMutationProcessGroup(pid, "SIGKILL");
      }
      expect(reaped).toBe(true);
    }, 5_000);
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

const hasCompletePreflightStructure = (sql: string): boolean => {
  const tag = "$reader_summary_telemetry_recovery_authorization$";
  const fragments = sql.split(tag);
  const body = fragments[1];
  if (fragments.length !== 3 || body === undefined || !/END;\s*$/u.test(body)) {
    return false;
  }
  const code = body
    .replace(/\$([a-z_][a-z_0-9]*)\$[\s\S]*?\$\1\$/giu, "")
    .replace(/--[^\n]*/gu, "")
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/'(?:''|[^'])*'/gu, "")
    .replace(/"(?:""|[^"])*"/gu, "");
  let depth = 0;
  for (const character of code) {
    if (character === "(") depth += 1;
    if (character === ")" && --depth < 0) return false;
  }
  return depth === 0;
};

const hasPostgres18SafeConstraintAlias = (sql: string): boolean =>
  sql.includes("FROM pg_catalog.pg_constraint AS constraint_row") &&
  sql.includes("WHERE constraint_row.conname") &&
  !sql.includes("AS constraint\n");
