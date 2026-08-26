import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { Pool } from "pg";

import {
  applyOrderedReaderSummaryMigrations,
  type ReaderSummaryPublicationMigrationWorkspace,
  runOrderedReaderSummaryMigrations,
} from "./reader-summary-publication-postgres-migrations";
import {
  classifyReaderSummaryTelemetryMigrationHistory,
  isReviewedTelemetryFailureLog,
  type ReaderSummaryTelemetryMigrationRow,
  readerSummaryTelemetryCorrectedChecksum,
  readerSummaryTelemetryMigration,
  readerSummaryTelemetryOldChecksum,
  reviewedTelemetryFailureLog,
} from "./reader-summary-telemetry-migration-history";

type QueryClient = Readonly<{
  query<TRow extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    values?: readonly unknown[],
  ): Promise<Readonly<{ rows: readonly TRow[] }>>;
}>;

export const telemetryMigration = readerSummaryTelemetryMigration;
export const telemetryOldChecksum = readerSummaryTelemetryOldChecksum;
export const telemetryCorrectedChecksum = readerSummaryTelemetryCorrectedChecksum;
export { isReviewedTelemetryFailureLog, reviewedTelemetryFailureLog };

const temporaryCreateProfile = `  v_owner_had_schema_create := pg_catalog.has_schema_privilege(
    v_owner_oid, 'public', 'CREATE'
  );
  IF NOT v_owner_had_schema_create THEN
    EXECUTE 'SET LOCAL ROLE social_monitor_public_schema_owner';
    EXECUTE pg_catalog.format(
      'GRANT CREATE ON SCHEMA public TO %I GRANTED BY CURRENT_USER',
      v_owner_name
    );
  END IF;
  EXECUTE pg_catalog.format('SET LOCAL ROLE %I', v_owner_name);
  EXECUTE pg_catalog.replace(
    pg_catalog.replace(v_definition, v_version_from, v_version_to),
    v_effort_from,
    v_effort_to
  );
  IF NOT v_owner_had_schema_create THEN
    EXECUTE 'SET LOCAL ROLE social_monitor_public_schema_owner';
    EXECUTE pg_catalog.format(
      'REVOKE CREATE ON SCHEMA public FROM %I GRANTED BY CURRENT_USER',
      v_owner_name
    );
  END IF;`;
const oldProfile = `  EXECUTE pg_catalog.replace(
    pg_catalog.replace(v_definition, v_version_from, v_version_to),
    v_effort_from,
    v_effort_to
  );`;
const profileValidation = "  IF (pg_catalog.length(v_definition)";
const oldProfileValidation =
  "  EXECUTE pg_catalog.format('SET LOCAL ROLE %I', v_owner_name);\n" +
  profileValidation;
const correctedFinalRevoke = `SET LOCAL ROLE social_monitor_public_schema_owner;
REVOKE CREATE ON SCHEMA public
  FROM social_monitor_reader_summary_daily_publication_definer;
RESET ROLE;
`;
const definerHandoff = `) OWNER TO social_monitor_reader_summary_daily_publication_definer;
SET LOCAL ROLE social_monitor_reader_summary_daily_publication_definer;`;
const oldDefinerHandoff = `) OWNER TO social_monitor_reader_summary_daily_publication_definer;
REVOKE CREATE ON SCHEMA public
  FROM social_monitor_reader_summary_daily_publication_definer;
SET LOCAL ROLE social_monitor_reader_summary_daily_publication_definer;`;

export const oldReaderSummaryTelemetryMigrationSql = (
  corrected: string,
): string => {
  assert(hash(corrected) === telemetryCorrectedChecksum,
    "telemetry recovery fixture requires the exact corrected migration");
  assert(count(corrected, "  v_owner_had_schema_create BOOLEAN;\n") === 2 &&
    count(corrected, temporaryCreateProfile) === 2 &&
    count(corrected, profileValidation) === 2 &&
    count(corrected, correctedFinalRevoke) === 1 &&
    count(corrected, definerHandoff) === 1,
  "corrected telemetry migration no longer matches the reviewed inverse patch");
  const old = corrected
    .replaceAll("  v_owner_had_schema_create BOOLEAN;\n", "")
    .replaceAll(temporaryCreateProfile, oldProfile)
    .replaceAll(profileValidation, oldProfileValidation)
    .replace(correctedFinalRevoke, "")
    .replace(definerHandoff, oldDefinerHandoff);
  assert(hash(old) === telemetryOldChecksum,
    "derived telemetry migration does not match the exact old checksum");
  return old;
};

