import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

import { Pool, type PoolClient } from "pg";

import {
  assertReaderSummaryDailyExecutionCursorPostgresContract,
  assertReaderSummaryDailyActivationMigrationContract,
  assertReaderSummaryDailyMigrationContract,
} from "./lib/reader-summary-daily-execution-cursor-postgres-contract";

const terminalRole = "social_monitor_reader_summary_daily_terminal";
const schemaOwnerRole = "social_monitor_public_schema_owner";
const definerRole = "social_monitor_reader_summary_daily_publication_definer";
const suffix = randomBytes(10).toString("hex");
const databaseName = `reader_summary_daily_cursor_${suffix}`;
const migration = readFileSync(
  "prisma/migrations/20260802100000_reader_summary_daily_execution_cursor/migration.sql",
  "utf8",
);
const activationMigration = readFileSync(
  "prisma/migrations/20260802143000_reader_summary_daily_execution_publication_activation/migration.sql",
  "utf8",
);
const telemetryMigration = readFileSync(
  "prisma/migrations/20260824120000_reader_summary_daily_model_job_telemetry/migration.sql",
  "utf8",
);
const serverUrl = requiredAdminUrl(process.env);
const targetUrl = databaseUrl(serverUrl, databaseName);
const server = new Pool({ connectionString: serverUrl, max: 1 });
let databaseCreated = false;
let terminalRoleCreated = false;
const auxiliaryRolesCreated: string[] = [];

const main = async (): Promise<void> => {
  assertReaderSummaryDailyMigrationContract(migration);
  assertReaderSummaryDailyActivationMigrationContract(activationMigration);
  const version = await server.query<{ version: number }>(
    "SELECT current_setting('server_version_num')::integer AS version",
  );
  assert((version.rows[0]?.version ?? 0) >= 180_000,
    "daily execution cursor contract requires disposable PostgreSQL 18+");
  const role = await server.query<{ present: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS present",
    [terminalRole],
  );
  if (role.rows[0]?.present !== true) {
    await server.query(`CREATE ROLE ${quoteIdentifier(terminalRole)} NOLOGIN
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
    terminalRoleCreated = true;
  }
  for (const auxiliaryRole of [schemaOwnerRole, definerRole]) {
    const present = await server.query<{ present: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS present",
      [auxiliaryRole],
    );
    if (present.rows[0]?.present !== true) {
      await server.query(`CREATE ROLE ${quoteIdentifier(auxiliaryRole)} NOLOGIN
        NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
      auxiliaryRolesCreated.push(auxiliaryRole);
    }
  }
  await server.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
  databaseCreated = true;

  const adminPool = new Pool({ connectionString: targetUrl, max: 1 });
  const firstPool = new Pool({ connectionString: targetUrl, max: 1 });
  const secondPool = new Pool({ connectionString: targetUrl, max: 1 });
  let admin: PoolClient | undefined;
  let first: PoolClient | undefined;
  let second: PoolClient | undefined;
  try {
    admin = await adminPool.connect();
    await admin.query(baseSchemaSql);
    await admin.query(migration);
    await admin.query(activationMigration);
    const historicalScope = await seedHistoricalCompletedDailyJob(admin);
    await admin.query(`ALTER SCHEMA public OWNER TO ${quoteIdentifier(schemaOwnerRole)}`);
    await admin.query(`ALTER TABLE public.reader_summary_daily_model_jobs
      OWNER TO ${quoteIdentifier(schemaOwnerRole)}`);
    await admin.query(`GRANT SELECT, UPDATE
      ON public.reader_summary_daily_execution_cursors,
        public.reader_summary_daily_model_jobs
      TO ${quoteIdentifier(definerRole)}`);
    await admin.query(telemetryMigration);
    const historical = await admin.query<{
      usage_source: string;
      input_tokens: string | null;
      output_tokens: string | null;
      duration_ms: string | null;
    }>(`SELECT usage_source, input_tokens::text, output_tokens::text,
        duration_ms::text
      FROM public.reader_summary_daily_model_jobs
      WHERE tenant_id = $1 AND workspace_id = $2`, [...historicalScope]);
    assert(historical.rows[0]?.usage_source === "HISTORICAL_INCOMPLETE" &&
      historical.rows[0]?.input_tokens === null &&
      historical.rows[0]?.output_tokens === null &&
      historical.rows[0]?.duration_ms === null,
    "upgraded historical completion acquired fabricated telemetry");
    first = await firstPool.connect();
    second = await secondPool.connect();
    await Promise.all([
      first.query(`SET SESSION AUTHORIZATION ${quoteIdentifier(terminalRole)}`),
      second.query(`SET SESSION AUTHORIZATION ${quoteIdentifier(terminalRole)}`),
    ]);
    await assertReaderSummaryDailyExecutionCursorPostgresContract({
      admin,
      first,
      second,
      terminalRole,
    });
  } finally {
    first?.release();
    second?.release();
    admin?.release();
    await Promise.all([firstPool.end(), secondPool.end(), adminPool.end()]);
  }
  console.log("Reader summary daily execution cursor PostgreSQL 18 gate OK");
};

