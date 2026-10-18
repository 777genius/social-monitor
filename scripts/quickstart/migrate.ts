import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cp, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Pool } from 'pg';
import { readPublicationBootstrapSql } from '../lib/reader-summary-publication-bootstrap-sql';

const publicationMigration = '20260716170000_reader_summary_fail_closed_publication';
let phase = 'connect';

async function main(): Promise<void> {
  const migrationUrl = await prepareMigrator();
  const pool = new Pool({ connectionString: migrationUrl, min: 0, max: 1, connectionTimeoutMillis: 10_000 });
  const client = await pool.connect();
  // Installation-level advisory lock, held by this connection across Prisma processes.
  try {
    await client.query('SELECT pg_advisory_lock(736233801)');
    phase = 'database-roles';
    const terminal = await client.query('SELECT 1 FROM pg_roles WHERE rolname=$1', ['social_monitor_reader_summary_daily_terminal']);
    if (terminal.rowCount === 0) {
      await client.query(`CREATE ROLE social_monitor_reader_summary_daily_terminal LOGIN PASSWORD '${randomBytes(24).toString('hex')}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
      await client.query('ALTER ROLE social_monitor_reader_summary_daily_terminal SET search_path TO pg_catalog, public');
    }
    const installed = await client.query<{ present: boolean }>(
      "SELECT to_regclass('public.reader_summary_publications') IS NOT NULL AS present",
    );
    phase = 'historical-baseline';
    if (installed.rows[0]?.present !== true) {
      const historicalUrl = new URL(migrationUrl);
      historicalUrl.username = 'social_monitor_app';
      historicalUrl.password = process.env.SELFHOST_APPLICATION_PASSWORD ?? '';
      await installHistoricalBaseline(historicalUrl.toString());
    }
    phase = 'publication-pre-migration';
    await client.query(bootstrapSql('pre'));
    phase = 'ordered-migrations';
    prismaDeploy(resolve('prisma/migrations'), migrationUrl);
    phase = 'publication-post-migration';
    await client.query(bootstrapSql('post'));
    console.log('Ordered migrations and publication/tenant permission audits complete.');
  } finally {
    client.release();
    await pool.end();
  }
}

async function prepareMigrator(): Promise<string> {
  phase = 'migrator-bootstrap';
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (url.hostname !== 'postgres' || url.pathname !== '/social_monitor' || url.username !== 'social_monitor') {
    throw new Error('expected_selfhost_database');
  }
  const password = process.env.SELFHOST_MIGRATOR_PASSWORD;
  if (!/^[0-9a-f]{48}$/u.test(password ?? '')) throw new Error('migrator_secret_invalid');
  const pool = new Pool({ connectionString: url.toString(), min: 0, max: 1, connectionTimeoutMillis: 10_000 });
  try {
    const role = await pool.query('SELECT 1 FROM pg_roles WHERE rolname=$1', ['social_monitor_migrator']);
    if (role.rowCount === 0) {
      await pool.query(`CREATE ROLE social_monitor_migrator LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB CREATEROLE INHERIT NOREPLICATION NOBYPASSRLS`);
    }
    const safe = await pool.query<{ safe: boolean }>(`SELECT rolcanlogin AND NOT rolsuper
      AND NOT rolcreatedb AND rolcreaterole AND rolinherit AND NOT rolreplication
      AND NOT rolbypassrls AS safe FROM pg_roles WHERE rolname='social_monitor_migrator'`);
    if (safe.rows[0]?.safe !== true) throw new Error('unsafe_migrator_role');
    const finite = await pool.query('SELECT 1 FROM pg_roles WHERE rolname=$1', ['social_monitor_summary_once']);
    if (finite.rowCount === 0) {
      await pool.query('CREATE ROLE social_monitor_summary_once NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS');
    }
    // PG18's reviewed bootstrap requires the runtime's ADMIN/SET edge to be
    // granted by the upstream provisioner, not by the migrator to itself.
    for (const [name, key] of [
      ['social_monitor_app', 'SELFHOST_APPLICATION_PASSWORD'],
      ['social_monitor_system_app', 'SELFHOST_SYSTEM_PASSWORD'],
    ] as const) {
      const runtimePassword = process.env[key];
      if (!/^[0-9a-f]{48}$/u.test(runtimePassword ?? '')) throw new Error('database_role_secret_invalid');
      const existing = await pool.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [name]);
      if (existing.rowCount === 0) {
        await pool.query(`CREATE ROLE "${name}" LOGIN PASSWORD '${runtimePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION NOBYPASSRLS`);
      }
      await pool.query(`GRANT "${name}" TO social_monitor_migrator WITH ADMIN TRUE, INHERIT FALSE, SET TRUE`);
    }
    const database = await pool.query<{ owner: string }>(
      'SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=current_database()',
    );
    if (database.rows[0]?.owner !== 'social_monitor_app') {
      const tables = await pool.query<{ count: string }>("SELECT count(*) FROM pg_tables WHERE schemaname='public'");
      if (database.rows[0]?.owner !== 'social_monitor' || tables.rows[0]?.count !== '0') {
        throw new Error('existing_database_ownership_refused');
      }
      await pool.query('ALTER DATABASE social_monitor OWNER TO social_monitor_app');
    }
    // Match the existing reviewed PG18 bootstrap: the application initially
    // owns the database; pre-migration transfers the public schema to its
    // protected NOLOGIN owner and revokes the temporary CREATE authority.
    await pool.query('GRANT USAGE, CREATE ON SCHEMA public TO social_monitor_migrator WITH GRANT OPTION');
    url.username = 'social_monitor_migrator';
    url.password = password ?? '';
    return url.toString();
  } finally { await pool.end(); }
}

function bootstrapSql(phase: 'pre' | 'post'): string {
  return readPublicationBootstrapSql(`ops/deploy/reader-summary-publication-${phase}-migration.sql`)
    .replaceAll(":'runtime_role'", "'social_monitor_app'")
    .replaceAll(":'system_runtime_role'", "'social_monitor_system_app'")
    .replaceAll(':"runtime_role"', '"social_monitor_app"')
    .replaceAll(':"system_runtime_role"', '"social_monitor_system_app"');
}

async function installHistoricalBaseline(url: string): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'selfhost-migrations-'));
  try {
    await writeFile(join(directory, 'migration_lock.toml'), 'provider = "postgresql"\n', { mode: 0o600 });
    for (const entry of await readdir('prisma/migrations', { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name < publicationMigration) {
        await cp(join('prisma/migrations', entry.name), join(directory, entry.name), { recursive: true });
      }
    }
    prismaDeploy(directory, url);
  } finally { await rm(directory, { recursive: true, force: true }); }
}

function prismaDeploy(migrations: string, url: string): void {
  const result = spawnSync(process.execPath, [
    'node_modules/prisma/build/index.js', 'migrate', 'deploy',
    '--config', 'scripts/quickstart/prisma-migration.config.ts',
  ], { env: { ...process.env, DATABASE_URL: url, SELFHOST_MIGRATIONS_PATH: migrations }, stdio: 'inherit' });
  if (result.error !== undefined || result.status !== 0) throw new Error('ordered_migration_failed');
}

void main().catch((error: unknown) => {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  console.error(`Database initialization stopped at ${phase}${/^[A-Z0-9_]{2,64}$/u.test(code) ? ` (${code})` : ''}. Existing data was preserved.`);
  process.exitCode = 1;
});