export const runReaderSummaryTelemetryMigrationRecoveryPostgres18 = async (
  params: Readonly<{
    adminDatabaseUrl: string;
    defaultAclMigration: string;
    workspace: ReaderSummaryPublicationMigrationWorkspace;
  }>,
): Promise<void> => {
  const pool = new Pool({ connectionString: params.adminDatabaseUrl, max: 1 });
  const admin = await pool.connect();
  try {
    await runRecoveryWithAdmin({ ...params, admin });
  } finally {
    admin.release();
    await pool.end();
  }
};

const runRecoveryWithAdmin = async (
  params: Readonly<{
    admin: QueryClient;
    adminDatabaseUrl: string;
    defaultAclMigration: string;
    workspace: ReaderSummaryPublicationMigrationWorkspace;
  }>,
): Promise<void> => {
  const target = join(params.workspace.directory, "migrations", telemetryMigration);
  cpSync(join("prisma/migrations", telemetryMigration), target, { recursive: true });
  cpSync(join("prisma/migrations", params.defaultAclMigration),
    join(params.workspace.directory, "migrations", params.defaultAclMigration),
    { recursive: true });
  const corrected = readFileSync(join(target, "migration.sql"), "utf8");
  writeFileSync(join(target, "migration.sql"),
    oldReaderSummaryTelemetryMigrationSql(corrected));
  await prepareReviewedTelemetryFailureAcl(params.admin);

  const failed = runOrderedReaderSummaryMigrations(
    params.adminDatabaseUrl, params.workspace,
  );
  const failedOutput = `${failed.stdout}${failed.stderr}`;
  assert(failed.status !== 0 &&
    failedOutput.includes("permission denied for schema public"),
  "old telemetry migration must fail at its reviewed schema permission boundary");
  const failedRow = await params.admin.query<ReaderSummaryTelemetryMigrationRow>(
    `SELECT id, checksum, started_at, finished_at, rolled_back_at,
      applied_steps_count, logs
    FROM public."_prisma_migrations" WHERE migration_name = $1`,
    [telemetryMigration],
  );
  assert(classifyReaderSummaryTelemetryMigrationHistory(failedRow.rows) ===
    "recovery-required",
  "old telemetry migration must retain the exact reviewed Prisma failure row");
  const blocked = runOrderedReaderSummaryMigrations(
    params.adminDatabaseUrl, params.workspace,
  );
  assert(blocked.status !== 0 &&
    `${blocked.stdout}${blocked.stderr}`.includes("P3009"),
  "unfinished old telemetry migration must block Prisma with P3009");

  const guardPool = new Pool({
    connectionString: params.adminDatabaseUrl,
    max: 1,
  });
  const guard = await guardPool.connect();
  try {
    const binding = await acquireGuardBinding(guard);
    await bindGuardExpectation(params.admin, binding);
    assert(await recoveryProbe(params.admin,
      "reader-summary-telemetry-failed-migration-preflight.sql") === "authorized",
    "bounded telemetry recovery did not authorize the exact unfinished old row");
    await assertCatalogMutationsAreRejected(params.admin);
    assert(await recoveryProbe(params.admin,
      "reader-summary-telemetry-failed-migration-preflight.sql") === "authorized",
    "telemetry recovery catalog mutation fixtures did not roll back exactly");
    await resolveWithGuardWatchdog({
      admin: params.admin,
      adminDatabaseUrl: params.adminDatabaseUrl,
      binding,
      workspace: params.workspace,
    });
    assert(await recoveryProbe(params.admin,
      "reader-summary-telemetry-migration-postflight.sql") === "resolved",
    "bounded telemetry recovery did not prove the exact rollback marker under guard");
    await assertSameGuardHolder(guard, binding);
  } finally {
    await guard.query(
      "SELECT pg_advisory_unlock(1936879981, 1502026082)",
    ).catch(() => undefined);
    guard.release();
    await guardPool.end();
  }
  writeFileSync(join(target, "migration.sql"), corrected);
  applyOrderedReaderSummaryMigrations(params.adminDatabaseUrl, params.workspace);

  const rows = await params.admin.query<ReaderSummaryTelemetryMigrationRow>(
    `SELECT id, checksum, started_at, finished_at, rolled_back_at,
      applied_steps_count, logs
    FROM public."_prisma_migrations" WHERE migration_name = $1
    ORDER BY started_at, id`, [telemetryMigration],
  );
  assert(classifyReaderSummaryTelemetryMigrationHistory(rows.rows) === "recovered",
  "corrected telemetry retry did not preserve exact Prisma recovery history");
};

