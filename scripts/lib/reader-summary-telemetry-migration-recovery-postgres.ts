import { createHash } from "node:crypto";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  applyOrderedReaderSummaryMigrations,
  type ReaderSummaryPublicationMigrationWorkspace,
  resolveRolledBackReaderSummaryMigration,
  runOrderedReaderSummaryMigrations,
} from "./reader-summary-publication-postgres-migrations";

type QueryClient = Readonly<{
  query<TRow extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    values?: readonly unknown[],
  ): Promise<Readonly<{ rows: readonly TRow[] }>>;
}>;

export const telemetryMigration =
  "20260824120000_reader_summary_daily_model_job_telemetry";
export const telemetryOldChecksum =
  "e3e5b65d71d47942513478849dd745835f16c72175eb2ef821e245af02b79cad";
export const telemetryCorrectedChecksum =
  "575ece3521b26d769c5f65aae4d4a47ba33502695ac866030524319808812250";

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

  const failed = runOrderedReaderSummaryMigrations(
    params.adminDatabaseUrl, params.workspace,
  );
  const failedOutput = `${failed.stdout}${failed.stderr}`;
  assert(failed.status !== 0 &&
    failedOutput.includes("permission denied for schema public"),
  "old telemetry migration must fail at its reviewed schema permission boundary");
  const blocked = runOrderedReaderSummaryMigrations(
    params.adminDatabaseUrl, params.workspace,
  );
  assert(blocked.status !== 0 &&
    `${blocked.stdout}${blocked.stderr}`.includes("P3009"),
  "unfinished old telemetry migration must block Prisma with P3009");

  assert(await recoveryProbe(params.admin) === "resolve",
    "bounded telemetry recovery did not recognize the exact unfinished old row");
  resolveRolledBackReaderSummaryMigration(
    params.adminDatabaseUrl, params.workspace, telemetryMigration,
  );
  assert(await recoveryProbe(params.admin) === "resolved",
    "bounded telemetry recovery did not prove the exact rollback marker");
  writeFileSync(join(target, "migration.sql"), corrected);
  applyOrderedReaderSummaryMigrations(params.adminDatabaseUrl, params.workspace);

  const rows = await params.admin.query<{
    checksum: string; finished: boolean; rolled_back: boolean;
  }>(`SELECT checksum, finished_at IS NOT NULL AS finished,
      rolled_back_at IS NOT NULL AS rolled_back
    FROM public."_prisma_migrations" WHERE migration_name = $1
    ORDER BY started_at`, [telemetryMigration]);
  assert(rows.rows.length === 2 &&
    rows.rows[0]?.checksum === telemetryOldChecksum &&
    rows.rows[0]?.finished === false && rows.rows[0]?.rolled_back === true &&
    rows.rows[1]?.checksum === telemetryCorrectedChecksum &&
    rows.rows[1]?.finished === true && rows.rows[1]?.rolled_back === false,
  "corrected telemetry retry did not preserve exact Prisma recovery history");
};

const recoveryProbe = async (admin: QueryClient): Promise<string> => {
  const sql = readFileSync(
    "ops/deploy/reader-summary-telemetry-failed-migration-preflight.sql", "utf8",
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
