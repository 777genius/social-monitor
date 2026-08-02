import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

import { Pool, type PoolClient } from "pg";

import {
  assertReaderSummaryDailyExecutionCursorPostgresContract,
  assertReaderSummaryDailyMigrationContract,
} from "./lib/reader-summary-daily-execution-cursor-postgres-contract";

const terminalRole = "social_monitor_reader_summary_daily_terminal";
const suffix = randomBytes(10).toString("hex");
const databaseName = `reader_summary_daily_cursor_${suffix}`;
const migration = readFileSync(
  "prisma/migrations/20260802100000_reader_summary_daily_execution_cursor/migration.sql",
  "utf8",
);
const serverUrl = requiredAdminUrl(process.env);
const targetUrl = databaseUrl(serverUrl, databaseName);
const server = new Pool({ connectionString: serverUrl, max: 1 });
let databaseCreated = false;
let terminalRoleCreated = false;

const main = async (): Promise<void> => {
  assertReaderSummaryDailyMigrationContract(migration);
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
  await server.end();
};

const baseSchemaSql = `
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
