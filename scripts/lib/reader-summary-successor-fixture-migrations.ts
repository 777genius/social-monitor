import { provisionSuccessorObserver } from "./reader-summary-successor-fixture-observer";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import {
  applyOrderedReaderSummaryMigrations, createReaderSummaryPublicationMigrationWorkspace,
  preparePrePublicationMigrations, installPublicationAndFollowingMigrations,
  installPublicationMigrationsBeforeDailyActivation,
  readerSummaryMigrationNames, removeReaderSummaryPublicationMigrationWorkspace,
} from "./reader-summary-publication-postgres-migrations";
import {
  provisionPublicationFixtureProtectedRoles, provisionPublicationFixtureDailyTerminalRole,
  runReaderSummaryPublicationBootstrapSql, quotePostgresIdentifier as ident,
} from "../reader-summary-publication-postgres-privileges";
import { fixtureMigrationRole as migrator, fixtureRuntimeRole as runtime, fixtureRoleUrl } from "./reader-summary-successor-fixture-safety";

/** PG16+ bootstrap; uses the real production bootstrap and ordered executor.
 * The older runtime-role helper embeds a PG18-only Docker/psql regression, so
 * create the same explicit safe memberships here, without invoking that test.
 * No migration SQL, guards, checksums, triggers or policies are rewritten. */
export async function migrateSuccessorFixture(admin: Pool, url: URL): Promise<string> {
  await admin.query(`CREATE ROLE ${ident(migrator)} LOGIN NOSUPERUSER NOCREATEDB
    CREATEROLE INHERIT NOREPLICATION NOBYPASSRLS`);
  await admin.query(`CREATE ROLE ${ident(runtime)} LOGIN NOSUPERUSER NOCREATEDB
    NOCREATEROLE INHERIT NOREPLICATION NOBYPASSRLS`);
  await admin.query(`GRANT ${ident(runtime)} TO ${ident(migrator)}
    WITH ADMIN TRUE, INHERIT FALSE, SET TRUE GRANTED BY CURRENT_USER`);
  await admin.query(`ALTER DATABASE ${ident(url.pathname.slice(1))} OWNER TO ${ident(migrator)}`);
  await admin.query(`ALTER DATABASE ${ident(url.pathname.slice(1))} SET timezone TO 'UTC'`);
  const migrationUrl = fixtureRoleUrl(url, migrator);
  const migrationAdmin = new Pool({ connectionString: migrationUrl, min: 0, max: 1 });
  const workspace = createReaderSummaryPublicationMigrationWorkspace();
  try {
    await provisionPublicationFixtureProtectedRoles({ serverAdmin: admin, migrationAdmin, migrationAdminRole: migrator });
    // Explicitly reviewed initial schema transfer: the production bootstrap
    // rejects pg_database_owner unless its owner is the legacy runtime login.
    // Keep this runtime unprivileged instead of temporarily making it DB owner.
    await admin.query(`ALTER SCHEMA public OWNER TO social_monitor_public_schema_owner;
      GRANT USAGE, CREATE ON SCHEMA public TO ${ident(migrator)} WITH GRANT OPTION`);
    // The daily definer's sole bootstrap edge must be issued by the root admin.
    await admin.query(`CREATE ROLE social_monitor_reader_summary_daily_publication_definer
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
    await admin.query(`GRANT social_monitor_reader_summary_daily_publication_definer TO ${ident(migrator)}
      WITH ADMIN TRUE, INHERIT FALSE, SET FALSE GRANTED BY CURRENT_USER`);
    await provisionPublicationFixtureDailyTerminalRole({ serverAdmin: admin,
      migrationAdminRole: migrator, dailyTerminalPassword: "" });
    preparePrePublicationMigrations(workspace);
    applyOrderedReaderSummaryMigrations(migrationUrl, workspace);
    await runReaderSummaryPublicationBootstrapSql("pre", migrationUrl, runtime);
    installPublicationMigrationsBeforeDailyActivation(workspace);
    applyOrderedReaderSummaryMigrations(migrationUrl, workspace);
    // Historical terminal migrations revoke the migrator's legacy privileges.
    // Reapply the canonical bootstrap before adding daily activation FKs.
    await runReaderSummaryPublicationBootstrapSql("pre", migrationUrl, runtime);
    installPublicationAndFollowingMigrations(workspace);
    applyOrderedReaderSummaryMigrations(migrationUrl, workspace);
    await runReaderSummaryPublicationBootstrapSql("post", migrationUrl, runtime);
    const names = readerSummaryMigrationNames();
    const applied = await admin.query<{ migration_name: string; checksum: string }>(
      "select migration_name, checksum from _prisma_migrations where finished_at is not null and rolled_back_at is null order by migration_name");
    assert.deepEqual(applied.rows.map(row => row.migration_name), names);
    for (const row of applied.rows) assert.equal(row.checksum, createHash("sha256")
      .update(readFileSync(`prisma/migrations/${row.migration_name}/migration.sql`)).digest("hex"));
    assert.equal((await admin.query("select 1 from _prisma_migrations where finished_at is null and rolled_back_at is null")).rowCount, 0);
    await provisionSuccessorObserver(admin);
    const audit = await admin.query(`select rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls,
      pg_has_role(rolname,'social_monitor_public_schema_owner','MEMBER') as schema_owner,
      pg_has_role(rolname,'social_monitor_reader_summary_publication_owner','MEMBER') as publication_owner,
      pg_has_role(rolname,'social_monitor_tenant_system_runtime','USAGE') as system_runtime,
      has_table_privilege(rolname,'reader_summary_publications','INSERT,UPDATE,DELETE,TRUNCATE') as ledger_write,
      has_table_privilege(rolname,'reader_summary_publication_slots','INSERT,UPDATE,DELETE,TRUNCATE') as slot_write,
      has_function_privilege(rolname,'publish_reader_summary(jsonb)','EXECUTE') as can_publish
      from pg_roles where rolname=$1`, [runtime]);
    assert.deepEqual(audit.rows, [{ rolsuper: false, rolcreatedb: false, rolcreaterole: false,
      rolreplication: false, rolbypassrls: false, schema_owner: false, publication_owner: false,
      system_runtime: true, ledger_write: false, slot_write: false, can_publish: true }]);
    return fixtureRoleUrl(url, runtime);
  } finally {
    await migrationAdmin.end();
    removeReaderSummaryPublicationMigrationWorkspace(workspace);
  }
}
