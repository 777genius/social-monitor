import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

import { Pool, type PoolClient } from "pg";

import {
  assertReaderSummaryDailyCheckerActivationOwnershipContract,
  assertReaderSummaryDailyCheckerCanonicalRlsContract,
  assertReaderSummaryDailyCanonicalPublicationFixtureContract,
  assertReaderSummaryDailyCheckerFixtureRoleContract,
  assertReaderSummaryDailyCheckerRoleBootstrapContract,
  assertReaderSummaryDailyProductionOwnerTopologyFixtureContract,
  assertReaderSummaryDailyExecutionCursorPostgresContract,
  assertReaderSummaryDailyActivationMigrationContract,
  assertReaderSummaryDailyMigrationContract,
} from "./lib/reader-summary-daily-execution-cursor-postgres-contract";
import {
  executePostgresMigrationWithDiagnostics,
} from
  "./lib/postgres-migration-diagnostics";
import { grantAndAssertReaderSummaryDailyProductionOwnerTopology } from
  "./lib/reader-summary-daily-production-owner-topology-postgres";

const terminalRole = "social_monitor_reader_summary_daily_terminal";
const schemaOwnerRole = "social_monitor_public_schema_owner";
const definerRole = "social_monitor_reader_summary_daily_publication_definer";
const publicationOwnerRole = "social_monitor_reader_summary_publication_owner";
const publicationRuntimeRole = "social_monitor_reader_summary_publication_runtime";
const tenantSystemRuntimeRole = "social_monitor_tenant_system_runtime";
const suffix = randomBytes(10).toString("hex");
const migrationAdminRole = `reader_summary_daily_migrator_${suffix}`;
const databaseName = `reader_summary_daily_cursor_${suffix}`;
const migration = readFileSync(
  "prisma/migrations/20260802100000_reader_summary_daily_execution_cursor/migration.sql",
  "utf8",
);
const activationMigration = readFileSync(
  "prisma/migrations/20260802143000_reader_summary_daily_execution_publication_activation/migration.sql",
  "utf8",
);
const activationAclMigration = readFileSync(
  "prisma/migrations/20260802143100_reader_summary_daily_execution_publication_activation_acl/migration.sql",
  "utf8",
);
const boundedMaintenanceMigration = readFileSync(
  "prisma/migrations/20260804130400_reader_summary_daily_bounded_maintenance_claim/migration.sql",
  "utf8",
);
const telemetryMigration = readFileSync(
  "prisma/migrations/20260824120000_reader_summary_daily_model_job_telemetry/migration.sql",
  "utf8",
);
const checkerSource = readFileSync(
  "scripts/check-reader-summary-daily-execution-cursor-postgres.ts",
  "utf8",
);
const productionOwnerTopologyFixtureSource = readFileSync(
  "scripts/lib/reader-summary-daily-production-owner-topology-postgres.ts", "utf8",
);
const publicationPostMigrationSql = readFileSync(
  "ops/deploy/reader-summary-publication-post-migration.sql", "utf8",
);
const serverUrl = requiredAdminUrl(process.env);
const targetUrl = databaseUrl(serverUrl, databaseName);
const server = new Pool({ connectionString: serverUrl, max: 1 });
let databaseCreated = false;
let terminalRoleCreated = false;
let migrationAdminRoleCreated = false;
const auxiliaryRolesCreated: string[] = [];

