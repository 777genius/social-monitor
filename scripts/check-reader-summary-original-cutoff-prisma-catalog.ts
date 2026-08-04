import { spawn, spawnSync, type SpawnSyncReturns } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Client, Pool } from "pg";
import { assertShellStops } from "./lib/reader-summary-original-cutoff-shell-contract";
import {
  createPublicationFixtureRuntimeRole, dropPublicationFixtureDatabaseAndRoles,
  grantLegacyMigrationOwnership, makePublicationFixtureRuntimeDatabaseOwner,
  publicationDatabaseUrl, publicationProtectedRolePresence, publicationRuntimeDatabaseUrl,
  provisionPublicationFixtureDailyTerminalRole, provisionPublicationFixtureProtectedRoles,
  quotePostgresIdentifier, quotePostgresLiteral, runReaderSummaryPublicationBootstrapSql,
} from "./reader-summary-publication-postgres-privileges";
const publicationMigration = "20260716170000_reader_summary_fail_closed_publication";
const targetMigration = "20260731153000_reader_summary_production_recovery_original_cutoff_authority";
const correctionMigration = "20260801130000_reader_summary_original_cutoff_consumed_state_correction";
const activationAclMigration = "20260802143100_reader_summary_daily_execution_publication_activation_acl";
const weeklyManifestMigration = "20260802170000_reader_summary_weekly_review_manifest";
const dailyV4ForwardMigration =
  "20260804110000_reader_summary_daily_v4_original_cutoff_forward_correction";
const legacyChecksum = "8748c4e266d8c1838f29b1a6f59f4be056514de64fe95fe44f5c7bb3680b477d";
const currentChecksum = "4100dd4ae236a300e002d2599a880b27df50972aed2f4a9f33578a3da2fe5c35";
const correctionChecksum = "d26709b51ab37d368add42732b4c9fc8c70a56894ec9afdaec417408d4822dbc";
const weeklyManifestCurrentChecksum = "a6e77d075bf9f680f23732f0fb28f0d151078b87e6fda93dba748b6c3e3a70f2";
const weeklyManifestProductionChecksum = "930c7de104be51d2ced8b45d1c33a5d1ccfe9c6e279af8b58aa8e2d4726eef8f";
const dailyV4ForwardOldChecksum = "34e6505c0d78697cc55219bd858f66372c8317ddadc86266053b2f4f52ae7e13";
const dailyV4ForwardFixedChecksum = "0aea8870e788130ca749a1dbb220a9b8d3424b8dde548a655e8e4b1eb1beb0f0";
const defaultUnfinishedTargetBlockerRole = "social_monitor_public_schema_owner";
const defaultUnfinishedTargetBlockerRelation = "public.idempotency_keys";
const dailyV4ForwardBlockerRole = "social_monitor_reader_summary_publication_owner";
const dailyV4ForwardBlockerRelation =
  'public."reader_summary_production_recovery_authority_corrections"';
type UnfinishedTargetBlockerRelation =
  | typeof defaultUnfinishedTargetBlockerRelation
  | typeof dailyV4ForwardBlockerRelation;
const reviewedStartedAt = "2026-07-31 21:16:04.938573+00";
const postgresImage = "postgres:18.4-alpine";
const prismaConfig = "scripts/reader-summary-publication-prisma.config.ts";
const probeSql = readFileSync(
  "ops/deploy/reader-summary-original-cutoff-failed-migration-preflight.sql", "utf8");
const catalogConnectionSql = `SELECT current_user, session_user,
       connected.rolsuper, owner.rolname AS table_owner
  FROM pg_catalog.pg_class relation
  JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
  JOIN pg_catalog.pg_roles owner ON owner.oid = relation.relowner
  JOIN pg_catalog.pg_roles connected ON connected.rolname = current_user
 WHERE namespace.nspname = 'public' AND relation.relname = '_prisma_migrations'
   AND relation.relkind IN ('r', 'p')`;
type Workspace = Readonly<{ directory: string; migrations: string; schema: string }>;
type CatalogRow = Readonly<{
  applied_steps_count: number; checksum: string; finished_at: Date | null; id: string;
  logs: string | null; migration_name: string; rolled_back_at: Date | null;
  started_at: Date; started_at_exact: string }>;
type CatalogConnection = Readonly<{ current_user: string; rolsuper: boolean; session_user: string; table_owner: string }>;
type PrismaExit = Readonly<{ code: number | null; signal: NodeJS.Signals | null; stderr: string; stdout: string }>;
const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};
const checked = (
  command: string,
  args: readonly string[],
  options: Readonly<{ env?: NodeJS.ProcessEnv; input?: string }> = {},
): string => {
  const result = spawnSync(command, args, {
    encoding: "utf8", env: options.env, input: options.input,
  });
  if (result.status !== 0) {
    throw new Error(`${command} failed (${result.status ?? "signal"})\n` +
      `${result.stdout}${result.stderr}`);
  }
  return result.stdout.trim();
};
const docker = (args: readonly string[], input?: string): string =>
  checked("docker", args, { input });