const prepareReviewedTelemetryFailureAcl = async (
  admin: QueryClient,
): Promise<void> => {
  await admin.query(`BEGIN;
    SET LOCAL ROLE social_monitor_public_schema_owner;
    REVOKE CREATE ON SCHEMA public FROM
      SESSION_USER,
      PUBLIC,
      social_monitor_reader_summary_publication_owner,
      social_monitor_reader_summary_publication_runtime,
      social_monitor_tenant_system_runtime,
      social_monitor_reader_summary_daily_terminal,
      social_monitor_reader_summary_daily_publication_definer;
    REVOKE GRANT OPTION FOR USAGE ON SCHEMA public FROM SESSION_USER CASCADE;
    GRANT USAGE ON SCHEMA public TO SESSION_USER;
    RESET ROLE;
    COMMIT`);
};

const catalogMutations = [
  ["schema owner", `DO $schema_owner_drift$
    DECLARE v_database_owner NAME; BEGIN
      SELECT pg_catalog.pg_get_userbyid(database.datdba)
        INTO STRICT v_database_owner FROM pg_catalog.pg_database AS database
        WHERE database.datname = pg_catalog.current_database();
      EXECUTE pg_catalog.format('GRANT %I TO social_monitor_public_schema_owner '
        'WITH ADMIN FALSE, INHERIT FALSE, SET TRUE GRANTED BY CURRENT_USER',
        v_database_owner);
      EXECUTE 'SET LOCAL ROLE social_monitor_public_schema_owner';
      EXECUTE pg_catalog.format('ALTER SCHEMA public OWNER TO %I',
        v_database_owner);
      EXECUTE 'RESET ROLE';
      EXECUTE pg_catalog.format('REVOKE %I FROM '
        'social_monitor_public_schema_owner GRANTED BY CURRENT_USER',
        v_database_owner);
    END $schema_owner_drift$`],
  ["schema PUBLIC ACL", `SET LOCAL ROLE social_monitor_public_schema_owner;
    GRANT CREATE ON SCHEMA public TO PUBLIC; RESET ROLE`],
  ["table owner", `DO $table_owner_drift$
    DECLARE v_database_owner NAME; BEGIN
      SELECT pg_catalog.pg_get_userbyid(database.datdba)
        INTO STRICT v_database_owner FROM pg_catalog.pg_database AS database
        WHERE database.datname = pg_catalog.current_database();
      EXECUTE pg_catalog.format('GRANT %I TO social_monitor_public_schema_owner '
        'WITH ADMIN FALSE, INHERIT FALSE, SET TRUE GRANTED BY CURRENT_USER',
        v_database_owner);
      EXECUTE 'SET LOCAL ROLE social_monitor_public_schema_owner';
      EXECUTE pg_catalog.format('GRANT CREATE ON SCHEMA public TO %I',
        v_database_owner);
      EXECUTE pg_catalog.format(
        'ALTER TABLE public.reader_summary_daily_model_jobs OWNER TO %I',
        v_database_owner);
      EXECUTE pg_catalog.format('REVOKE CREATE ON SCHEMA public FROM %I',
        v_database_owner);
      EXECUTE 'RESET ROLE';
      EXECUTE pg_catalog.format('REVOKE %I FROM '
        'social_monitor_public_schema_owner GRANTED BY CURRENT_USER',
        v_database_owner);
    END $table_owner_drift$`],
  ["table PUBLIC ACL", `SET LOCAL ROLE social_monitor_public_schema_owner;
    GRANT SELECT ON TABLE public.reader_summary_daily_model_jobs TO PUBLIC;
    RESET ROLE`],
  ["table unrelated ACL", `SET LOCAL ROLE social_monitor_public_schema_owner;
    GRANT SELECT ON TABLE public.reader_summary_daily_model_jobs
      TO social_monitor_reader_summary_daily_terminal; RESET ROLE`],
  ["sequence owner and PUBLIC ACL", `SET LOCAL ROLE social_monitor_public_schema_owner;
    CREATE SEQUENCE public.reader_summary_daily_model_jobs_token_sequence;
    GRANT USAGE ON SEQUENCE
      public.reader_summary_daily_model_jobs_token_sequence TO PUBLIC;
    RESET ROLE`],
  ["function definition", `SET LOCAL ROLE social_monitor_public_schema_owner;
    GRANT CREATE ON SCHEMA public TO SESSION_USER; RESET ROLE;
    DO $definition_drift$ DECLARE v_definition TEXT; BEGIN
      SELECT pg_catalog.pg_get_functiondef(
        'public.claim_reader_summary_daily_execution(uuid,uuid,text,date,timestamp with time zone)'::pg_catalog.regprocedure
      ) INTO STRICT v_definition;
      v_definition := pg_catalog.replace(v_definition,
        'daily execution worker id is required',
        'daily execution worker id is required (drift)');
      EXECUTE v_definition;
    END $definition_drift$;
    SET LOCAL ROLE social_monitor_public_schema_owner;
    REVOKE CREATE ON SCHEMA public FROM SESSION_USER; RESET ROLE`],
  ["function owner", `ALTER FUNCTION
      public.claim_reader_summary_daily_execution(
        UUID, UUID, TEXT, DATE, TIMESTAMPTZ
      ) OWNER TO social_monitor_public_schema_owner`],
  ["function PUBLIC ACL", `GRANT EXECUTE ON FUNCTION
      public.claim_reader_summary_daily_execution(
        UUID, UUID, TEXT, DATE, TIMESTAMPTZ
      ) TO PUBLIC`],
  ["role membership", `GRANT
      social_monitor_reader_summary_daily_publication_definer
      TO social_monitor_public_schema_owner
      WITH ADMIN FALSE, INHERIT FALSE, SET TRUE GRANTED BY CURRENT_USER`],
] as const;