const cleanup = async (): Promise<void> => {
  if (databaseCreated) {
    await server.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [databaseName],
    );
    await server.query(`DROP DATABASE ${quoteIdentifier(databaseName)}`);
  }
  if (terminalRoleCreated) {
    await server.query(`DROP ROLE ${quoteIdentifier(terminalRole)}`);
  }
  for (const role of auxiliaryRolesCreated.reverse()) {
    await server.query(`DROP ROLE ${quoteIdentifier(role)}`);
  }
  await server.end();
};

const baseSchemaSql = `
  CREATE TABLE reader_summary_artifacts (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    workspace_id UUID NOT NULL,
    status TEXT NOT NULL
  );
  CREATE TABLE reader_summary_jobs (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    workspace_id UUID NOT NULL,
    status TEXT NOT NULL,
    reader_summary_artifact_id UUID REFERENCES reader_summary_artifacts(id)
  );
  CREATE TABLE reader_summary_publications (
    id UUID PRIMARY KEY REFERENCES reader_summary_artifacts(id),
    tenant_id UUID NOT NULL,
    workspace_id UUID NOT NULL,
    requested_utc_date DATE NOT NULL,
    cadence TEXT NOT NULL,
    semantic_status TEXT NOT NULL,
    reader_summary_job_id UUID REFERENCES reader_summary_jobs(id),
    reader_summary_artifact_id UUID NOT NULL REFERENCES reader_summary_artifacts(id),
    report_sha256 CHAR(64) NOT NULL,
    proof_sha256 CHAR(64) NOT NULL
  );
  CREATE TABLE reader_summary_weekly_publication_evidence (
    publication_id UUID PRIMARY KEY REFERENCES reader_summary_publications(id),
    reader_summary_job_id UUID NOT NULL REFERENCES reader_summary_jobs(id),
    reader_summary_artifact_id UUID NOT NULL REFERENCES reader_summary_artifacts(id),
    canonical_bytes BYTEA NOT NULL,
    canonical_sha256 CHAR(64) NOT NULL
  );
  CREATE TABLE source_items (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    workspace_id UUID NOT NULL,
    content_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
  );
  CREATE TABLE feed_items (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    workspace_id UUID NOT NULL,
    source_item_id UUID NOT NULL REFERENCES source_items(id),
    provider_key TEXT NOT NULL,
    canonical_url TEXT NOT NULL,
    title TEXT NOT NULL,
    body_preview TEXT NOT NULL,
    author_handle TEXT,
    published_at TIMESTAMPTZ NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL
  );`;

const seedHistoricalCompletedDailyJob = async (
  admin: PoolClient,
): Promise<readonly [string, string]> => {
  const scope = [
    "40000000-0000-4000-8000-000000000004",
    "50000000-0000-4000-8000-000000000005",
  ] as const;
  const bytes = Buffer.from("{}", "utf8");
  const sha = createHash("sha256").update(bytes).digest("hex");
  const attestation = Buffer.from("{}", "utf8");
  const receipt = Buffer.from('{"schemaVersion":1}', "utf8");
  await admin.query(`INSERT INTO public.reader_summary_daily_source_authorities
    (tenant_id, workspace_id, requested_utc_date, ingestion_cutoff,
     canonical_record, canonical_bytes, canonical_sha256, created_at)
    VALUES ($1, $2, DATE '2026-07-01', CURRENT_TIMESTAMP, '{}'::JSONB,
      $3, $4, CURRENT_TIMESTAMP)`, [...scope, bytes, sha]);
  await admin.query(`INSERT INTO public.reader_summary_daily_model_jobs
    (tenant_id, workspace_id, requested_utc_date, identity,
     source_authority_sha256, provider, model, reasoning_effort,
     runtime_engine, state, reserved_at, running_at, completed_at,
     response_bytes, response_sha256, attestation, attestation_bytes,
     attestation_sha256, receipt_bytes, receipt_sha256)
    VALUES ($1, $2, DATE '2026-07-01', $3, $4, 'codex', 'gpt-5.6-sol',
      'xhigh', 'subscription-runtime-cli', 'COMPLETED', CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $5, $6, '{}'::JSONB, $7, $8,
      $9, $10)`, [
    ...scope,
    "d".repeat(64),
    sha,
    bytes,
    sha,
    attestation,
    createHash("sha256").update(attestation).digest("hex"),
    receipt,
    createHash("sha256").update(receipt).digest("hex"),
  ]);
  return scope;
};

function requiredAdminUrl(env: NodeJS.ProcessEnv): string {
  const value = env.READER_SUMMARY_PUBLICATION_TEST_ADMIN_DATABASE_URL?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(
      "READER_SUMMARY_PUBLICATION_TEST_ADMIN_DATABASE_URL is required; the PostgreSQL 18 gate never skips",
    );
  }
  return value;
}
function databaseUrl(input: string, database: string): string {
  const value = new URL(input);
  value.pathname = `/${database}`;
  return value.toString();
}
function quoteIdentifier(input: string): string {
  return `"${input.replaceAll('"', '""')}"`;
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

void main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(cleanup);