const main = async (): Promise<void> => {
  assertReaderSummaryDailyCheckerActivationOwnershipContract(checkerSource);
  assertReaderSummaryDailyCheckerCanonicalRlsContract(checkerSource);
  assertReaderSummaryDailyCanonicalPublicationFixtureContract(
    checkerSource,
    readFileSync(
      "scripts/lib/reader-summary-daily-execution-cursor-postgres-contract.ts",
      "utf8",
    ),
  );
  assertReaderSummaryDailyCheckerFixtureRoleContract(checkerSource);
  assertReaderSummaryDailyCheckerRoleBootstrapContract(checkerSource);
  assertReaderSummaryDailyProductionOwnerTopologyFixtureContract(
    productionOwnerTopologyFixtureSource,
  );
  assertReaderSummaryDailyMigrationContract(migration);
  assertReaderSummaryDailyActivationMigrationContract(activationMigration);
  const version = await server.query<{ version: number }>(
    "SELECT current_setting('server_version_num')::integer AS version",
  );
  assert((version.rows[0]?.version ?? 0) >= 180_000,
    "daily execution cursor contract requires disposable PostgreSQL 18+");
  await assertBootstrapSessionIsSuperuser();
  await server.query("SET createrole_self_grant = ''");
  await server.query(`CREATE ROLE ${quoteIdentifier(migrationAdminRole)} NOLOGIN
    NOSUPERUSER NOCREATEDB CREATEROLE INHERIT NOREPLICATION NOBYPASSRLS`);
  migrationAdminRoleCreated = true;
  const roleAdmin = await server.connect();
  try {
    await roleAdmin.query(
      `SET SESSION AUTHORIZATION ${quoteIdentifier(migrationAdminRole)}`,
    );
    await roleAdmin.query("SET createrole_self_grant = ''");
    if (!await roleExists(terminalRole, roleAdmin)) {
      await roleAdmin.query(`CREATE ROLE ${quoteIdentifier(terminalRole)} LOGIN
        NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT
        NOREPLICATION NOBYPASSRLS`);
      terminalRoleCreated = true;
      await roleAdmin.query(`ALTER ROLE ${quoteIdentifier(terminalRole)}
        SET search_path TO pg_catalog, public`);
    }
    for (const auxiliaryRole of [
      schemaOwnerRole, definerRole, publicationOwnerRole,
      publicationRuntimeRole, tenantSystemRuntimeRole,
    ]) {
      if (!await roleExists(auxiliaryRole, roleAdmin)) {
        await roleAdmin.query(`CREATE ROLE ${quoteIdentifier(auxiliaryRole)} NOLOGIN
          NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT
          NOREPLICATION NOBYPASSRLS`);
        auxiliaryRolesCreated.push(auxiliaryRole);
      }
    }
  } finally {
    await roleAdmin.query("RESET SESSION AUTHORIZATION").catch(() => undefined);
    roleAdmin.release();
  }
  for (const protectedRole of [
    terminalRole, schemaOwnerRole, definerRole, publicationOwnerRole,
    publicationRuntimeRole, tenantSystemRuntimeRole,
  ]) {
    await ensureBootstrapAdminMembership(protectedRole);
  }
  await server.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
  databaseCreated = true;
  await server.query(`GRANT CREATE ON DATABASE ${quoteIdentifier(databaseName)}
    TO ${quoteIdentifier(migrationAdminRole)}, ${quoteIdentifier(schemaOwnerRole)}`);

  const adminPool = new Pool({ connectionString: targetUrl, max: 1 });
  const firstPool = new Pool({ connectionString: targetUrl, max: 1 });
  const secondPool = new Pool({ connectionString: targetUrl, max: 1 });
  let admin: PoolClient | undefined;
  let first: PoolClient | undefined;
  let second: PoolClient | undefined;
  try {
    admin = await adminPool.connect();
    await admin.query(`ALTER SCHEMA public
        OWNER TO ${quoteIdentifier(migrationAdminRole)};
      GRANT USAGE, CREATE ON SCHEMA public
        TO ${quoteIdentifier(migrationAdminRole)} WITH GRANT OPTION`);
    await admin.query(
      `SET SESSION AUTHORIZATION ${quoteIdentifier(migrationAdminRole)}`,
    );
    for (const ownerRole of [schemaOwnerRole, publicationOwnerRole]) {
      await admin.query(`GRANT ${quoteIdentifier(ownerRole)}
        TO ${quoteIdentifier(migrationAdminRole)}
        WITH ADMIN FALSE, INHERIT FALSE, SET TRUE GRANTED BY CURRENT_USER`);
    }
    await assertBootstrapRoleInvariants(admin);
    await admin.query(baseSchemaSql);
    await admin.query(migration);
    await admin.query(`GRANT USAGE, CREATE ON SCHEMA public
      TO ${quoteIdentifier(publicationOwnerRole)}`);
    await admin.query(`
      ALTER TABLE public.reader_summary_artifacts
        OWNER TO ${quoteIdentifier(publicationOwnerRole)};
      ALTER TABLE public.reader_summary_publications
        OWNER TO ${quoteIdentifier(publicationOwnerRole)};
      ALTER TABLE public.reader_summary_weekly_publication_evidence
        OWNER TO ${quoteIdentifier(publicationOwnerRole)};
    `);
    const schemaHandoffPrerequisites = await admin.query<{
      migration_admin_has_create: boolean;
      schema_owner_has_create: boolean;
    }>(`SELECT
        has_database_privilege(current_user, current_database(), 'CREATE')
          AS migration_admin_has_create,
        has_database_privilege($1, current_database(), 'CREATE')
          AS schema_owner_has_create`, [schemaOwnerRole]);
    assert(schemaHandoffPrerequisites.rows[0]?.migration_admin_has_create === true,
      "daily execution cursor migration admin requires temporary database CREATE " +
      "before schema handoff");
    assert(schemaHandoffPrerequisites.rows[0]?.schema_owner_has_create === true,
      "daily execution cursor schema owner requires temporary database CREATE " +
      "before schema handoff");
    await admin.query(`ALTER SCHEMA public OWNER TO ${quoteIdentifier(schemaOwnerRole)}`);
    await admin.query(`SET ROLE ${quoteIdentifier(schemaOwnerRole)};
      REVOKE ALL ON SCHEMA public FROM PUBLIC;
      GRANT USAGE ON SCHEMA public
        TO ${quoteIdentifier(migrationAdminRole)};
      RESET ROLE`);
    await server.query(`REVOKE CREATE ON DATABASE ${quoteIdentifier(databaseName)}
      FROM ${quoteIdentifier(migrationAdminRole)}, ${quoteIdentifier(schemaOwnerRole)}`);
    await admin.query(`ALTER TABLE public.reader_summary_jobs
        OWNER TO ${quoteIdentifier(schemaOwnerRole)};
      ALTER TABLE public.reader_summary_daily_execution_cursors
        OWNER TO ${quoteIdentifier(schemaOwnerRole)};
      ALTER TABLE public.reader_summary_daily_source_authorities
        OWNER TO ${quoteIdentifier(schemaOwnerRole)};
      ALTER TABLE public.reader_summary_daily_model_jobs
        OWNER TO ${quoteIdentifier(schemaOwnerRole)};
      ALTER TABLE public.source_items
        OWNER TO ${quoteIdentifier(schemaOwnerRole)};
      ALTER TABLE public.feed_items
        OWNER TO ${quoteIdentifier(schemaOwnerRole)}`);
    await admin.query(`SET ROLE ${quoteIdentifier(schemaOwnerRole)};
      GRANT USAGE, CREATE ON SCHEMA public
        TO ${quoteIdentifier(publicationOwnerRole)};
      RESET ROLE`);
    const activationSchemaPrivileges = await admin.query<{
      migration_admin_has_create: boolean;
      migration_admin_has_usage: boolean;
      publication_owner_has_usage: boolean;
      publication_owner_has_create: boolean;
    }>(`SELECT
        has_schema_privilege($1, 'public', 'USAGE')
          AS publication_owner_has_usage,
        has_schema_privilege($1, 'public', 'CREATE')
          AS publication_owner_has_create,
        has_schema_privilege($2, 'public', 'USAGE')
          AS migration_admin_has_usage,
        has_schema_privilege($2, 'public', 'CREATE')
          AS migration_admin_has_create`, [publicationOwnerRole, migrationAdminRole]);
    assert(activationSchemaPrivileges.rows[0]?.publication_owner_has_usage === true,
      "daily activation publication owner requires temporary schema USAGE");
    assert(activationSchemaPrivileges.rows[0]?.publication_owner_has_create === true,
      "daily activation publication owner requires temporary schema CREATE");
    assert(activationSchemaPrivileges.rows[0]?.migration_admin_has_usage === true,
      "daily activation migration admin requires temporary schema USAGE");
    assert(activationSchemaPrivileges.rows[0]?.migration_admin_has_create === false,
      "daily activation migration admin acquired temporary schema CREATE");
    await assertRoleCanResolveActivationRelation(
      admin, publicationOwnerRole, "public.reader_summary_artifacts",
      "daily activation publication owner cannot resolve publication tables",
    );
    await assertRoleCanResolveActivationRelation(
      admin, migrationAdminRole, "public.reader_summary_daily_model_jobs",
      "daily activation migration admin cannot resolve dormant daily tables",
    );
    await executePostgresMigrationWithDiagnostics(admin, {
      migrationLabel:
        "20260802143000_reader_summary_daily_execution_publication_activation/migration.sql",
      sql: activationMigration,
    });
    await admin.query(`SET ROLE ${quoteIdentifier(schemaOwnerRole)};
      REVOKE CREATE ON SCHEMA public
        FROM ${quoteIdentifier(publicationOwnerRole)};
      RESET ROLE`);
    await admin.query(`
      ALTER FUNCTION public.reject_reader_summary_daily_source_authority_mutation()
        OWNER TO ${quoteIdentifier(schemaOwnerRole)};
    `);
    await transferActiveClaimOwner(admin, firstPool, migrationAdminRole);
    const activationAclSchemaPrivileges = await admin.query<{
      publication_owner_has_usage: boolean;
      publication_owner_has_create: boolean;
    }>(`SELECT
        has_schema_privilege($1, 'public', 'USAGE')
          AS publication_owner_has_usage,
        has_schema_privilege($1, 'public', 'CREATE')
          AS publication_owner_has_create`, [publicationOwnerRole]);
    assert(activationAclSchemaPrivileges.rows[0]?.publication_owner_has_usage === true,
      "daily activation ACL publication owner requires durable schema USAGE");
    assert(activationAclSchemaPrivileges.rows[0]?.publication_owner_has_create === false,
      "daily activation ACL publication owner retained temporary schema CREATE");
    await admin.query(`SET ROLE ${quoteIdentifier(schemaOwnerRole)};
      GRANT USAGE ON SCHEMA public
        TO ${quoteIdentifier(definerRole)};
      RESET ROLE`);
    await admin.query(activationAclMigration);
    const retainedActivationSchemaPrivileges = await admin.query<{
      publication_owner_has_usage: boolean;
      publication_owner_has_create: boolean;
    }>(`SELECT
        has_schema_privilege($1, 'public', 'USAGE')
          AS publication_owner_has_usage,
        has_schema_privilege($1, 'public', 'CREATE')
          AS publication_owner_has_create`, [publicationOwnerRole]);
    assert(retainedActivationSchemaPrivileges.rows[0]?.publication_owner_has_usage ===
      true && retainedActivationSchemaPrivileges.rows[0]?.publication_owner_has_create ===
      false, "daily activation publication owner lost durable schema USAGE or retained CREATE");
    await admin.query("RESET ROLE");
    await admin.query(boundedMaintenanceMigration);
    await grantAndAssertReaderSummaryDailyProductionOwnerTopology({
      admin, migrationAdminRole, postMigrationSql: publicationPostMigrationSql,
      schemaOwnerRole,
    });
    const { historicalScope, upgradeScopes } =
      await withSchemaOwnerFixtureRole(admin, async (fixtureAdmin) => ({
        historicalScope: await seedHistoricalCompletedDailyJob(fixtureAdmin),
        upgradeScopes: await seedUpgradeStateDailyJobs(fixtureAdmin),
      }));
    let migrationFailure = "";
    try {
      await applyTelemetryMigrationAsMigrationAdmin(admin);
    } catch (error) {
      migrationFailure = error instanceof Error ? error.message : String(error);
      await admin.query("ROLLBACK");
    }
    assert(migrationFailure.includes(
      `RUNNING job for tenant ${upgradeScopes.running.tenantId}, workspace ` +
      `${upgradeScopes.running.workspaceId}, date ${upgradeScopes.running.date} ` +
      "has unknown provider effect"),
    "RUNNING upgrade did not fail closed with a precise unknown-effect diagnostic");
    const rolledBack = await admin.query<{ telemetry_function: string | null }>(
      `SELECT pg_catalog.to_regprocedure(
          'public.complete_reader_summary_daily_model_job_v2(uuid,uuid,date,text,bigint,timestamptz,bytea,character,jsonb,bytea,character,bytea,character,bigint,bigint,bigint,text,bigint)'
        )::text AS telemetry_function`,
    );
    assert(rolledBack.rows[0]?.telemetry_function === null,
    "failed unknown-effect migration did not roll back completion authorities");
    await withSchemaOwnerFixtureRole(admin, async (fixtureAdmin) => {
      await fixtureAdmin.query(`UPDATE public.reader_summary_daily_model_jobs
        SET state = 'FAILED_AMBIGUOUS', failed_ambiguous_at = CURRENT_TIMESTAMP
        WHERE tenant_id = $1 AND workspace_id = $2 AND requested_utc_date = $3`,
      [upgradeScopes.running.tenantId, upgradeScopes.running.workspaceId,
        upgradeScopes.running.date]);
      await fixtureAdmin.query(`UPDATE public.reader_summary_daily_execution_cursors
        SET active_requested_utc_date = NULL, lease_owner = NULL,
          leased_at = NULL, lease_expires_at = NULL, absolute_expires_at = NULL
        WHERE tenant_id = $1 AND workspace_id = $2`,
      [upgradeScopes.running.tenantId, upgradeScopes.running.workspaceId]);
    });
    let reservationFailure = "";
    try {
      await applyTelemetryMigrationAsMigrationAdmin(admin);
    } catch (error) {
      reservationFailure = error instanceof Error ? error.message : String(error);
      await admin.query("ROLLBACK");
    }
    assert(reservationFailure.includes(
      `RESERVED v1 job for tenant ${upgradeScopes.reserved.tenantId}, workspace ` +
      `${upgradeScopes.reserved.workspaceId}, date ${upgradeScopes.reserved.date} ` +
      "still has a live lease"),
    "live RESERVED upgrade did not fail closed with a precise lease diagnostic");
    await withSchemaOwnerFixtureRole(admin, async (fixtureAdmin) => {
      await fixtureAdmin.query(`UPDATE public.reader_summary_daily_execution_cursors
        SET lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '1 minute'
        WHERE tenant_id = $1 AND workspace_id = $2`,
      [upgradeScopes.reserved.tenantId, upgradeScopes.reserved.workspaceId]);
    });
    await transferActiveClaimOwner(admin, firstPool, publicationOwnerRole);
    let unexpectedOwnerFailure = "";
    try {
      await applyTelemetryMigrationAsMigrationAdmin(admin);
    } catch (error) {
      unexpectedOwnerFailure = error instanceof Error ? error.message : String(error);
      await admin.query("ROLLBACK");
    }
    const unexpectedOwnerRollback = await admin.query<{
      completion_function: string | null;
      owner_has_create: boolean;
    }>(`SELECT pg_catalog.to_regprocedure(
          'public.complete_reader_summary_daily_model_job_v2(uuid,uuid,date,text,bigint,timestamptz,bytea,character,jsonb,bytea,character,bytea,character,bigint,bigint,bigint,text,bigint)'
        )::TEXT AS completion_function,
        pg_catalog.has_schema_privilege($1, 'public', 'CREATE')
          AS owner_has_create`, [publicationOwnerRole]);
    assert(unexpectedOwnerFailure.includes("daily active claim has unexpected owner") &&
      unexpectedOwnerRollback.rows[0]?.completion_function === null &&
      unexpectedOwnerRollback.rows[0]?.owner_has_create === false,
    "unaccepted daily claim owner did not abort without durable migration effects");
    await transferActiveClaimOwner(admin, firstPool, migrationAdminRole);
    await applyTelemetryMigrationAsMigrationAdmin(admin);
    const rewrittenClaimProfiles = await admin.query<{
      active_definition: string;
      active_owner: string;
      active_owner_has_create: boolean;
      bounded_definition: string;
      bounded_owner: string;
      definer_has_create: boolean;
    }>(`SELECT
        pg_catalog.pg_get_functiondef(
          'public.claim_reader_summary_daily_execution(uuid,uuid,text,date,timestamp with time zone)'::pg_catalog.regprocedure
        ) AS active_definition,
        pg_catalog.pg_get_userbyid(active_claim.proowner) AS active_owner,
        pg_catalog.has_schema_privilege($1, 'public', 'CREATE')
          AS active_owner_has_create,
        pg_catalog.pg_get_functiondef(
          'public.claim_reader_summary_daily_execution_bounded_maintenance(uuid,uuid,text,date,timestamp with time zone)'::pg_catalog.regprocedure
        ) AS bounded_definition,
        pg_catalog.pg_get_userbyid(bounded_claim.proowner) AS bounded_owner,
        pg_catalog.has_schema_privilege($2, 'public', 'CREATE')
          AS definer_has_create
      FROM pg_catalog.pg_proc AS active_claim
      CROSS JOIN pg_catalog.pg_proc AS bounded_claim
      WHERE active_claim.oid =
          'public.claim_reader_summary_daily_execution(uuid,uuid,text,date,timestamp with time zone)'::pg_catalog.regprocedure
        AND bounded_claim.oid =
          'public.claim_reader_summary_daily_execution_bounded_maintenance(uuid,uuid,text,date,timestamp with time zone)'::pg_catalog.regprocedure`,
    [migrationAdminRole, definerRole]);
    for (const [claim, definition] of [
      ["active", rewrittenClaimProfiles.rows[0]?.active_definition],
      ["bounded", rewrittenClaimProfiles.rows[0]?.bounded_definition],
    ] as const) {
      assert(definition?.includes("'reader-summary-daily:v2'") === true &&
        definition.includes("'reader-summary-daily:v1'") === false &&
        definition.split("'high'").length - 1 === 2 &&
        definition.includes("'xhigh'") === false,
      `${claim} daily claim was not rewritten from v1/xhigh to v2/high`);
    }
    assert(
      rewrittenClaimProfiles.rows[0]?.active_owner === migrationAdminRole &&
        rewrittenClaimProfiles.rows[0]?.bounded_owner === schemaOwnerRole &&
        rewrittenClaimProfiles.rows[0]?.active_owner_has_create === false &&
        rewrittenClaimProfiles.rows[0]?.definer_has_create === false,
      "daily telemetry migration changed mixed ownership or retained accepted-owner CREATE",
    );
    await transferActiveClaimOwner(admin, firstPool, schemaOwnerRole);
    await withSchemaOwnerFixtureRole(admin, async (fixtureAdmin) => {
      const historical = await fixtureAdmin.query<{
        usage_source: string;
        input_tokens: string | null;
        output_tokens: string | null;
        total_tokens: string | null;
        duration_ms: string | null;
        identity: string;
        reasoning_effort: string;
      }>(`SELECT usage_source, input_tokens::text, output_tokens::text,
          total_tokens::text,
          duration_ms::text, identity, reasoning_effort
        FROM public.reader_summary_daily_model_jobs
        WHERE tenant_id = $1 AND workspace_id = $2`, [...historicalScope]);
      assert(historical.rows[0]?.usage_source === "HISTORICAL_INCOMPLETE" &&
        historical.rows[0]?.input_tokens === null &&
        historical.rows[0]?.output_tokens === null &&
        historical.rows[0]?.total_tokens === null &&
        historical.rows[0]?.duration_ms === null &&
        historical.rows[0]?.identity === "d".repeat(64) &&
        historical.rows[0]?.reasoning_effort === "xhigh",
      "upgraded historical completion acquired fabricated telemetry");
      await assertUpgradeStateResults(fixtureAdmin, upgradeScopes);
    });
    first = await firstPool.connect();
    second = await secondPool.connect();
    await Promise.all([
      first.query(`SET SESSION AUTHORIZATION ${quoteIdentifier(terminalRole)}`),
      second.query(`SET SESSION AUTHORIZATION ${quoteIdentifier(terminalRole)}`),
    ]);
    await withSchemaOwnerFixtureRole(admin, async (fixtureAdmin) => {
      await assertReaderSummaryDailyExecutionCursorPostgresContract({
        admin: fixtureAdmin,
        first: first!,
        second: second!,
        terminalRole,
        schemaOwnerRole,
        publicationOwnerRole,
      });
    });
    const retainedPublicationOwnerSchemaPrivileges = await admin.query<{
      publication_owner_has_create: boolean;
      publication_owner_has_usage: boolean;
    }>(`SELECT
        has_schema_privilege($1, 'public', 'USAGE')
          AS publication_owner_has_usage,
        has_schema_privilege($1, 'public', 'CREATE')
          AS publication_owner_has_create`, [publicationOwnerRole]);
    assert(
      retainedPublicationOwnerSchemaPrivileges.rows[0]
        ?.publication_owner_has_usage === true &&
      retainedPublicationOwnerSchemaPrivileges.rows[0]
        ?.publication_owner_has_create === false,
      "daily runtime publication owner lost durable schema USAGE or retained CREATE",
    );
    await admin.query(`SET ROLE ${quoteIdentifier(schemaOwnerRole)};
      REVOKE USAGE ON SCHEMA public
        FROM ${quoteIdentifier(migrationAdminRole)};
      RESET ROLE`);
    const retainedMigrationAdminSchemaPrivileges = await admin.query<{
      migration_admin_has_create: boolean;
      migration_admin_has_usage: boolean;
    }>(`SELECT
        has_schema_privilege($1, 'public', 'USAGE')
          AS migration_admin_has_usage,
        has_schema_privilege($1, 'public', 'CREATE')
          AS migration_admin_has_create`, [migrationAdminRole]);
    assert(retainedMigrationAdminSchemaPrivileges.rows[0]?.migration_admin_has_usage ===
      false &&
      retainedMigrationAdminSchemaPrivileges.rows[0]?.migration_admin_has_create === false,
    "daily execution cursor retained migration admin schema privileges");
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
  if (migrationAdminRoleCreated) {
    await server.query(`DROP ROLE ${quoteIdentifier(migrationAdminRole)}`);
  }
  await server.end();
};
let schemaOwnerFixtureRoleActive = false;

const withSchemaOwnerFixtureRole = async <T>(
  admin: PoolClient,
  operation: (fixtureAdmin: PoolClient) => Promise<T>,
): Promise<T> => {
  assert(!schemaOwnerFixtureRoleActive,
    "schema-owner fixture role scope cannot be nested or run in parallel");
  schemaOwnerFixtureRoleActive = true;
  let operationFailed = false;
  let operationError: unknown;
  let operationResult!: T;
  let resetFailed = false;
  let resetError: unknown;
  try {
    await admin.query(`SET ROLE ${quoteIdentifier(schemaOwnerRole)}`);
    operationResult = await operation(admin);
  } catch (error) {
    operationFailed = true;
    operationError = error;
  } finally {
    try {
      await admin.query("RESET ROLE");
    } catch (error) {
      resetFailed = true;
      resetError = error;
    }
    schemaOwnerFixtureRoleActive = false;
  }
  if (operationFailed) {
    throw operationError;
  }
  if (resetFailed) {
    throw resetError;
  }
  return operationResult;
};

const applyTelemetryMigrationAsMigrationAdmin = async (
  admin: PoolClient,
): Promise<void> => {
  assert(!schemaOwnerFixtureRoleActive,
    "telemetry migration cannot run inside schema-owner fixture role scope");
  await admin.query("RESET ROLE");
  await executePostgresMigrationWithDiagnostics(admin, {
    migrationLabel:
      "20260824120000_reader_summary_daily_model_job_telemetry/migration.sql",
    sql: telemetryMigration,
  });
};

const transferActiveClaimOwner = async (
  admin: PoolClient,
  bootstrapTarget: Pool,
  ownerRole: string,
): Promise<void> => {
  const result = await admin.query<{
    current_owner: string; owner_has_create: boolean;
  }>(`SELECT pg_catalog.pg_get_userbyid(proowner) AS current_owner,
      pg_catalog.has_schema_privilege(proowner, 'public', 'CREATE') AS owner_has_create
    FROM pg_catalog.pg_proc WHERE oid =
      'public.claim_reader_summary_daily_execution(uuid,uuid,text,date,timestamp with time zone)'::pg_catalog.regprocedure`);
  const currentOwner = result.rows[0]?.current_owner;
  assert(currentOwner !== undefined && result.rows[0]?.owner_has_create === false,
    "active-claim fixture transfer requires the current owner without schema CREATE " +
      `(currentOwner=${currentOwner ?? "missing"})`);
  await bootstrapTarget.query(`
    ALTER FUNCTION public.claim_reader_summary_daily_execution(
      UUID, UUID, TEXT, DATE, TIMESTAMPTZ
    ) OWNER TO ${quoteIdentifier(ownerRole)}`);
};
const roleExists = async (role: string, admin: PoolClient): Promise<boolean> => {
  const result = await admin.query<{ present: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS present",
    [role],
  );
  return result.rows[0]?.present === true;
};

const assertRoleCanResolveActivationRelation = async (
  admin: PoolClient,
  role: string,
  relation: string,
  diagnostic: string,
): Promise<void> => {
  let failure: unknown;
  try {
    await admin.query(`SET ROLE ${quoteIdentifier(role)}`);
    const result = await admin.query<{ resolvable: boolean; role: string }>(
      `SELECT pg_catalog.to_regclass($1) IS NOT NULL AS resolvable,
        current_user AS role`,
      [relation],
    );
    assert(result.rows[0]?.role === role && result.rows[0]?.resolvable === true,
      `${diagnostic}: role switch or schema-qualified resolution failed`);
  } catch (error) {
    failure = error;
  } finally {
    await admin.query("RESET ROLE");
  }
  assert(failure === undefined,
    `${diagnostic}: ${failure instanceof Error ? failure.message : String(failure)}`);
};
const assertBootstrapSessionIsSuperuser = async (): Promise<void> => {
  const result = await server.query<{ safe: boolean }>(`SELECT role.rolsuper AS safe
    FROM pg_catalog.pg_roles AS role WHERE role.rolname = session_user`);
  assert(result.rows[0]?.safe === true,
    "daily execution cursor bootstrap requires a superuser session");
};

const ensureBootstrapAdminMembership = async (role: string): Promise<void> => {
  const existing = await server.query<{ present: boolean }>(`SELECT EXISTS (
      SELECT 1 FROM pg_catalog.pg_auth_members AS membership
      JOIN pg_catalog.pg_roles AS granted ON granted.oid = membership.roleid
      JOIN pg_catalog.pg_roles AS member ON member.oid = membership.member
      JOIN pg_catalog.pg_roles AS grantor ON grantor.oid = membership.grantor
      WHERE granted.rolname = $1 AND member.rolname = $2 AND grantor.rolsuper
        AND membership.admin_option AND NOT membership.inherit_option
        AND NOT membership.set_option
    ) AS present`, [role, migrationAdminRole]);
  if (existing.rows[0]?.present !== true) {
    await server.query(`GRANT ${quoteIdentifier(role)}
      TO ${quoteIdentifier(migrationAdminRole)}
      WITH ADMIN TRUE, INHERIT FALSE, SET FALSE GRANTED BY CURRENT_USER`);
  }
};

const assertBootstrapRoleInvariants = async (admin: PoolClient): Promise<void> => {
  const result = await admin.query<{
    terminal_safe: boolean;
    definer_safe: boolean;
    migration_admin_safe: boolean;
    auxiliary_safe: boolean;
  }>(`SELECT
      terminal.rolcanlogin AND NOT terminal.rolinherit
        AND NOT terminal.rolsuper AND NOT terminal.rolcreatedb
        AND NOT terminal.rolcreaterole AND NOT terminal.rolreplication
        AND NOT terminal.rolbypassrls
        AND terminal.rolconfig IS NOT DISTINCT FROM
          ARRAY['search_path=pg_catalog, public']::TEXT[]
        AND NOT EXISTS (
          SELECT 1 FROM pg_catalog.pg_auth_members AS membership
          WHERE membership.member = terminal.oid
        )
        AND (SELECT count(*) <= 1 AND count(*) = count(*) FILTER (
          WHERE member.rolname = session_user AND grantor.rolsuper
            AND membership.admin_option AND NOT membership.inherit_option
            AND NOT membership.set_option)
          FROM pg_catalog.pg_auth_members AS membership
          JOIN pg_catalog.pg_roles AS member ON member.oid = membership.member
          JOIN pg_catalog.pg_roles AS grantor ON grantor.oid = membership.grantor
          WHERE membership.roleid = terminal.oid) AS terminal_safe,
      NOT definer.rolcanlogin AND NOT definer.rolinherit
        AND NOT definer.rolsuper AND NOT definer.rolcreatedb
        AND NOT definer.rolcreaterole AND NOT definer.rolreplication
        AND NOT definer.rolbypassrls AND definer.rolconfig IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM pg_catalog.pg_auth_members AS membership
          WHERE membership.member = definer.oid
        )
        AND (SELECT count(*) = 1 AND count(*) FILTER (
          WHERE member.rolname = session_user AND grantor.rolsuper
            AND membership.admin_option AND NOT membership.inherit_option
            AND NOT membership.set_option) = 1
          FROM pg_catalog.pg_auth_members AS membership
          JOIN pg_catalog.pg_roles AS member ON member.oid = membership.member
          JOIN pg_catalog.pg_roles AS grantor ON grantor.oid = membership.grantor
          WHERE membership.roleid = definer.oid) AS definer_safe
      ,NOT migration_admin.rolcanlogin AND migration_admin.rolinherit
        AND NOT migration_admin.rolsuper AND NOT migration_admin.rolcreatedb
        AND migration_admin.rolcreaterole AND NOT migration_admin.rolreplication
        AND NOT migration_admin.rolbypassrls AS migration_admin_safe
      ,(SELECT count(*) = 5 AND bool_and(
          NOT role.rolcanlogin AND NOT role.rolinherit
            AND NOT role.rolsuper AND NOT role.rolcreatedb
            AND NOT role.rolcreaterole AND NOT role.rolreplication
            AND NOT role.rolbypassrls)
        FROM pg_catalog.pg_roles AS role
        WHERE role.rolname = ANY($3::TEXT[])) AS auxiliary_safe
    FROM pg_catalog.pg_roles AS terminal
    CROSS JOIN pg_catalog.pg_roles AS definer
    CROSS JOIN pg_catalog.pg_roles AS migration_admin
    WHERE terminal.rolname = $1 AND definer.rolname = $2
      AND migration_admin.rolname = session_user`,
  [terminalRole, definerRole, [
    schemaOwnerRole, definerRole, publicationOwnerRole,
    publicationRuntimeRole, tenantSystemRuntimeRole,
  ]]);
  assert(result.rows[0]?.terminal_safe === true,
    "daily terminal PG18 bootstrap role is unsafe");
  assert(result.rows[0]?.definer_safe === true,
    "daily activation definer PG18 bootstrap membership is unsafe");
  assert(result.rows[0]?.migration_admin_safe === true,
    "daily execution cursor migration admin is unsafe");
  assert(result.rows[0]?.auxiliary_safe === true,
    "daily execution cursor auxiliary role is unsafe");
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
    tenant_id UUID NOT NULL,
    workspace_id UUID NOT NULL,
    canonical_bytes BYTEA NOT NULL,
    canonical_sha256 CHAR(64) NOT NULL
  );
  CREATE OR REPLACE FUNCTION public.social_monitor_rls_system_access()
  RETURNS BOOLEAN
  LANGUAGE sql
  STABLE
  PARALLEL SAFE
  SET search_path = pg_catalog
  AS $$
    SELECT
      current_user = 'social_monitor_reader_summary_publication_owner'
      OR (
        current_setting('social_monitor.system_access', TRUE) = 'true'
        AND pg_has_role(
          current_user,
          'social_monitor_tenant_system_runtime',
          'USAGE'
        )
      )
  $$;
  CREATE OR REPLACE FUNCTION public.social_monitor_rls_workspace_match(
    row_tenant_id UUID,
    row_workspace_id UUID
  )
  RETURNS BOOLEAN
  LANGUAGE sql
  STABLE
  PARALLEL SAFE
  SET search_path = pg_catalog
  AS $$
    SELECT
      public.social_monitor_rls_system_access()
      OR (
        row_tenant_id =
          NULLIF(current_setting('social_monitor.tenant_id', TRUE), '')::UUID
        AND row_workspace_id =
          NULLIF(current_setting('social_monitor.workspace_id', TRUE), '')::UUID
      )
  $$;
  ALTER TABLE reader_summary_artifacts ENABLE ROW LEVEL SECURITY;
  ALTER TABLE reader_summary_artifacts FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON reader_summary_artifacts
    USING (public.social_monitor_rls_workspace_match(tenant_id, workspace_id))
    WITH CHECK (public.social_monitor_rls_workspace_match(tenant_id, workspace_id));
  ALTER TABLE reader_summary_publications ENABLE ROW LEVEL SECURITY;
  ALTER TABLE reader_summary_publications FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON reader_summary_publications
    USING (public.social_monitor_rls_workspace_match(tenant_id, workspace_id))
    WITH CHECK (public.social_monitor_rls_workspace_match(tenant_id, workspace_id));
  ALTER TABLE reader_summary_weekly_publication_evidence ENABLE ROW LEVEL SECURITY;
  ALTER TABLE reader_summary_weekly_publication_evidence FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON reader_summary_weekly_publication_evidence
    USING (public.social_monitor_rls_workspace_match(tenant_id, workspace_id))
    WITH CHECK (public.social_monitor_rls_workspace_match(tenant_id, workspace_id));
  ALTER TABLE reader_summary_jobs ENABLE ROW LEVEL SECURITY;
  ALTER TABLE reader_summary_jobs FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation ON reader_summary_jobs
    USING (public.social_monitor_rls_workspace_match(tenant_id, workspace_id))
    WITH CHECK (public.social_monitor_rls_workspace_match(tenant_id, workspace_id));
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

type UpgradeScope = Readonly<{
  tenantId: string;
  workspaceId: string;
  date: string;
}>;

const seedUpgradeStateDailyJobs = async (admin: PoolClient): Promise<Readonly<{
  reserved: UpgradeScope;
  running: UpgradeScope;
}>> => {
  const reserved = {
    tenantId: "70000000-0000-4000-8000-000000000007",
    workspaceId: "71000000-0000-4000-8000-000000000007",
    date: "2026-07-02",
  } as const;
  const running = {
    tenantId: "80000000-0000-4000-8000-000000000008",
    workspaceId: "81000000-0000-4000-8000-000000000008",
    date: "2026-07-03",
  } as const;
  for (const [scope, state, expired] of [
    [reserved, "RESERVED", false],
    [running, "RUNNING", false],
  ] as const) {
    const sourceBytes = Buffer.from(JSON.stringify({ date: scope.date }), "utf8");
    const sourceSha = createHash("sha256").update(sourceBytes).digest("hex");
    const identity = createHash("sha256").update([
      "reader-summary-daily:v1", scope.tenantId, scope.workspaceId,
      scope.date, sourceSha, "codex", "gpt-5.6-sol", "xhigh",
    ].join("|")).digest("hex");
    await admin.query(`INSERT INTO public.reader_summary_daily_source_authorities
      (tenant_id, workspace_id, requested_utc_date, ingestion_cutoff,
       canonical_record, canonical_bytes, canonical_sha256, created_at)
      VALUES ($1,$2,$3,CURRENT_TIMESTAMP,$4::JSONB,$5,$6,CURRENT_TIMESTAMP)`,
    [scope.tenantId, scope.workspaceId, scope.date,
      JSON.stringify({ date: scope.date }), sourceBytes, sourceSha]);
    await admin.query(`INSERT INTO public.reader_summary_daily_model_jobs
      (tenant_id, workspace_id, requested_utc_date, identity,
       source_authority_sha256, provider, model, reasoning_effort,
       runtime_engine, state, reserved_at, running_at)
      VALUES ($1,$2,$3,$4,$5,'codex','gpt-5.6-sol','xhigh',
        'subscription-runtime-cli',$6,CURRENT_TIMESTAMP,
        CASE WHEN $6 = 'RUNNING' THEN CURRENT_TIMESTAMP ELSE NULL END)`,
    [scope.tenantId, scope.workspaceId, scope.date, identity, sourceSha, state]);
    await admin.query(`INSERT INTO public.reader_summary_daily_execution_cursors
      (tenant_id, workspace_id, next_unresolved_utc_date,
       active_requested_utc_date, lease_owner, fencing_token, leased_at,
       lease_expires_at, absolute_expires_at)
      VALUES ($1,$2,$3,$3,$4,1,CURRENT_TIMESTAMP - INTERVAL '30 minutes',
        CURRENT_TIMESTAMP + CASE WHEN $5 THEN INTERVAL '-1 minute'
          ELSE INTERVAL '10 minutes' END,
        CURRENT_TIMESTAMP + INTERVAL '1 hour')`,
    [scope.tenantId, scope.workspaceId, scope.date, `upgrade-${state.toLowerCase()}`,
      expired]);
  }
  return { reserved, running };
};

const assertUpgradeStateResults = async (
  admin: PoolClient,
  scopes: Readonly<{ reserved: UpgradeScope; running: UpgradeScope }>,
): Promise<void> => {
  const rows = await admin.query<{
    tenant_id: string;
    state: string;
    identity: string;
    reasoning_effort: string;
    usage_source: string;
    lease_owner: string | null;
  }>(`SELECT job.tenant_id::text, job.state, job.identity,
      job.reasoning_effort, job.usage_source, cursor.lease_owner
    FROM public.reader_summary_daily_model_jobs AS job
    JOIN public.reader_summary_daily_execution_cursors AS cursor
      USING (tenant_id, workspace_id)
    WHERE job.tenant_id IN ($1,$2)
    ORDER BY job.tenant_id`, [scopes.reserved.tenantId, scopes.running.tenantId]);
  const reserved = rows.rows.find((row) => row.tenant_id === scopes.reserved.tenantId);
  const running = rows.rows.find((row) => row.tenant_id === scopes.running.tenantId);
  assert(reserved?.state === "RESERVED" &&
    reserved.reasoning_effort === "high" &&
    reserved.usage_source === "UNAVAILABLE" &&
    reserved.lease_owner === null &&
    reserved.identity === createHash("sha256").update([
      "reader-summary-daily:v2", scopes.reserved.tenantId,
      scopes.reserved.workspaceId, scopes.reserved.date,
      createHash("sha256").update(Buffer.from(JSON.stringify({
        date: scopes.reserved.date,
      }), "utf8")).digest("hex"), "codex", "gpt-5.6-sol", "high",
    ].join("|")).digest("hex"),
  "expired RESERVED v1 job was not deterministically reconciled to v2/high");
  assert(running?.state === "FAILED_AMBIGUOUS" &&
    running.reasoning_effort === "xhigh" &&
    running.usage_source === "HISTORICAL_INCOMPLETE",
  "terminal ambiguity history was rewritten during the v2 upgrade");
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