const assertCatalogMutationsAreRejected = async (
  admin: QueryClient,
): Promise<void> => {
  for (const [label, mutation] of catalogMutations) {
    await admin.query("BEGIN");
    try {
      await admin.query(mutation);
      let rejected = false;
      try {
        await recoveryProbe(
          admin, "reader-summary-telemetry-failed-migration-preflight.sql",
        );
      } catch {
        rejected = true;
      }
      assert(rejected, `telemetry recovery accepted ${label} drift`);
    } finally {
      await admin.query("ROLLBACK").catch(() => undefined);
    }
  }
};

type GuardBinding = Readonly<{
  applicationName: string;
  backendPid: number;
  backendStartedAt: string;
  nonce: string;
}>;

type ResolveResult = Readonly<{
  status: number | null;
  stderr: string;
  stdout: string;
}>;

type ResolveChild = Readonly<{
  completion: Promise<ResolveResult>;
  terminate(): Promise<void>;
}>;

export const superviseGuardedTelemetryResolve = async (operations: Readonly<{
  startChild(): ResolveChild;
  verifySameHolder(): Promise<void>;
  watchdog: Promise<void>;
  watchdogReady: Promise<void>;
}>): Promise<void> => {
  await operations.watchdogReady;
  const child = operations.startChild();
  try {
    const first = await Promise.race([
      child.completion.then((result) => ({ kind: "child" as const, result })),
      operations.watchdog.then(() => ({ kind: "watchdog" as const })),
    ]);
    assert(first.kind === "child",
      "telemetry recovery watchdog ended before Prisma resolve");
    await operations.watchdog;
    await operations.verifySameHolder();
    assert(first.result.status === 0,
      `failed migration resolution was rejected: ${first.result.stderr}`);
  } catch (error: unknown) {
    await child.terminate();
    throw error;
  }
};