const createWorkspace = (): Workspace => {
  const directory = mkdtempSync(join(tmpdir(), "reader-summary-original-cutoff-catalog-"));
  const migrations = join(directory, "migrations");
  const schema = join(directory, "schema.prisma");
  mkdirSync(migrations); cpSync("prisma/schema.prisma", schema);
  return { directory, migrations, schema };
};
const migrationNames = (): readonly string[] =>
  readdirSync("prisma/migrations", { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
const copyMigrations = (
  workspace: Workspace,
  predicate: (name: string) => boolean,
): void => {
  for (const name of migrationNames().filter(predicate)) {
    const destination = join(workspace.migrations, name);
    if (readdirSync(workspace.migrations).includes(name)) continue;
    cpSync(join("prisma/migrations", name), destination, { recursive: true });
  }
};
const prismaEnvironment = (
  workspace: Workspace,
  databaseUrl: string,
  extra: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv => ({
  ...process.env,
  DATABASE_URL: databaseUrl,
  JITI_FS_CACHE: "false",
  READER_SUMMARY_PUBLICATION_TEST_MIGRATIONS_PATH: workspace.migrations,
  READER_SUMMARY_PUBLICATION_TEST_SCHEMA_PATH: workspace.schema,
  ...extra,
});
const databaseUrlWithStatementTimeout = (databaseUrl: string, milliseconds: number): string => {
  const url = new URL(databaseUrl);
  const existing = url.searchParams.getAll("options").join(" ").trim();
  url.searchParams.delete("options");
  const separator = existing.length > 0 ? " " : "";
  url.searchParams.set("options", `${existing}${separator}-c statement_timeout=${milliseconds}`);
  return url.toString();
};
const boundedPrismaEvidence = (
  outcome: PrismaExit,
  databaseUrl: string,
): string => {
  const url = new URL(databaseUrl);
  const sanitize = (raw: string): string => {
    let value = raw.replace(/postgres(?:ql)?:\/\/[^\s"'`]+/giu, "postgresql://[redacted]");
    const secrets = [databaseUrl, url.password, encodeURIComponent(url.password)].filter((item) => item.length > 0);
    for (const secret of secrets) {
      value = value.replaceAll(secret, "[redacted]");
    }
    return value.slice(-2_000);
  };
  return `exit=${outcome.code ?? "null"}; signal=${outcome.signal ?? "null"}; ` +
    `stdout=${JSON.stringify(sanitize(outcome.stdout))}; ` +
    `stderr=${JSON.stringify(sanitize(outcome.stderr))}`;
};
const prisma = (
  workspace: Workspace,
  databaseUrl: string,
  args: readonly string[],
  extra: NodeJS.ProcessEnv = {},
  shouldSucceed = true,
): SpawnSyncReturns<string> => {
  const result = spawnSync(join("node_modules", ".bin", "prisma"),
    [...args, "--config", prismaConfig], {
      encoding: "utf8", env: prismaEnvironment(workspace, databaseUrl, extra),
    });
  assert(
    shouldSucceed ? result.status === 0 : result.status !== 0,
    `Prisma ${args.join(" ")} had unexpected status ${result.status}\n` +
      `${result.stdout}${result.stderr}`,
  );
  return result;
};
const deploy = (
  workspace: Workspace,
  databaseUrl: string,
  extra: NodeJS.ProcessEnv = {},
  shouldSucceed = true,
): void => {
  prisma(workspace, databaseUrl, ["migrate", "deploy"], extra, shouldSucceed);
};
const resolve = (
  workspace: Workspace,
  databaseUrl: string,
  resolution: "--rolled-back" | "--applied",
  extra: NodeJS.ProcessEnv = {},
  migrationName = targetMigration,
): void => {
  prisma(
    workspace,
    databaseUrl,
    ["migrate", "resolve", resolution, migrationName],
    extra,
  );
};
const catalog = async (
  databaseUrl: string,
  migrationName = targetMigration,
): Promise<readonly CatalogRow[]> => {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const result = await pool.query<CatalogRow>(
      `SELECT id, migration_name, checksum, started_at,
              to_char(started_at AT TIME ZONE 'UTC',
                'YYYY-MM-DD HH24:MI:SS.US') || '+00' AS started_at_exact,
              finished_at, rolled_back_at, applied_steps_count, logs
         FROM public."_prisma_migrations"
        WHERE migration_name = $1
        ORDER BY started_at, id`,
      [migrationName],
    );
    return result.rows;
  } finally {
    await pool.end();
  }
};
const reviewedLegacyUnfinishedRow = (
  rows: readonly CatalogRow[],
): CatalogRow => {
  const row = rows[0];
  assert(
    rows.length === 1 && row !== undefined &&
      row.id.trim().length > 0 &&
      row.migration_name === targetMigration &&
      row.checksum === legacyChecksum &&
      row.finished_at === null &&
      row.rolled_back_at === null &&
      row.applied_steps_count === 0 &&
      row.logs === null,
    "Prisma did not create the unique reviewed legacy unfinished row",
  );
  return row;
};
const normalizeReviewedLegacyStartedAt = async (
  migrationAdminDatabaseUrl: string,
  migrationAdminRole: string,
  row: CatalogRow,
): Promise<void> => {
  const migrationAdmin = new Pool({
    connectionString: migrationAdminDatabaseUrl,
    max: 1,
  });
  try {
    const identity = await migrationAdmin.query<{
      current_user: string;
      session_user: string;
    }>("SELECT current_user, session_user");
    assert(
      identity.rows[0]?.current_user === migrationAdminRole &&
        identity.rows[0]?.session_user === migrationAdminRole,
      "legacy catalog normalization did not use the dedicated migration admin",
    );
    const normalized = await migrationAdmin.query<{ id: string }>(
      `UPDATE public."_prisma_migrations"
          SET started_at = $1::timestamptz
        WHERE id = $2
          AND btrim(id) <> ''
          AND migration_name = $3
          AND checksum = $4
          AND finished_at IS NULL
          AND rolled_back_at IS NULL
          AND applied_steps_count = 0
          AND logs IS NULL
      RETURNING id`,
      [reviewedStartedAt, row.id, targetMigration, legacyChecksum],
    );
    assert(
      normalized.rowCount === 1 && normalized.rows[0]?.id === row.id,
      "dedicated migration admin did not normalize exactly one reviewed row",
    );
  } finally {
    await migrationAdmin.end();
  }
};
const postgresErrorCode = (error: unknown): string | undefined =>
  typeof error === "object" && error !== null && "code" in error &&
    typeof error.code === "string"
    ? error.code
    : undefined;
const readPrismaCatalogConnection = async (databaseUrl: string): Promise<CatalogConnection> => {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const result = await pool.query<CatalogConnection>(catalogConnectionSql);
    assert(result.rowCount === 1 && result.rows[0] !== undefined,
      "fixture Prisma catalog connection was not unique");
    return result.rows[0];
  } finally {
    await pool.end();
  }
};
const transferFixturePrismaCatalogOwnership = async (
  serverAdminTargetDatabaseUrl: string, migrationAdminDatabaseUrl: string,
  migrationAdminRole: string, runtimeRole: string,
): Promise<void> => {
  const bootstrap = new Pool({ connectionString: serverAdminTargetDatabaseUrl, max: 1 });
  const connection = await bootstrap.connect();
  try {
    const before = await connection.query<CatalogConnection>(catalogConnectionSql);
    assert(
      before.rowCount === 1 && before.rows[0]?.current_user === "postgres" &&
        before.rows[0]?.session_user === "postgres" &&
        before.rows[0]?.rolsuper === true &&
        before.rows[0]?.table_owner === runtimeRole,
      "fixture catalog bootstrap identity or runtime ownership diverged",
    );
    await connection.query(
      `ALTER TABLE public."_prisma_migrations" OWNER TO ${quotePostgresIdentifier(migrationAdminRole)}`,
    );
    const after = await connection.query<CatalogConnection>(catalogConnectionSql);
    assert(
      after.rowCount === 1 && after.rows[0]?.table_owner === migrationAdminRole,
      "fixture Prisma catalog owner did not transfer to the migration admin",
    );
  } finally {
    connection.release();
    await bootstrap.end();
  }
  const migrationAdmin = await readPrismaCatalogConnection(migrationAdminDatabaseUrl);
  assert(
    migrationAdmin.current_user === migrationAdminRole &&
      migrationAdmin.session_user === migrationAdminRole &&
      migrationAdmin.rolsuper === false &&
      migrationAdmin.table_owner === migrationAdminRole,
    "migration-admin catalog identity or ownership diverged after bootstrap",
  );
};
const assertRuntimeCatalogWritesRejected = async (
  runtimeDatabaseUrl: string, migrationAdminDatabaseUrl: string,
  reviewedRow: CatalogRow,
): Promise<void> => {
  const runtime = new Pool({ connectionString: runtimeDatabaseUrl, max: 1 });
  const forbiddenId = `runtime-forbidden-${randomBytes(8).toString("hex")}`;
  const forbiddenUpdate = `${targetMigration}_runtime_forbidden_update`;
  const forbiddenInsert = `${targetMigration}_runtime_forbidden_insert`;
  try {
    for (const [operation, sql, parameters] of [
      [
        "update",
        `UPDATE public."_prisma_migrations"
            SET migration_name = $1
          WHERE id = $2`,
        [forbiddenUpdate, reviewedRow.id],
      ],
      [
        "insert",
        `INSERT INTO public."_prisma_migrations"
          (id, checksum, finished_at, migration_name, logs, rolled_back_at,
           started_at, applied_steps_count)
         VALUES ($1, $2, NULL, $3, NULL, NULL, $4::timestamptz, 0)`,
        [forbiddenId, legacyChecksum, forbiddenInsert, reviewedStartedAt],
      ],
    ] as const) {
      let rejection: unknown;
      try {
        await runtime.query(sql, [...parameters]);
      } catch (error: unknown) {
        rejection = error;
      }
      assert(
        postgresErrorCode(rejection) === "42501",
        `ordinary runtime catalog ${operation} was not privilege-rejected`,
      );
    }
  } finally {
    await runtime.end();
  }
  const migrationAdmin = new Pool({
    connectionString: migrationAdminDatabaseUrl,
    max: 1,
  });
  try {
    const forbidden = await migrationAdmin.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM public."_prisma_migrations"
        WHERE id = $1 OR migration_name = ANY($2::text[])`,
      [forbiddenId, [forbiddenUpdate, forbiddenInsert]],
    );
    assert(
      forbidden.rows[0]?.count === "0",
      "ordinary runtime catalog update or insert changed migration history",
    );
  } finally {
    await migrationAdmin.end();
  }
};
const probe = (
  container: string,
  database: string,
  phase: "pre" | "resolved" | "post",
): string => {
  const result = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      "-e",
      `PGAPPNAME=social-monitor/original-cutoff-${phase}`,
      container,
      "psql",
      "-XqAt",
      "--username=postgres",
      `--dbname=${database}`,
      "--set=ON_ERROR_STOP=1",
    ],
    { encoding: "utf8", input: probeSql },
  );
  if (result.status !== 0) {
    throw new Error(`catalog probe rejected\n${result.stdout}${result.stderr}`);
  }
  return result.stdout.trim().split("\n").at(-1) ?? "";
};
const assertProbeRejects = (
  container: string,
  database: string,
  reason: string,
): void => {
  let rejected = false;
  try {
    probe(container, database, "pre");
  } catch {
    rejected = true;
  }
  assert(rejected, reason);
};
const createUnfinishedTarget = async (
  workspace: Workspace,
  databaseUrl: string,
  checksum: string,
  migrationName = targetMigration,
  acceptFailureLog = false,
  blockerRole = defaultUnfinishedTargetBlockerRole,
  blockerRelation: UnfinishedTargetBlockerRelation = defaultUnfinishedTargetBlockerRelation,
): Promise<void> => {
  const before = (await catalog(databaseUrl, migrationName)).filter((row) => row.checksum === checksum);
  assert(before.length === 0, `fixture already contained target checksum ${checksum}`);
  const blocker = new Pool({ connectionString: databaseUrl, max: 1 });
  await blocker.query(`SET ROLE ${quotePostgresIdentifier(blockerRole)}`);
  await blocker.query("BEGIN");
  await blocker.query(`LOCK TABLE ${blockerRelation} IN ACCESS EXCLUSIVE MODE`);
  const child = spawn(
    join("node_modules", ".bin", "prisma"),
    ["migrate", "deploy", "--config", prismaConfig],
    {
      detached: true,
      env: prismaEnvironment(workspace,
        databaseUrlWithStatementTimeout(databaseUrl, 1_000)),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let stdout = "";
  let stderr = "";
  const append = (previous: string, chunk: Buffer): string =>
    `${previous}${chunk.toString("utf8")}`.slice(-8_000);
  child.stdout.on("data", (chunk: Buffer) => { stdout = append(stdout, chunk); });
  child.stderr.on("data", (chunk: Buffer) => { stderr = append(stderr, chunk); });
  const closed = new Promise<PrismaExit>((done, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => done({ code, signal, stderr, stdout }));
  });
  let timedOut = false;
  const emergency = setTimeout(() => {
    timedOut = true;
    try {
      if (child.pid !== undefined) process.kill(-child.pid, "SIGKILL");
    } catch {
      // The detached Prisma process group exited at the overall timeout edge.
    }
  }, 15_000);
  try {
    const outcome = await closed;
    const evidence = boundedPrismaEvidence(outcome, databaseUrl);
    assert(!timedOut && outcome.code !== null && outcome.code !== 0 &&
      outcome.signal === null,
    `Prisma deploy did not exit non-zero before emergency; ${evidence}`);
    const rows = (await catalog(databaseUrl, migrationName)).filter((row) =>
      row.checksum === checksum);
    const row = rows[0];
    assert(rows.length === 1 && row !== undefined && row.id.trim().length > 0 &&
      row.migration_name === migrationName && row.checksum === checksum &&
      row.finished_at === null && row.rolled_back_at === null &&
      row.applied_steps_count === 0 && (row.logs === null ||
        (acceptFailureLog && row.logs.trim().length > 0)),
      `Prisma did not retain one exact unfinished target row; ${evidence}`,
    );
  } finally {
    clearTimeout(emergency);
    if (child.exitCode === null && child.pid !== undefined) {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        // The detached Prisma process group already exited.
      }
    }
    await blocker.query("ROLLBACK").catch(() => undefined);
    await blocker.end();
  }
};
const assertPredecessorExpectedCounts = async (serverAdminTargetDatabaseUrl: string, phase: string): Promise<void> => {
  const connection = new Client({ connectionString: serverAdminTargetDatabaseUrl });
  await connection.connect();
  try {
    await connection.query("BEGIN");
    await connection.query("SET LOCAL ROLE social_monitor_reader_summary_publication_owner");
    const result = await connection.query<{ jul23: number; jul24: number }>(
      `SELECT (public."reader_summary_production_recovery_expected_counts_v2"(DATE '2026-07-23')->3->>'count')::INTEGER AS jul23,
        (public."reader_summary_production_recovery_expected_counts_v2"(DATE '2026-07-24')->3->>'count')::INTEGER AS jul24`);
    console.log(`${phase} predecessor counts: expected Jul23/Jul24=78/68; actual=${JSON.stringify(result.rows[0])}`);
    assert(result.rows[0]?.jul23 === 78 && result.rows[0]?.jul24 === 68, `${phase} predecessor expected counts diverged`);
  } finally {
    await connection.query("ROLLBACK").catch(() => undefined);
    await connection.end();
  }
};
const installLegacyMigration = (workspace: Workspace): void => {
  const destination = join(workspace.migrations, targetMigration);
  mkdirSync(destination);
  const legacy = checked("git", [
    "show",
    "04d2fccb7d319f62f68f234a14b3e0d939e8d0ff^:" +
      `prisma/migrations/${targetMigration}/migration.sql`,
  ]);
  assert(
    createHash("sha256").update(`${legacy}\n`).digest("hex") === legacyChecksum,
    "canonical legacy migration blob is unavailable",
  );
  writeFileSync(join(destination, "migration.sql"), `${legacy}\n`);
};
const installCurrentMigration = (workspace: Workspace): void => {
  cpSync(
    join("prisma/migrations", targetMigration, "migration.sql"),
    join(workspace.migrations, targetMigration, "migration.sql"),
  );
};
// This fixture mirrors immutable production history; it must not broaden accepted preflight checksums.
const installHistoricalWeeklyManifestFixture = (workspace: Workspace): void => {
  const current = readFileSync(
    join("prisma/migrations", weeklyManifestMigration, "migration.sql"),
  );
  const copied = join(workspace.migrations, weeklyManifestMigration, "migration.sql");
  assert(
    createHash("sha256").update(current).digest("hex") === weeklyManifestCurrentChecksum,
    "current weekly manifest migration digest diverged",
  );
  const blockStart = Buffer.from("DO $normalize_weekly_certification_seal_owner$");
  const blockEnd = Buffer.from("$normalize_weekly_certification_seal_owner$;\n\n");
  const startAt = current.indexOf(blockStart);
  const endAt = current.indexOf(blockEnd);
  assert(
    startAt !== -1 &&
      current.indexOf(blockStart, startAt + blockStart.length) === -1,
    "reviewed weekly manifest normalization block start is unavailable or ambiguous",
  );
  assert(
    endAt !== -1 && current.indexOf(blockEnd, endAt + blockEnd.length) === -1 &&
      startAt + blockStart.length <= endAt,
    "reviewed weekly manifest normalization block end is unavailable or ambiguous",
  );
  const production = Buffer.concat([
    current.subarray(0, startAt),
    current.subarray(endAt + blockEnd.length),
  ]);
  assert(
    createHash("sha256").update(production).digest("hex") ===
      weeklyManifestProductionChecksum,
    "reviewed production weekly manifest blob is unavailable",
  );
  assert(readFileSync(copied).equals(current),
    "weekly manifest migration was not copied before fixture reconstruction");
};
const modelProductionWeeklyManifestCatalogHistory = async (
  migrationAdminDatabaseUrl: string,
): Promise<void> => {
  const migrationAdmin = new Pool({
    connectionString: migrationAdminDatabaseUrl,
    max: 1,
  });
  try {
    const updated = await migrationAdmin.query<{ id: string }>(
      `UPDATE public."_prisma_migrations"
          SET checksum = $1
        WHERE migration_name = $2
          AND checksum = $3
          AND finished_at IS NOT NULL
          AND rolled_back_at IS NULL
          AND applied_steps_count = 1
          AND logs IS NULL
      RETURNING id`,
      [
        weeklyManifestProductionChecksum,
        weeklyManifestMigration,
        weeklyManifestCurrentChecksum,
      ],
    );
    const id = updated.rows[0]?.id;
    assert(
      updated.rowCount === 1 && id !== undefined && id.trim().length > 0,
      "dedicated migration admin did not model exactly one production weekly catalog row",
    );
  } finally {
    await migrationAdmin.end();
  }
};
const installDailyV4ForwardOldMigration = (workspace: Workspace): void => {
  const destination = join(workspace.migrations, dailyV4ForwardMigration);
  mkdirSync(destination);
  const fixedExpression =
    "(v_expected - 'legacyTotal') || jsonb_build_object('removedRss', v_removed_manifest_day)";
  const oldExpression = "v_expected || jsonb_build_object('removedRss', v_removed_manifest_day)";
  const fixed = readFileSync(
    join("prisma/migrations", dailyV4ForwardMigration, "migration.sql"),
  );
  const fixedText = fixed.toString("utf8");
  assert(
    fixedText.split(fixedExpression).length === 2,
    "fixed daily V4 forward migration expression is unavailable or ambiguous",
  );
  const old = Buffer.from(fixedText.replace(fixedExpression, oldExpression), "utf8");
  assert(
    createHash("sha256").update(old).digest("hex") === dailyV4ForwardOldChecksum,
    "reviewed old daily V4 forward migration blob is unavailable",
  );
  writeFileSync(join(destination, "migration.sql"), old);
};
const installDailyV4ForwardFixedMigration = (workspace: Workspace): void => {
  cpSync(
    join("prisma/migrations", dailyV4ForwardMigration, "migration.sql"),
    join(workspace.migrations, dailyV4ForwardMigration, "migration.sql"),
  );
};
const main = async (): Promise<void> => {
  assertShellStops({
    correctionMigration,
    activationAclMigration,
    weeklyManifestMigration,
    dailyV4ForwardMigration,
    dailyV4ForwardOldChecksum,
    dailyV4ForwardFixedChecksum,
  });
  assert(
    createHash("sha256")
      .update(readFileSync(join("prisma/migrations", correctionMigration,
        "migration.sql")))
      .digest("hex") === correctionChecksum,
    "immutable correction migration digest diverged",
  );
  assert(
    createHash("sha256").update(readFileSync(join("prisma/migrations",
      dailyV4ForwardMigration, "migration.sql"))).digest("hex") ===
      dailyV4ForwardFixedChecksum,
    "fixed daily V4 forward migration digest diverged",
  );
  const suffix = randomBytes(8).toString("hex");
  const container = `sm-original-cutoff-${suffix}`;
  const database = `original_cutoff_${suffix}`;
  const partialDatabase = `${database}_partial`;
  const password = "password";
  const migrationAdminRole = `sm_cutoff_admin_${suffix}`;
  const migrationAdminPassword = randomBytes(24).toString("base64url");
  const runtimeRole = `sm_cutoff_runtime_${suffix}`;
  const runtimePassword = randomBytes(24).toString("base64url");
  const dailyTerminalPassword = randomBytes(24).toString("base64url");
  const workspace = createWorkspace();
  let started = false;
  let serverAdmin: Pool | undefined;
  let ownerRolePreexisting = false;
  let capabilityRolePreexisting = false;
  let schemaOwnerRolePreexisting = false;
  let tenantSystemCapabilityRolePreexisting = false;
  let dailyActivationDefinerRolePreexisting = false;
  let fixtureDatabaseCreated = false;
  let fixtureMigrationAdminRoleCreated = false;
  let fixtureRuntimeRoleCreated = false;
  let fixtureDailyTerminalRoleCreated = false;
  let partialDatabaseCreated = false;
  try {
    docker([
      "run", "--detach", "--rm", "--name", container,
      "--publish", "127.0.0.1::5432",
      "--env", `POSTGRES_PASSWORD=${password}`,
      postgresImage,
    ]);
    started = true;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const ready = spawnSync("docker", [
        "exec", container, "pg_isready", "--username=postgres",
      ]);
      if (ready.status === 0) break;
      await delay(100);
    }
    const version = docker([
      "exec", container, "psql", "-XAt", "--username=postgres",
      "--command=SHOW server_version_num",
    ]);
    assert(/^18[0-9]{4}$/u.test(version), `expected PostgreSQL 18, got ${version}`);
    const port = docker(["port", container, "5432/tcp"])
      .trim().split(":").at(-1);
    assert(port && /^[0-9]+$/u.test(port), "ephemeral PostgreSQL port is absent");
    const serverUrl = `postgresql://postgres:password@127.0.0.1:${port}`;
    const serverAdminDatabaseUrl = `${serverUrl}/postgres`;
    const targetDatabaseUrl = publicationDatabaseUrl(
      serverAdminDatabaseUrl,
      database,
    );
    const adminDatabaseUrl = publicationRuntimeDatabaseUrl(
      targetDatabaseUrl,
      migrationAdminRole,
      migrationAdminPassword,
    );
    const runtimeDatabaseUrl = publicationRuntimeDatabaseUrl(
      adminDatabaseUrl,
      runtimeRole,
      runtimePassword,
    );
    serverAdmin = new Pool({ connectionString: serverAdminDatabaseUrl, max: 1 });
    const protectedRoles = await publicationProtectedRolePresence(serverAdmin);
    ownerRolePreexisting = protectedRoles.owner;
    capabilityRolePreexisting = protectedRoles.capability;
    schemaOwnerRolePreexisting = protectedRoles.schemaOwner;
    tenantSystemCapabilityRolePreexisting =
      protectedRoles.tenantSystemCapability;
    dailyActivationDefinerRolePreexisting = protectedRoles.dailyActivationDefiner;
    await serverAdmin.query(
      `CREATE ROLE ${quotePostgresIdentifier(migrationAdminRole)}
         LOGIN PASSWORD ${quotePostgresLiteral(migrationAdminPassword)}
         NOSUPERUSER NOCREATEDB CREATEROLE INHERIT
         NOREPLICATION NOBYPASSRLS`,
    );
    fixtureMigrationAdminRoleCreated = true;
    await serverAdmin.query(
      `CREATE DATABASE ${quotePostgresIdentifier(database)}
         OWNER ${quotePostgresIdentifier(migrationAdminRole)}`,
    );
    fixtureDatabaseCreated = true;
    const bootstrapAdmin = new Pool({ connectionString: adminDatabaseUrl, max: 1 });
    try {
      await provisionPublicationFixtureProtectedRoles({
        serverAdmin,
        migrationAdmin: bootstrapAdmin,
        migrationAdminRole,
      });
    } finally {
      await bootstrapAdmin.end();
    }
    await createPublicationFixtureRuntimeRole({
      databaseName: database,
      migrationAdminRole,
      runtimePassword,
      runtimeRole,
      serverAdminDatabaseUrl,
    });
    fixtureRuntimeRoleCreated = true;
    fixtureDailyTerminalRoleCreated =
      await provisionPublicationFixtureDailyTerminalRole({
        dailyTerminalPassword,
        migrationAdminRole,
        serverAdmin,
      });
    await makePublicationFixtureRuntimeDatabaseOwner({
      databaseName: database,
      migrationAdminDatabaseUrl: adminDatabaseUrl,
      migrationAdminRole,
      runtimeRole,
      systemRuntimeRole: runtimeRole,
      targetDatabaseUrl,
    });
    copyMigrations(workspace, (name) => name < publicationMigration);
    await grantLegacyMigrationOwnership(adminDatabaseUrl, runtimeRole);
    deploy(workspace, runtimeDatabaseUrl);
    await runReaderSummaryPublicationBootstrapSql(
      "pre",
      adminDatabaseUrl,
      runtimeRole,
    );
    copyMigrations(
      workspace,
      (name) => name >= publicationMigration && name < targetMigration,
    );
    deploy(workspace, adminDatabaseUrl);
    assert(probe(container, database, "pre") === "clean",
      "clean catalog did not classify as a no-op");
    assert((await readPrismaCatalogConnection(targetDatabaseUrl)).table_owner ===
      runtimeRole, "baseline Prisma catalog owner was not the runtime role");
    await assertPredecessorExpectedCounts(targetDatabaseUrl, "(a) baseline");
    installLegacyMigration(workspace);
    await createUnfinishedTarget(workspace, adminDatabaseUrl, legacyChecksum);
    await assertPredecessorExpectedCounts(targetDatabaseUrl, "(b) legacy terminal rollback");
    const createdLegacyRow = reviewedLegacyUnfinishedRow(
      await catalog(adminDatabaseUrl),
    );
    await normalizeReviewedLegacyStartedAt(
      adminDatabaseUrl,
      migrationAdminRole,
      createdLegacyRow,
    );
    const legacyFailed = await catalog(adminDatabaseUrl);
    const legacyRow = reviewedLegacyUnfinishedRow(legacyFailed);
    assert(
      legacyRow.id === createdLegacyRow.id &&
        legacyRow.migration_name === targetMigration &&
        legacyRow.checksum === legacyChecksum &&
        legacyRow.started_at.toISOString() === "2026-07-31T21:16:04.938Z" &&
        legacyRow.started_at_exact === reviewedStartedAt &&
        legacyRow.finished_at === null &&
        legacyRow.rolled_back_at === null &&
        legacyRow.applied_steps_count === 0 &&
        legacyRow.logs === null,
      "normalized legacy catalog row did not preserve every reviewed field",
    );
    await transferFixturePrismaCatalogOwnership(
      targetDatabaseUrl, adminDatabaseUrl, migrationAdminRole, runtimeRole,
    );
    await assertRuntimeCatalogWritesRejected(
      runtimeDatabaseUrl, adminDatabaseUrl, legacyRow,
    );
    resolve(workspace, adminDatabaseUrl, "--rolled-back");
    await assertPredecessorExpectedCounts(targetDatabaseUrl, "(c) legacy resolved rolled-back");
    installCurrentMigration(workspace);
    await createUnfinishedTarget(workspace, adminDatabaseUrl, currentChecksum);
    await assertPredecessorExpectedCounts(targetDatabaseUrl, "(d) current terminal rollback");
    const beforeCurrentResolve = await catalog(adminDatabaseUrl);
    const preservedLegacyRollback = beforeCurrentResolve.find(
      (row) => row.checksum === legacyChecksum,
    )?.rolled_back_at?.toISOString();
    assert(probe(container, database, "pre") === "rollback",
      "reviewed two-row history did not classify rollback");
    resolve(workspace, adminDatabaseUrl, "--rolled-back");
    const afterCurrentResolve = await catalog(adminDatabaseUrl);
    assert(
      preservedLegacyRollback !== undefined &&
        afterCurrentResolve.find((row) => row.checksum === legacyChecksum)
          ?.rolled_back_at?.toISOString() === preservedLegacyRollback &&
        afterCurrentResolve.filter((row) => row.checksum === currentChecksum &&
          row.rolled_back_at !== null).length === 1,
      "Prisma rolled-back resolve did not preserve the legacy row",
    );
    assert(probe(container, database, "pre") === "apply",
      "rolled-back current row did not classify apply");
    resolve(workspace, adminDatabaseUrl, "--applied");
    assert(probe(container, database, "resolved") === "resolved",
      "applied current row did not classify resolved");
    await serverAdmin.query(
      `CREATE DATABASE ${quotePostgresIdentifier(partialDatabase)}
         OWNER ${quotePostgresIdentifier(runtimeRole)}
         TEMPLATE ${quotePostgresIdentifier(database)}`,
    );
    partialDatabaseCreated = true;
    const partialUrl = publicationRuntimeDatabaseUrl(
      publicationDatabaseUrl(serverAdminDatabaseUrl, partialDatabase),
      migrationAdminRole,
      migrationAdminPassword,
    );
    copyMigrations(
      workspace,
      (name) => name > targetMigration && name < correctionMigration,
    );
    deploy(workspace, adminDatabaseUrl);
    deploy(workspace, partialUrl);
    copyMigrations(workspace, (name) => name === correctionMigration);
    const partialBlocker = new Pool({ connectionString: partialUrl, max: 1 });
    await partialBlocker.query(
      "SET ROLE social_monitor_reader_summary_publication_owner",
    );
    await partialBlocker.query("BEGIN");
    await partialBlocker.query(
      "LOCK TABLE reader_summary_production_recovery_leases " +
        "IN ACCESS EXCLUSIVE MODE",
    );
    deploy(workspace, databaseUrlWithStatementTimeout(partialUrl, 1_000),
      {}, false);
    await partialBlocker.query("ROLLBACK");
    await partialBlocker.end();
    assert(
      probe(container, partialDatabase, "pre") === "correction-rollback",
      "reviewed unfinished correction row did not classify for bounded recovery",
    );
    deploy(workspace, adminDatabaseUrl);
    assert(probe(container, database, "pre") === "clean",
      "terminal correction history was not clean before the forward migration");
    copyMigrations(
      workspace,
      (name) => name > correctionMigration && name < dailyV4ForwardMigration,
    );
    installHistoricalWeeklyManifestFixture(workspace);
    deploy(workspace, adminDatabaseUrl);
    await modelProductionWeeklyManifestCatalogHistory(adminDatabaseUrl);
    const weeklyManifestRows = await catalog(adminDatabaseUrl, weeklyManifestMigration);
    const weeklyManifestRow = weeklyManifestRows[0];
    assert(
      weeklyManifestRows.length === 1 && weeklyManifestRow !== undefined &&
        weeklyManifestRow.migration_name === weeklyManifestMigration &&
        weeklyManifestRow.checksum === weeklyManifestProductionChecksum &&
        weeklyManifestRow.finished_at !== null && weeklyManifestRow.rolled_back_at === null &&
        weeklyManifestRow.applied_steps_count === 1 && weeklyManifestRow.logs === null,
      "weekly manifest catalog did not model the successful production row",
    );
    assert(probe(container, database, "pre") === "clean",
      "daily V4 forward prerequisites were not clean");
    installDailyV4ForwardOldMigration(workspace);
    await createUnfinishedTarget(
      workspace,
      adminDatabaseUrl,
      dailyV4ForwardOldChecksum,
      dailyV4ForwardMigration,
      true,
      dailyV4ForwardBlockerRole,
      dailyV4ForwardBlockerRelation,
    );
    assert(probe(container, database, "pre") === "daily-v4-forward-rollback",
      "reviewed daily V4 forward failure did not classify for rollback");
    resolve(
      workspace,
      adminDatabaseUrl,
      "--rolled-back",
      {},
      dailyV4ForwardMigration,
    );
    assert(probe(container, database, "pre") === "clean",
      "rolled-back daily V4 forward row did not return to clean");
    installDailyV4ForwardFixedMigration(workspace);
    deploy(workspace, adminDatabaseUrl);
    assert(probe(container, database, "post") === "corrected",
      "fixed daily V4 forward history was not proven");
    deploy(workspace, adminDatabaseUrl);
    assert(probe(container, database, "pre") === "clean",
      "terminal retry was not a clean no-op");
    const forwardRows = await catalog(adminDatabaseUrl, dailyV4ForwardMigration);
    const oldForwardRow = forwardRows.find((row) =>
      row.checksum === dailyV4ForwardOldChecksum);
    const fixedForwardRow = forwardRows.find((row) =>
      row.checksum === dailyV4ForwardFixedChecksum);
    assert(
      forwardRows.length === 2 && oldForwardRow !== undefined &&
        oldForwardRow.rolled_back_at !== null && oldForwardRow.finished_at === null &&
        fixedForwardRow !== undefined && fixedForwardRow.finished_at !== null &&
        fixedForwardRow.rolled_back_at === null &&
        fixedForwardRow.started_at.getTime() >= oldForwardRow.rolled_back_at.getTime(),
      "daily V4 forward catalog did not preserve the exact failed-row lifecycle",
    );
    const finalRows = await catalog(adminDatabaseUrl);
    const finalLegacyRow = finalRows[0];
    assert(
      finalRows.length === 3 && finalLegacyRow !== undefined &&
        finalLegacyRow.checksum === legacyChecksum &&
        finalLegacyRow.rolled_back_at !== null &&
        finalRows.filter((row) => row.checksum === currentChecksum &&
          row.rolled_back_at !== null).length === 1 &&
        finalRows.filter((row) => row.checksum === currentChecksum &&
          row.finished_at !== null).length === 1,
      "terminal predecessor catalog did not preserve exact row history",
    );
    const correctionRows = await catalog(adminDatabaseUrl, correctionMigration);
    const correctionRow = correctionRows[0];
    assert(
      correctionRows.length === 1 && correctionRow !== undefined &&
        correctionRow.checksum === correctionChecksum &&
        correctionRow.finished_at !== null,
      "terminal correction catalog row diverged",
    );
    const ambiguous = "20260801140000_original_cutoff_ambiguous_fixture";
    const ambiguousDirectory = join(workspace.migrations, ambiguous);
    mkdirSync(ambiguousDirectory);
    writeFileSync(join(ambiguousDirectory, "migration.sql"),
      "SELECT pg_sleep(30);\n");
    deploy(workspace,
      databaseUrlWithStatementTimeout(adminDatabaseUrl, 500), {}, false);
    assertProbeRejects(
      container,
      database,
      "extra unfinished Prisma migration was accepted",
    );
  } finally {
    rmSync(workspace.directory, { recursive: true, force: true });
    try {
      if (serverAdmin !== undefined) {
        try {
          if (partialDatabaseCreated) {
            await serverAdmin.query(
              `DROP DATABASE ${quotePostgresIdentifier(partialDatabase)} WITH (FORCE)`,
            );
          }
          await dropPublicationFixtureDatabaseAndRoles({
            serverAdmin,
            databaseName: database,
            migrationAdminRole,
            runtimeRole,
            ownerRolePreexisting,
            capabilityRolePreexisting,
            schemaOwnerRolePreexisting,
            tenantSystemCapabilityRolePreexisting,
            dailyActivationDefinerRolePreexisting,
            fixtureDatabaseCreated,
            fixtureMigrationAdminRoleCreated,
            fixtureRuntimeRoleCreated,
            fixtureDailyTerminalRoleCreated,
          });
        } finally {
          await serverAdmin.end();
        }
      }
    } finally {
      if (started) {
        spawnSync("docker", ["rm", "--force", container], {
          encoding: "utf8",
        });
      }
    }
  }
  console.log("Reader summary original-cutoff Prisma catalog gate OK");
};
void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