const acquireGuardBinding = async (
  guard: QueryClient,
): Promise<GuardBinding> => {
  const nonce = randomBytes(12).toString("hex");
  const applicationName = `social-monitor/telemetry-recovery-guard/${nonce}`;
  const acquired = await guard.query<{
    acquired: boolean;
    backend_pid: number;
    backend_started_at: string;
  }>(`SELECT pg_catalog.pg_try_advisory_lock(
        1936879981, 1502026082
      ) AS acquired,
      pg_catalog.pg_backend_pid() AS backend_pid,
      activity.backend_start::TEXT AS backend_started_at
    FROM pg_catalog.pg_stat_activity AS activity
    WHERE activity.pid = pg_catalog.pg_backend_pid()
      AND pg_catalog.set_config('application_name', $1, false) = $1`,
  [applicationName]);
  const row = acquired.rows[0];
  assert(row?.acquired === true && Number.isInteger(row.backend_pid) &&
    typeof row.backend_started_at === "string",
  "telemetry recovery PG18 fixture could not bind its database guard");
  return {
    applicationName,
    backendPid: row.backend_pid,
    backendStartedAt: row.backend_started_at,
    nonce,
  };
};

const bindGuardExpectation = async (
  admin: QueryClient,
  binding: GuardBinding,
): Promise<void> => {
  const result = await admin.query<{ bound: boolean }>(`SELECT
      pg_catalog.set_config(
        'social_monitor.telemetry_guard_pid', $1, false
      ) = $1
      AND pg_catalog.set_config(
        'social_monitor.telemetry_guard_backend_start', $2, false
      ) = $2
      AND pg_catalog.set_config(
        'social_monitor.telemetry_guard_application', $3, false
      ) = $3
      AND pg_catalog.set_config(
        'social_monitor.telemetry_guard_nonce', $4, false
      ) = $4 AS bound`, [
    String(binding.backendPid), binding.backendStartedAt,
    binding.applicationName, binding.nonce,
  ]);
  assert(result.rows[0]?.bound === true,
    "telemetry recovery could not bind its authorization session to the guard");
};

const resolveWithGuardWatchdog = async (params: Readonly<{
  admin: QueryClient;
  adminDatabaseUrl: string;
  binding: GuardBinding;
  workspace: ReaderSummaryPublicationMigrationWorkspace;
}>): Promise<void> => {
  const resolverApplication =
    `social-monitor/telemetry-recovery-resolve/${params.binding.nonce}`;
  const watcherPool = new Pool({
    connectionString: params.adminDatabaseUrl,
    max: 1,
  });
  const watcher = await watcherPool.connect();
  try {
    const watcherIdentity = await watcher.query<{ pid: number }>(
      "SELECT pg_catalog.pg_backend_pid() AS pid",
    );
    const watcherPid = watcherIdentity.rows[0]?.pid;
    assert(Number.isInteger(watcherPid),
      "telemetry recovery watchdog has no exact backend identity");
    const watchdog = watcher.query(watchdogSql(
      params.binding, resolverApplication,
    )).then(() => undefined);
    const ready = Promise.race([
      waitForWatchdogReady(params.admin, watcherPid as number),
      watchdog.then(() => {
        throw new Error("telemetry recovery watchdog ended before readiness");
      }),
    ]);
    await superviseGuardedTelemetryResolve({
      startChild: () => startPrismaResolve({
        adminDatabaseUrl: params.adminDatabaseUrl,
        resolverApplication,
        workspace: params.workspace,
      }),
      verifySameHolder: () => assertBoundGuardFromAdmin(
        params.admin, params.binding,
      ),
      watchdog,
      watchdogReady: ready,
    });
  } finally {
    watcher.release();
    await watcherPool.end();
  }
};

const watchdogSql = (
  binding: GuardBinding,
  resolverApplication: string,
): string => `DO $telemetry_guard_watchdog$
DECLARE
  v_holder_count BIGINT;
  v_resolver_count BIGINT;
  v_resolver_seen BOOLEAN := FALSE;
  v_quiet_ticks INTEGER := 0;
  v_started_at TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(1936879981, 1502026083);
  LOOP
    PERFORM pg_catalog.pg_stat_clear_snapshot();
    SELECT count(*) INTO STRICT v_holder_count
    FROM pg_catalog.pg_locks AS lock
    JOIN pg_catalog.pg_stat_activity AS activity ON activity.pid = lock.pid
    WHERE lock.locktype = 'advisory'
      AND lock.classid = 1936879981::OID
      AND lock.objid = 1502026082::OID AND lock.objsubid = 2
      AND lock.granted AND lock.pid = ${binding.backendPid}
      AND activity.backend_start = ${quoteLiteral(binding.backendStartedAt)}::TIMESTAMPTZ
      AND activity.application_name = ${quoteLiteral(binding.applicationName)};
    SELECT count(*) INTO STRICT v_resolver_count
    FROM pg_catalog.pg_stat_activity AS activity
    WHERE activity.datname = pg_catalog.current_database()
      AND activity.application_name = ${quoteLiteral(resolverApplication)};
    IF v_holder_count <> 1 OR (SELECT count(*) FROM pg_catalog.pg_locks AS lock
      WHERE lock.locktype = 'advisory'
        AND lock.classid = 1936879981::OID
        AND lock.objid = 1502026082::OID AND lock.objsubid = 2
        AND lock.granted) <> 1 THEN
      PERFORM pg_catalog.pg_terminate_backend(activity.pid)
      FROM pg_catalog.pg_stat_activity AS activity
      WHERE activity.datname = pg_catalog.current_database()
        AND activity.application_name = ${quoteLiteral(resolverApplication)};
      RAISE EXCEPTION 'telemetry recovery guard lost; resolver backends terminated';
    END IF;
    IF v_resolver_count > 0 THEN
      v_resolver_seen := TRUE;
      v_quiet_ticks := 0;
    ELSIF v_resolver_seen THEN
      v_quiet_ticks := v_quiet_ticks + 1;
      IF v_quiet_ticks >= 5 THEN RETURN; END IF;
    ELSIF pg_catalog.clock_timestamp() > v_started_at + INTERVAL '10 seconds' THEN
      RAISE EXCEPTION 'telemetry recovery resolver backend was never observed';
    END IF;
    PERFORM pg_catalog.pg_sleep(0.001);
  END LOOP;
END
$telemetry_guard_watchdog$;`;

const waitForWatchdogReady = async (
  admin: QueryClient,
  watcherPid: number,
): Promise<void> => {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const result = await admin.query<{ ready: boolean }>(`SELECT EXISTS (
        SELECT 1 FROM pg_catalog.pg_locks AS lock
        WHERE lock.locktype = 'advisory' AND lock.classid = 1936879981::OID
          AND lock.objid = 1502026083::OID AND lock.objsubid = 2
          AND lock.pid = $1 AND lock.granted
      ) AS ready`, [watcherPid]);
    if (result.rows[0]?.ready === true) return;
    await delay(10);
  }
  throw new Error("telemetry recovery watchdog readiness timed out");
};

const startPrismaResolve = (params: Readonly<{
  adminDatabaseUrl: string;
  resolverApplication: string;
  workspace: ReaderSummaryPublicationMigrationWorkspace;
}>): ResolveChild => {
  const databaseUrl = new URL(params.adminDatabaseUrl);
  databaseUrl.searchParams.set("application_name", params.resolverApplication);
  const child = spawn(process.platform === "win32" ? "prisma.cmd" : "prisma", [
    "migrate", "resolve", "--rolled-back", telemetryMigration,
    "--config", "scripts/reader-summary-publication-prisma.config.ts",
  ], {
    detached: process.platform !== "win32",
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl.toString(),
      JITI_FS_CACHE: "false",
      READER_SUMMARY_PUBLICATION_TEST_MIGRATIONS_PATH: join(
        dirname(params.workspace.schemaPath), "migrations",
      ),
      READER_SUMMARY_PUBLICATION_TEST_SCHEMA_PATH: params.workspace.schemaPath,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  let stdout = "";
  child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
  child.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
  const completion = new Promise<ResolveResult>((resolve) => {
    child.once("error", (error) => resolve({
      status: null, stderr: `${stderr}${error.message}`, stdout,
    }));
    child.once("close", (status) => resolve({ status, stderr, stdout }));
  });
  const signalHandlers = new Map<NodeJS.Signals, () => void>();
  const removeSignalHandlers = (): void => {
    for (const [signal, handler] of signalHandlers) {
      process.removeListener(signal, handler);
    }
    signalHandlers.clear();
  };
  for (const signal of ["SIGHUP", "SIGINT", "SIGTERM"] as const) {
    const handler = (): void => {
      try {
        signalChildProcessGroup(child.pid, "SIGTERM");
      } finally {
        removeSignalHandlers();
        process.kill(process.pid, signal);
      }
    };
    signalHandlers.set(signal, handler);
    process.once(signal, handler);
  }
  void completion.then(removeSignalHandlers);
  return {
    completion,
    terminate: async () => {
      if (child.exitCode !== null) return;
      signalChildProcessGroup(child.pid, "SIGTERM");
      await Promise.race([completion, delay(250)]);
      if (child.exitCode === null) signalChildProcessGroup(child.pid, "SIGKILL");
      await completion;
    },
  };
};

const signalChildProcessGroup = (
  pid: number | undefined,
  signal: NodeJS.Signals,
): void => {
  if (pid === undefined) return;
  try {
    process.kill(process.platform === "win32" ? pid : -pid, signal);
  } catch (error: unknown) {
    if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) {
      throw error;
    }
  }
};

const assertBoundGuardFromAdmin = async (
  admin: QueryClient,
  binding: GuardBinding,
): Promise<void> => {
  const result = await admin.query<{ exact: boolean }>(`SELECT
      count(*) = 1 AND count(*) FILTER (
        WHERE lock.pid = $1 AND activity.backend_start = $2::TIMESTAMPTZ
          AND activity.application_name = $3
      ) = 1 AS exact
    FROM pg_catalog.pg_locks AS lock
    JOIN pg_catalog.pg_stat_activity AS activity ON activity.pid = lock.pid
    WHERE lock.locktype = 'advisory' AND lock.classid = 1936879981::OID
      AND lock.objid = 1502026082::OID AND lock.objsubid = 2
      AND lock.granted`, [
    binding.backendPid, binding.backendStartedAt, binding.applicationName,
  ]);
  assert(result.rows[0]?.exact === true,
    "telemetry recovery exact guard holder changed during resolve");
};

const assertSameGuardHolder = async (
  guard: QueryClient,
  binding: GuardBinding,
): Promise<void> => {
  const result = await guard.query<{ exact: boolean }>(`SELECT
      pg_catalog.pg_backend_pid() = $1
      AND activity.backend_start = $2::TIMESTAMPTZ
      AND activity.application_name = $3
      AND EXISTS (SELECT 1 FROM pg_catalog.pg_locks AS lock
        WHERE lock.pid = pg_catalog.pg_backend_pid()
          AND lock.locktype = 'advisory' AND lock.classid = 1936879981::OID
          AND lock.objid = 1502026082::OID AND lock.objsubid = 2
          AND lock.granted) AS exact
    FROM pg_catalog.pg_stat_activity AS activity
    WHERE activity.pid = pg_catalog.pg_backend_pid()`, [
    binding.backendPid, binding.backendStartedAt, binding.applicationName,
  ]);
  assert(result.rows[0]?.exact === true,
    "telemetry recovery postflight guard identity changed");
};

const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));
const quoteLiteral = (value: string): string =>
  `'${value.replaceAll("'", "''")}'`;

const recoveryProbe = async (
  admin: QueryClient,
  file: string,
): Promise<string> => {
  const sql = readFileSync(
    join("ops/deploy", file), "utf8",
  );
  const results = await admin.query(sql) as unknown as
    { rows: readonly { case: string }[] }[];
  return results.at(-1)?.rows[0]?.case ?? "missing";
};

const count = (source: string, fragment: string): number =>
  source.split(fragment).length - 1;
const hash = (bytes: string): string =>
  createHash("sha256").update(bytes).digest("hex");
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
