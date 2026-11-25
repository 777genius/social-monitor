import { createHash } from "node:crypto";

import {
  dailyCompletionReceiptFixture,
  replaceCompletionValue,
} from "./reader-summary-daily-execution-cursor-receipt-contract";

export type ReaderSummaryDailyPostgresClient = Readonly<{
  query<TRow extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    values?: readonly unknown[],
  ): Promise<Readonly<{ rows: readonly TRow[]; rowCount: number | null }>>;
}>;

const canonicalSchemaOwnerRole = "social_monitor_public_schema_owner";
const canonicalPublicationOwnerRole =
  "social_monitor_reader_summary_publication_owner";

export const withCanonicalPublicationFixtureRole = async <T>(params: {
  readonly admin: ReaderSummaryDailyPostgresClient;
  readonly schemaOwnerRole: string;
  readonly publicationOwnerRole: string;
  readonly operation: () => Promise<T>;
  readonly afterRestore: () => Promise<void>;
}): Promise<T> => {
  assert(params.schemaOwnerRole === canonicalSchemaOwnerRole,
    "canonical publication fixture requires the fixed schema owner role");
  assert(params.publicationOwnerRole === canonicalPublicationOwnerRole,
    "canonical publication fixture requires the fixed publication owner role");
  let operationFailed = false;
  let operationError: unknown;
  let operationResult!: T;
  let restorationFailed = false;
  let restorationError: unknown;
  let afterRestoreFailed = false;
  let afterRestoreError: unknown;
  try {
    await params.admin.query(
      `SET ROLE ${quoteRoleIdentifier(params.publicationOwnerRole)}`,
    );
    operationResult = await params.operation();
  } catch (error) {
    operationFailed = true;
    operationError = error;
  } finally {
    try {
      await params.admin.query(
        `SET ROLE ${quoteRoleIdentifier(params.schemaOwnerRole)}`,
      );
    } catch (error) {
      restorationFailed = true;
      restorationError = error;
    }
    if (!restorationFailed) {
      try {
        await params.afterRestore();
      } catch (error) {
        afterRestoreFailed = true;
        afterRestoreError = error;
      }
    }
  }
  if (operationFailed) throw operationError;
  if (restorationFailed) throw restorationError;
  if (afterRestoreFailed) throw afterRestoreError;
  return operationResult;
};

export const assertReaderSummaryDailyCheckerRoleBootstrapContract = (
  source: string,
): void => {
  assert(source.includes(`CREATE ROLE \${quoteIdentifier(terminalRole)} LOGIN`),
    "daily checker must create the terminal as a LOGIN role");
  assert(source.includes("NOCREATEROLE NOINHERIT") &&
    source.includes("NOREPLICATION NOBYPASSRLS"),
    "daily checker roles must remain NOINHERIT and least privilege");
  assert(source.includes(`await roleAdmin.query("SET createrole_self_grant = ''")`),
    "daily checker must pin the PostgreSQL 18 creator membership mode");
  assert(source.includes("NOLOGIN\n    NOSUPERUSER NOCREATEDB CREATEROLE INHERIT") &&
    source.includes("SET SESSION AUTHORIZATION ${quoteIdentifier(migrationAdminRole)}"),
  "daily checker migrations must use a distinct least-privilege migration admin");
  const definerAudit = source.slice(
    source.indexOf("NOT definer.rolcanlogin"),
    source.indexOf("AS definer_safe") + "AS definer_safe".length,
  );
  assert(definerAudit.includes("count(*) = 1 AND count(*) FILTER (") &&
    definerAudit.includes("member.rolname = session_user AND grantor.rolsuper") &&
    definerAudit.includes(
      "membership.admin_option AND NOT membership.inherit_option",
    ) && definerAudit.includes("AND NOT membership.set_option) = 1"),
  "daily checker must audit the exact definer bootstrap membership");
  assert(definerAudit.includes("WHERE membership.member = definer.oid"),
    "daily checker must reject outgoing definer memberships");
  assert(source.includes("if (terminalRoleCreated)") &&
    source.includes("for (const role of auxiliaryRolesCreated.reverse())") &&
    source.includes("if (migrationAdminRoleCreated)"),
  "daily checker cleanup must preserve pre-existing roles");
};

export const assertReaderSummaryDailyCheckerFixtureRoleContract = (
  source: string,
): void => {
  const helperStart = source.indexOf("const withSchemaOwnerFixtureRole = async");
  const telemetryHelperStart = source.indexOf(
    "const applyTelemetryMigrationAsMigrationAdmin = async",
  );
  const helperSource = source.slice(helperStart, telemetryHelperStart);
  const telemetryHelperSource = source.slice(
    telemetryHelperStart,
    source.indexOf("const roleExists = async", telemetryHelperStart),
  );
  assert(helperStart >= 0 && telemetryHelperStart > helperStart &&
    helperSource.includes("assert(!schemaOwnerFixtureRoleActive") &&
    helperSource.includes("schemaOwnerFixtureRoleActive = true") &&
    helperSource.includes("SET ROLE ${quoteIdentifier(schemaOwnerRole)}") &&
    helperSource.includes("finally {") &&
    helperSource.includes('await admin.query("RESET ROLE")') &&
    helperSource.includes("if (operationFailed)") &&
    helperSource.indexOf("throw operationError") >
      helperSource.indexOf('await admin.query("RESET ROLE")') &&
    helperSource.includes("schemaOwnerFixtureRoleActive = false"),
  "daily checker schema-owner fixture scope must reject overlap and reset fail-safe");
  assert(telemetryHelperSource.includes("assert(!schemaOwnerFixtureRoleActive") &&
    telemetryHelperSource.indexOf('await admin.query("RESET ROLE")') <
      telemetryHelperSource.indexOf(
        "await executePostgresMigrationWithDiagnostics(admin, {",
      ) &&
    telemetryHelperSource.includes(
      '"20260824120000_reader_summary_daily_model_job_telemetry/migration.sql"',
    ) && telemetryHelperSource.includes("sql: telemetryMigration"),
  "daily checker telemetry migrations must reset to migration admin first");
  assert(!source.includes("admin.query(telemetryMigration)") &&
    source.match(/await applyTelemetryMigrationAsMigrationAdmin\(admin\)/gu)?.length === 4,
  "daily checker must route every telemetry migration through diagnosed reset boundary");
  assert(source.includes(`await admin.query("RESET ROLE");
    await admin.query(boundedMaintenanceMigration);`),
  "daily checker bounded maintenance migration must run after RESET ROLE");
  assert(source.includes(`await withSchemaOwnerFixtureRole(admin, async (fixtureAdmin) => ({
        historicalScope: await seedHistoricalCompletedDailyJob(fixtureAdmin),
        upgradeScopes: await seedUpgradeStateDailyJobs(fixtureAdmin),
      }))`) &&
    source.match(
      /await withSchemaOwnerFixtureRole\(admin, async \(fixtureAdmin\) =>/gu,
    )?.length === 5,
  "daily checker must bound all direct fixture operations as schema owner");
  assert(source.includes(
    `await withSchemaOwnerFixtureRole(admin, async (fixtureAdmin) => {
      await assertReaderSummaryDailyExecutionCursorPostgresContract({`),
  "daily checker PostgreSQL fixture contract must run in schema-owner scope");
  const migrationAdminTableGrant = new RegExp(
    "GRANT[\\s\\S]{0,120}ON(?: TABLE)? public\\." +
      "(?:reader_summary_daily_[a-z_]+|reader_summary_(?:artifacts|publications|jobs)|" +
      "reader_summary_weekly_publication_evidence|source_items|feed_items)" +
      "[\\s\\S]{0,120}" +
      "TO \\$\\{quoteIdentifier\\(migrationAdminRole\\)\\}",
    "iu",
  );
  assert(!migrationAdminTableGrant.test(source),
    "daily checker must not grant migration admin daily or canonical table privileges");
};

export const assertReaderSummaryDailyCheckerActivationOwnershipContract = (
  source: string,
): void => {
  const schemaHandoff = source.indexOf(
    "ALTER SCHEMA public OWNER TO ${quoteIdentifier(schemaOwnerRole)}",
  );
  const activation = source.indexOf(
    "await executePostgresMigrationWithDiagnostics(admin, {",
  );
  const activationAcl = source.indexOf("await admin.query(activationAclMigration)");
  assert(schemaHandoff >= 0 && activation > schemaHandoff && activationAcl > activation,
    "daily checker activation phases must remain ordered");
  const publicAclResetStatement = "REVOKE ALL ON SCHEMA public FROM PUBLIC;";
  const publicAclReset = source.indexOf(publicAclResetStatement);
  const migrationAdminUsageGrantPattern =
    /GRANT USAGE ON SCHEMA public\s+TO \$\{quoteIdentifier\(migrationAdminRole\)\}/gu;
  const migrationAdminUsageGrants = [
    ...source.matchAll(migrationAdminUsageGrantPattern),
  ];
  const migrationAdminUsageGrant = migrationAdminUsageGrants[0]?.index ?? -1;
  const definerUsageGrantPattern =
    /GRANT USAGE ON SCHEMA public\s+TO \$\{quoteIdentifier\(definerRole\)\}/gu;
  const definerUsageGrants = [...source.matchAll(definerUsageGrantPattern)];
  const definerUsageGrant = definerUsageGrants[0]?.index ?? -1;
  const activationAclPrivilegeBoundary = source.indexOf(
    "activationAclSchemaPrivileges.rows[0]?.publication_owner_has_create === false",
  );
  const retainedActivationPrivilegeProof = source.indexOf(
    "retainedActivationSchemaPrivileges",
    activationAcl,
  );
  const retainedActivationUsage = source.indexOf(
    "publication_owner_has_usage ===\n      true &&",
    retainedActivationPrivilegeProof,
  );
  const fixtureDefinerCreateGrant =
    /GRANT\s+(?:CREATE|USAGE\s*,\s*CREATE|CREATE\s*,\s*USAGE|ALL(?:\s+PRIVILEGES)?)\s+ON SCHEMA public\s+TO \$\{quoteIdentifier\(definerRole\)\}/iu;
  const tableHandoff = source.indexOf(
    "ALTER TABLE public.reader_summary_jobs\n" +
      "        OWNER TO ${quoteIdentifier(schemaOwnerRole)}",
  );
  const temporaryPublicationGrant = source.indexOf(
    "GRANT USAGE, CREATE ON SCHEMA public\n" +
      "        TO ${quoteIdentifier(publicationOwnerRole)}",
    schemaHandoff,
  );
  assert(source.split(publicAclResetStatement).length === 2 &&
    publicAclReset > schemaHandoff,
  "daily checker must revoke implicit PUBLIC schema access as the schema owner");
  assert(migrationAdminUsageGrants.length === 1 &&
    migrationAdminUsageGrant > publicAclReset &&
    tableHandoff > migrationAdminUsageGrant &&
    temporaryPublicationGrant > tableHandoff &&
    activation > temporaryPublicationGrant,
  "daily checker must order PUBLIC revoke, one migration-admin USAGE-only grant, " +
    "table handoff, temporary publication-owner grant, and activation");
  assert(source.includes(`SET ROLE \${quoteIdentifier(schemaOwnerRole)};
      REVOKE ALL ON SCHEMA public FROM PUBLIC;
      GRANT USAGE ON SCHEMA public
        TO \${quoteIdentifier(migrationAdminRole)};
      RESET ROLE`),
  "daily checker schema owner must grant migration-admin USAGE immediately after " +
    "the PUBLIC revoke");
  assert(!/GRANT\s+(?:ALL(?:\s+PRIVILEGES)?|(?:USAGE|CREATE)(?:\s*,\s*(?:USAGE|CREATE))?)\s+ON\s+SCHEMA\s+public\s+TO\s+PUBLIC\b/iu
    .test(source.slice(publicAclReset + 1)),
  "daily checker must not re-grant PUBLIC schema privileges after bootstrap");
  assert(!fixtureDefinerCreateGrant.test(source),
    "daily checker fixture must not grant schema CREATE to the activation definer");
  assert(definerUsageGrants.length === 1 &&
    definerUsageGrant > publicAclReset &&
    definerUsageGrant > activationAclPrivilegeBoundary &&
    definerUsageGrant < activationAcl,
  "daily checker must grant exactly one explicit definer USAGE-only fixture ACL " +
    "after the PUBLIC revoke and before activation ACL migration");
  assert(source.includes(`SET ROLE \${quoteIdentifier(schemaOwnerRole)};
      GRANT USAGE ON SCHEMA public
        TO \${quoteIdentifier(definerRole)};
      RESET ROLE`),
  "daily checker schema owner must directly grant the definer fixture USAGE-only");
  assert(retainedActivationPrivilegeProof > activationAcl &&
    retainedActivationUsage > retainedActivationPrivilegeProof &&
    source.indexOf("publication_owner_has_create ===\n      false",
      retainedActivationUsage) > retainedActivationUsage,
  "daily checker must prove durable publication-owner USAGE without CREATE after " +
    "activation ACL");
  assert(!/REVOKE USAGE ON SCHEMA public\s+FROM \$\{quoteIdentifier\(publicationOwnerRole\)\}/iu
    .test(source),
  "daily checker must not revoke durable publication-owner schema USAGE");
  for (const table of [
    "reader_summary_daily_execution_cursors",
    "reader_summary_daily_source_authorities",
    "reader_summary_daily_model_jobs",
    "source_items",
    "feed_items",
  ]) {
    const handoffs = [...source.matchAll(new RegExp(
      `ALTER TABLE public\\.${table}\\s+OWNER TO ` +
        "\\$\\{quoteIdentifier\\(schemaOwnerRole\\)\\}",
      "gu",
    ))];
    assert(handoffs.length === 1 && handoffs[0]!.index > schemaHandoff &&
      handoffs[0]!.index < activation,
    `daily checker must hand ${table} to the schema owner before activation`);
  }
  for (const signature of [
    "reject_reader_summary_daily_source_authority_mutation()",
    "renew_reader_summary_daily_execution_lease(",
    "mark_reader_summary_daily_model_job_running(",
  ]) {
    const functionHandoff = source.indexOf(`ALTER FUNCTION public.${signature}`);
    assert(functionHandoff > activation && functionHandoff < activationAcl,
      `daily checker must hand ${signature} to the schema owner after activation`);
  }
  const activeClaimHandoff = source.indexOf(
    "await transferActiveClaimOwner(admin, firstPool, migrationAdminRole);",
  );
  const transferHelper = source.slice(
    source.indexOf("const transferActiveClaimOwner = async"),
    source.indexOf("const roleExists = async"),
  );
  assert(activeClaimHandoff > activation && activeClaimHandoff < activationAcl &&
    source.match(/await transferActiveClaimOwner\(admin, firstPool, migrationAdminRole\);/gu)
      ?.length === 2 &&
    source.match(/await transferActiveClaimOwner\(admin, firstPool, publicationOwnerRole\);/gu)
      ?.length === 1 &&
    source.match(/await transferActiveClaimOwner\(admin, firstPool, schemaOwnerRole\);/gu)
      ?.length === 1,
  "daily checker must reproduce and restore the mixed and unaccepted owner topologies");
  const mixedOwnerProof = source.indexOf("rewrittenClaimProfiles");
  const runtimeOwnerHandoff = source.indexOf(
    "await transferActiveClaimOwner(admin, firstPool, schemaOwnerRole);",
  );
  const runtimeContract = source.indexOf(
    "await assertReaderSummaryDailyExecutionCursorPostgresContract({",
  );
  assert(mixedOwnerProof > activeClaimHandoff && runtimeOwnerHandoff > mixedOwnerProof &&
    runtimeContract > runtimeOwnerHandoff &&
    source.includes("grantAndAssertReaderSummaryDailyProductionOwnerTopology({\n" +
      "      admin, migrationAdminRole, schemaOwnerRole,\n" +
      "    });"),
  "daily checker must reproduce and prove the production mixed-owner topology");
  assert(transferHelper.includes(
    "pg_catalog.pg_get_userbyid(proowner) AS current_owner",
  ) && transferHelper.includes(
    "owner_has_create === false",
  ) && transferHelper.includes(
    "bootstrapTarget: Pool",
  ) && transferHelper.includes(
    "await bootstrapTarget.query(`\n    ALTER FUNCTION " +
      "public.claim_reader_summary_daily_execution(",
  ) && !transferHelper.includes("RESET SESSION AUTHORIZATION"),
  "daily checker must use its authenticated PG18 bootstrap role only for fixture handoff");
  assert(!source.includes("REFERENCES ON TABLE public.reader_summary_jobs"),
    "daily checker must not grant migration-admin REFERENCES after table handoff");
  const activationDiagnostics = source.slice(
    activation,
    source.indexOf("await admin.query(activationAclMigration)", activation),
  );
  assert(source.match(/executePostgresMigrationWithDiagnostics\(admin, \{/gu)?.length === 2 &&
    activationDiagnostics.match(
      /executePostgresMigrationWithDiagnostics\(admin, \{/gu,
    )?.length === 1 &&
    activationDiagnostics.includes("sql: activationMigration") &&
    !source.includes("locatePostgresMigrationFailureForTestDiagnostics") &&
    !source.includes("activationParams"),
  "daily checker must execute the whole activation migration exactly once");
};

export const assertReaderSummaryDailyProductionOwnerTopologyFixtureContract = (
  source: string,
): void => {
  const grant = source.indexOf("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE");
  const topology = source.indexOf("const topology = await admin.query");
  const proof = source.indexOf("const row = topology.rows[0]");
  assert(grant >= 0 && topology > grant && proof > topology &&
    source.includes("SET ROLE ${quoteIdentifier(schemaOwnerRole)};") &&
    source.includes("TO ${quoteIdentifier(migrationAdminRole)} GRANTED BY CURRENT_USER") &&
    source.includes("public.reader_summary_daily_execution_cursors") &&
    source.includes("public.reader_summary_daily_model_jobs") &&
    source.match(/pg_catalog\.count\(\*\) = 4/gu)?.length === 2 &&
    source.match(/ARRAY\['SELECT', 'INSERT', 'UPDATE', 'DELETE'\]/gu)?.length === 2 &&
    source.includes("acl.grantor = cursor_relation.relowner") &&
    source.includes("acl.grantor = job_relation.relowner") &&
    source.match(/NOT pg_catalog\.bool_or\(acl\.is_grantable\)/gu)?.length === 2 &&
    source.includes("row.active_owner_has_create === false") &&
    source.includes("row.cursor_owner === schemaOwnerRole") &&
    source.includes("row.cursor_acl_exact === true") &&
    source.includes("row.job_owner === schemaOwnerRole") &&
    source.includes("row.job_acl_exact === true") &&
    source.includes("row.bounded_owner === schemaOwnerRole") &&
    source.includes("row.bounded_owner_has_create === true") &&
    source.includes("row.fixture_current_user === migrationAdminRole") &&
    source.includes("row.fixture_session_user === migrationAdminRole"),
  "daily production topology fixture must grant and prove exact owner table ACLs");
};

export const assertReaderSummaryDailyCheckerCanonicalRlsContract = (
  source: string,
): void => {
  const fixtureStart = source.indexOf("const baseSchemaSql = `");
  const fixtureEnd = source.indexOf("`;", fixtureStart);
  assert(fixtureStart >= 0 && fixtureEnd > fixtureStart,
    "daily checker base schema fixture is missing");
  const fixture = source.slice(fixtureStart, fixtureEnd);
  const canonicalTables = [
    "reader_summary_artifacts",
    "reader_summary_publications",
    "reader_summary_weekly_publication_evidence",
    "reader_summary_jobs",
  ] as const;
  const rlsStatements = [...fixture.matchAll(
    /ALTER TABLE ([a-z_]+) (ENABLE|FORCE) ROW LEVEL SECURITY;/gu,
  )];
  for (const table of canonicalTables) {
    for (const boundary of ["ENABLE", "FORCE"] as const) {
      assert(rlsStatements.filter((match) =>
        match[1] === table && match[2] === boundary).length === 1,
      `daily checker must ${boundary} RLS on canonical fixture table ${table}`);
    }
  }
  assert(rlsStatements.length === canonicalTables.length * 2 &&
    rlsStatements.every((match) => canonicalTables.includes(
      match[1] as (typeof canonicalTables)[number],
    )), "daily checker must apply RLS only to the four canonical fixture tables");
  assert(fixture.includes(
    "CREATE OR REPLACE FUNCTION public.social_monitor_rls_system_access()",
  ) && fixture.includes(
    "CREATE OR REPLACE FUNCTION public.social_monitor_rls_workspace_match(",
  ), "daily checker canonical fixture must use the bounded production RLS helpers");
  const policies = [...fixture.matchAll(
    /CREATE POLICY tenant_isolation ON ([a-z_]+)\s+USING \(public\.social_monitor_rls_workspace_match\(tenant_id, workspace_id\)\)\s+WITH CHECK \(public\.social_monitor_rls_workspace_match\(tenant_id, workspace_id\)\);/gu,
  )];
  assert(policies.length === canonicalTables.length && policies.every((match) =>
    canonicalTables.includes(match[1] as (typeof canonicalTables)[number])),
  "daily checker must reproduce only the canonical workspace RLS policies");
  assert(!/USING\s*\(\s*true\s*\)/iu.test(fixture),
    "daily checker canonical fixture must not add permissive RLS policies");
};

export const assertReaderSummaryDailyCanonicalPublicationFixtureContract = (
  checkerSource: string,
  contractSource: string,
): void => {
  assert(checkerSource.includes("schemaOwnerRole,\n        publicationOwnerRole,"),
    "daily checker must pass both fixed fixture owner roles to the runtime contract");
  for (const table of [
    "reader_summary_artifacts",
    "reader_summary_publications",
    "reader_summary_weekly_publication_evidence",
  ]) {
    assert(checkerSource.includes(
      `ALTER TABLE public.${table}\n        OWNER TO \${quoteIdentifier(publicationOwnerRole)}`,
    ), `daily checker must keep ${table} owned by the publication owner`);
  }
  const seedStart = contractSource.lastIndexOf("const seedCanonicalPublication = async");
  const seedEnd = contractSource.indexOf("const scopeIds =", seedStart);
  const seedSource = contractSource.slice(seedStart, seedEnd);
  const transactionBegin = seedSource.indexOf('admin.query("BEGIN")');
  const rlsScope = seedSource.indexOf("set_config('social_monitor.tenant_id'");
  const roleBoundary = seedSource.indexOf("withCanonicalPublicationFixtureRole({");
  const summaryJobInsert = seedSource.indexOf("INSERT INTO public.reader_summary_jobs");
  const artifactInsert = seedSource.indexOf(
    "INSERT INTO public.reader_summary_artifacts",
  );
  const evidenceInsert = seedSource.indexOf(
    "INSERT INTO public.reader_summary_weekly_publication_evidence",
  );
  const afterRestoreBinding = seedSource.indexOf("afterRestore: async () => {");
  const summaryJobUpdate = seedSource.indexOf("UPDATE public.reader_summary_jobs");
  const commit = seedSource.indexOf('admin.query("COMMIT")');
  const requiredQualifiedDml = [
    "INSERT INTO public.reader_summary_jobs",
    "INSERT INTO public.reader_summary_artifacts",
    "INSERT INTO public.reader_summary_publications",
    "INSERT INTO public.reader_summary_weekly_publication_evidence",
    "UPDATE public.reader_summary_jobs",
  ] as const;
  const unqualifiedCanonicalDml = new RegExp(
    "\\b(?:INSERT\\s+INTO|UPDATE)\\s+(?!public\\.)(?:\\x22)?(?:" +
      "reader_summary_artifacts|reader_summary_publications|" +
      "reader_summary_weekly_publication_evidence|reader_summary_jobs)(?:\\x22)?" +
      "(?=\\s|\\()",
    "iu",
  );
  assert(seedStart >= 0 && seedEnd > seedStart &&
    seedSource.includes("schemaOwnerRole: params.schemaOwnerRole") &&
    seedSource.includes("publicationOwnerRole: params.publicationOwnerRole") &&
    requiredQualifiedDml.every((statement) => seedSource.includes(statement)) &&
    !unqualifiedCanonicalDml.test(seedSource) &&
    transactionBegin >= 0 && transactionBegin < rlsScope &&
    rlsScope < summaryJobInsert && summaryJobInsert < roleBoundary &&
    roleBoundary < artifactInsert && evidenceInsert > artifactInsert &&
    afterRestoreBinding > evidenceInsert && summaryJobUpdate > afterRestoreBinding &&
    commit > summaryJobUpdate,
  "canonical publication seed must public-qualify canonical/job DML and bound only " +
    "canonical DML as publication owner");
  assert(seedSource.includes(`const frontendBytes = Buffer.from(JSON.stringify({
    tenantId: scope.tenantId, workspaceId: scope.workspaceId,
    readerSummaryArtifact: { readerSummaryId: artifactId },
  }));`), "canonical publication frontend fixture must bind the canonical artifact");
  const helperStart = contractSource.indexOf(
    "export const withCanonicalPublicationFixtureRole = async",
  );
  const helperEnd = contractSource.indexOf(
    "export const assertReaderSummaryDailyCheckerRoleBootstrapContract",
    helperStart,
  );
  const helperSource = contractSource.slice(helperStart, helperEnd);
  const publicationRoleSet = helperSource.indexOf(
    "SET ROLE ${quoteRoleIdentifier(params.publicationOwnerRole)}",
  );
  const schemaRoleRestoration = helperSource.indexOf(
    "SET ROLE ${quoteRoleIdentifier(params.schemaOwnerRole)}",
    publicationRoleSet,
  );
  const canonicalOperation = helperSource.indexOf("params.operation()");
  const afterRestoreOperation = helperSource.indexOf("params.afterRestore()");
  const operationErrorThrow = helperSource.indexOf("throw operationError");
  const restorationErrorThrow = helperSource.indexOf("throw restorationError");
  assert(helperStart >= 0 && helperEnd > helperStart &&
    publicationRoleSet >= 0 &&
    canonicalOperation > publicationRoleSet &&
    helperSource.includes("finally {") &&
    schemaRoleRestoration > canonicalOperation &&
    afterRestoreOperation > schemaRoleRestoration &&
    operationErrorThrow > afterRestoreOperation &&
    !helperSource.includes("RESET ROLE") &&
    !/(?:GRANT|REVOKE)[^;`]*ON SCHEMA public/iu.test(helperSource) &&
    restorationErrorThrow > operationErrorThrow &&
    helperSource.indexOf("throw afterRestoreError") > restorationErrorThrow,
  "canonical publication role boundary must not mutate schema ACLs and must switch " +
    "to publication owner, restore schema owner, and bind the job before returning");
  const runtimeContract = checkerSource.indexOf(
    "await assertReaderSummaryDailyExecutionCursorPostgresContract({",
  );
  const retainedPrivilegeProof = checkerSource.indexOf(
    "retainedPublicationOwnerSchemaPrivileges",
    runtimeContract,
  );
  const migrationAdminPrivilegeCleanup = checkerSource.indexOf(
    "REVOKE USAGE ON SCHEMA public\n        FROM ${quoteIdentifier(migrationAdminRole)}",
    runtimeContract,
  );
  const retainedPrivilegeAssertion = checkerSource.indexOf(
    "publication_owner_has_usage === true &&",
    retainedPrivilegeProof,
  );
  assert(runtimeContract >= 0 && retainedPrivilegeProof > runtimeContract &&
    retainedPrivilegeAssertion > retainedPrivilegeProof &&
    retainedPrivilegeProof < migrationAdminPrivilegeCleanup &&
    checkerSource.indexOf("publication_owner_has_create === false",
      retainedPrivilegeAssertion) > retainedPrivilegeAssertion,
  "daily runtime contract must prove publication owner retains durable schema " +
    "USAGE without CREATE before cleanup");
  assert(!/REVOKE USAGE ON SCHEMA public\s+FROM \$\{quoteIdentifier\(publicationOwnerRole\)\}/iu
    .test(checkerSource),
  "daily checker must not revoke durable publication-owner schema USAGE");
  const forbiddenCanonicalGrant = new RegExp(
    "GRANT[^;`]*public\\.\"?(?:reader_summary_artifacts|" +
      "reader_summary_publications|reader_summary_weekly_publication_evidence)" +
      "\"?[^;`]*TO\\s+" +
      "\\$\\{quoteIdentifier\\((?:schemaOwnerRole|migrationAdminRole)\\)\\}",
    "iu",
  );
  assert(!forbiddenCanonicalGrant.test(checkerSource),
    "daily checker must not grant canonical DML to schema or migration admin");
  assert(!/GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER|ALL)[^;`]*ON(?:\s+TABLE)?\s+public\.reader_summary_(?:artifacts|publications|weekly_publication_evidence)/iu
    .test(checkerSource),
  "daily checker must not grant canonical table DML privileges");
};

export const assertReaderSummaryDailyMigrationContract = (sql: string): void => {
  assert(sql.includes("current_setting('transaction_isolation') <> 'serializable'"),
    "daily cursor migration must reject non-SERIALIZABLE transitions");
  assert(sql.includes("session_user <> 'social_monitor_reader_summary_daily_terminal'"),
    "daily cursor functions must require the dedicated terminal login");
  assert(!/\bLOCK\s+TABLE\b/iu.test(sql), "daily cursor migration must not use LOCK TABLE");
  assert(sql.includes("FOR UPDATE"), "daily cursor migration must use row locks");
  assert(sql.includes("INTERVAL '20 minutes'"), "daily cursor lease must be twenty minutes");
  assert(sql.includes("INTERVAL '7 hours'"), "daily cursor must have a seven-hour absolute cap");
  assert(sql.includes("v_eligible - v_cursor.\"next_unresolved_utc_date\" + 1 > 7"),
    "daily cursor must classify gaps older than the exact seven-day window");
  for (const state of ["RESERVED", "RUNNING", "COMPLETED", "FAILED_AMBIGUOUS"]) {
    assert(sql.includes(`'${state}'`), `daily cursor migration is missing ${state}`);
  }
  assert(sql.includes("reader_summary_daily_source_authority_immutable"),
    "daily source authority must be immutable");
  assert(sql.includes("feed.\"observed_at\" <= invoked_at"),
    "daily source authority must enforce its ingestion cutoff");
  assert(sql.includes(
    'ON CONFLICT ON CONSTRAINT "reader_summary_daily_execution_cursors_pkey"'),
  "daily cursor insert must name its constraint to avoid output-variable ambiguity");
  assert(sql.includes(
    'ON CONFLICT ON CONSTRAINT "reader_summary_daily_model_jobs_pkey"'),
  "daily model job insert must name its constraint to avoid output-variable ambiguity");
  const identityStatement = sql.match(/v_identity\s*:=\s*([\s\S]*?);/u)?.[1]
    ?.replace(/\s+/gu, " ").trim();
  assert(identityStatement === [
    "encode(sha256(convert_to(concat_ws('|',",
    "'reader-summary-daily:v1', target_tenant_id::TEXT,",
    "target_workspace_id::TEXT,",
    "to_char(v_cursor.\"next_unresolved_utc_date\", 'YYYY-MM-DD'),",
    "btrim(v_source.\"canonical_sha256\"), 'codex', 'gpt-5.6-sol', 'xhigh'",
    "), 'UTF8')), 'hex')",
  ].join(" "), "daily model job identity must use the exact pipe-delimited SHA-256 contract");
};

export const assertReaderSummaryDailyActivationMigrationContract = (
  sql: string,
): void => {
  assert(sql.includes("CREATE OR REPLACE FUNCTION \"complete_reader_summary_daily_model_job\""),
    "daily activation must additively replace only receipt completion");
  assert(sql.includes("CREATE FUNCTION \"finalize_reader_summary_daily_publication\""),
    "daily activation must define a separate publication finalizer");
  assert(sql.includes("reader_summary_weekly_publication_evidence"),
    "daily finalization must require canonical weekly evidence");
  assert(sql.includes("encode(sha256(public_evidence_bytes), 'hex')") &&
    sql.includes("encode(sha256(public_frontend_bytes), 'hex')"),
  "daily finalization must hash both exact public files in PostgreSQL");
  assert(sql.includes('btrim(v_job."publication_report_sha256")') &&
    sql.includes('btrim(v_job."publication_proof_sha256")') &&
    sql.includes('btrim(v_job."weekly_evidence_sha256")'),
  "daily finalization replay must retain every canonical DB hash");
  const completion = sql.slice(
    sql.indexOf("CREATE OR REPLACE FUNCTION \"complete_reader_summary_daily_model_job\""),
    sql.indexOf("CREATE FUNCTION \"finalize_reader_summary_daily_publication\""),
  );
  assert(!completion.includes('"next_unresolved_utc_date" = target_date + 1'),
    "model receipt completion must not advance before publication");
  assert(!sql.includes("reader_summary.daily_source_authority.v2"),
    "daily activation must not invent a v2 source authority");
};

export const assertReaderSummaryDailyExecutionCursorPostgresContract = async (params: {
  readonly admin: ReaderSummaryDailyPostgresClient;
  readonly first: ReaderSummaryDailyPostgresClient;
  readonly second: ReaderSummaryDailyPostgresClient;
  readonly terminalRole: string;
  readonly schemaOwnerRole: string;
  readonly publicationOwnerRole: string;
}): Promise<void> => {
  const identity = await params.first.query<{ current_user: string }>("SELECT current_user");
  assert(identity.rows[0]?.current_user === params.terminalRole,
    "daily contract first client is not the dedicated terminal role");
  const privileges = await params.first.query<{
    table_access: boolean; claim_access: boolean; telemetry_complete_access: boolean;
    legacy_complete_access: boolean;
  }>(`SELECT
      has_table_privilege(current_user,
        'reader_summary_daily_model_jobs', 'SELECT') AS table_access,
      has_function_privilege(current_user,
        'claim_reader_summary_daily_execution(uuid,uuid,text,date,timestamptz)',
        'EXECUTE') AS claim_access,
      has_function_privilege(current_user,
        'complete_reader_summary_daily_model_job_v2(uuid,uuid,date,text,bigint,timestamptz,bytea,character,jsonb,bytea,character,bytea,character,bigint,bigint,bigint,text,bigint)',
        'EXECUTE') AS telemetry_complete_access,
      has_function_privilege(current_user,
        'complete_reader_summary_daily_model_job(uuid,uuid,date,text,bigint,timestamptz,bytea,character,jsonb,bytea,character,bytea,character)',
        'EXECUTE') AS legacy_complete_access`);
  assert(privileges.rows[0]?.table_access === false &&
    privileges.rows[0]?.claim_access === true &&
    privileges.rows[0]?.telemetry_complete_access === true &&
    privileges.rows[0]?.legacy_complete_access === false,
    "daily terminal role separation is unsafe");

  const eligible = utcDate(new Date(Date.now() - 86_400_000));
  const firstDate = addUtcDays(eligible, -6);
  const scope = scopeIds("1");
  await seedSource(params.admin, scope, firstDate, "before-claim");
  const concurrent = await Promise.all([
    claimWithRetry(params.first, scope, "worker-a", firstDate),
    claimWithRetry(params.second, scope, "worker-b", firstDate),
  ]);
  const outcomes = concurrent.map((row) => row.outcome).sort();
  assert(JSON.stringify(outcomes) === JSON.stringify(["CLAIMED", "LEASED"]),
    "concurrent cursor claims must admit exactly one invocation");
  const claimed = concurrent.find((row) => row.outcome === "CLAIMED")!;
  const owner = String(claimed.lease_owner);
  const fence = String(claimed.fencing_token);
  const sealedBytes = requiredBuffer(claimed.source_canonical_bytes);
  const sealedSha = String(claimed.source_canonical_sha256);
  assert(hash(sealedBytes) === sealedSha, "source authority bytes and SHA diverged");

  await seedSource(params.admin, scope, firstDate, "late-backfill");
  const persisted = await params.admin.query<{
    canonical_bytes: Buffer; canonical_sha256: string;
  }>(`SELECT canonical_bytes, btrim(canonical_sha256) AS canonical_sha256
      FROM reader_summary_daily_source_authorities
      WHERE tenant_id = $1 AND workspace_id = $2 AND requested_utc_date = $3`,
    [scope.tenantId, scope.workspaceId, firstDate]);
  assert(requiredBuffer(persisted.rows[0]?.canonical_bytes).equals(sealedBytes) &&
    persisted.rows[0]?.canonical_sha256 === sealedSha,
    "late backfill replaced immutable source authority");

  await serializable(params.first, `SELECT * FROM renew_reader_summary_daily_execution_lease(
    $1,$2,$3,$4,$5,$6)`, [scope.tenantId, scope.workspaceId, firstDate, owner, fence,
    new Date().toISOString()]);
  await serializable(params.first, `SELECT mark_reader_summary_daily_model_job_running(
    $1,$2,$3,$4,$5,$6)`, [scope.tenantId, scope.workspaceId, firstDate, owner, fence,
    new Date().toISOString()]);
  const completionSql = `SELECT complete_reader_summary_daily_model_job_v2(
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`;
  const completionFinishedAt = new Date().toISOString();
  const completionFixture = dailyCompletionReceiptFixture({
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    requestedUtcDate: firstDate,
    sourceAuthoritySha256: sealedSha,
    worker: owner,
    fence,
    finishedAt: completionFinishedAt,
  });
  const { completionValues, receiptBytes } = completionFixture;
  const responseBytes = requiredBuffer(completionValues[6]);
  for (const [mutation, values] of completionFixture.negativeSealMutations) {
    await expectRejected(serializable(params.first, completionSql, values),
      `${mutation} must not seal a daily model job`);
  }
  const unsealed = await params.admin.query<{
    state: string; receipt_bytes: Buffer | null;
  }>(`SELECT state, receipt_bytes FROM reader_summary_daily_model_jobs
      WHERE tenant_id = $1 AND workspace_id = $2
        AND requested_utc_date = $3`,
  [scope.tenantId, scope.workspaceId, firstDate]);
  assert(unsealed.rows[0]?.state === "RUNNING" &&
    unsealed.rows[0]?.receipt_bytes === null,
  "invalid canonical receipt mutations crossed the RUNNING completion boundary");
  await serializable(params.first, completionSql, completionValues);
  await serializable(params.first, completionSql,
    replaceCompletionValue(
      completionValues, 5, new Date(Date.now() + 1_000).toISOString(),
    ));
  const completed = await params.admin.query<{
    state: string; response_bytes: Buffer; receipt_bytes: Buffer;
    next_unresolved_utc_date: string; input_tokens: string;
    output_tokens: string; total_tokens: string;
    usage_source: string; duration_ms: string; completed_at: Date;
  }>(`SELECT job.state, job.response_bytes, job.receipt_bytes,
        cursor.next_unresolved_utc_date::text,
        job.input_tokens::text, job.output_tokens::text, job.total_tokens::text,
        job.usage_source, job.duration_ms::text, job.completed_at
      FROM reader_summary_daily_model_jobs job
      JOIN reader_summary_daily_execution_cursors cursor USING (tenant_id, workspace_id)
      WHERE job.tenant_id = $1 AND job.workspace_id = $2
        AND job.requested_utc_date = $3`, [scope.tenantId, scope.workspaceId, firstDate]);
  assert(completed.rows[0]?.state === "COMPLETED" &&
    requiredBuffer(completed.rows[0]?.response_bytes).equals(responseBytes) &&
    requiredBuffer(completed.rows[0]?.receipt_bytes).equals(receiptBytes) &&
    completed.rows[0]?.next_unresolved_utc_date === firstDate &&
    completed.rows[0]?.input_tokens === "120" &&
    completed.rows[0]?.output_tokens === "30" &&
    completed.rows[0]?.total_tokens === "150" &&
    completed.rows[0]?.usage_source === "PROVIDER_REPORTED" &&
    completed.rows[0]?.duration_ms === "250" &&
    completed.rows[0]?.completed_at.toISOString() === completionFinishedAt,
    "COMPLETED receipt replay must perform no writes or cursor advancement");

  const canonical = await seedCanonicalPublication(params, scope, firstDate);
  const finalizationSql = `SELECT finalize_reader_summary_daily_publication(
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`;
  const finalizationValues = [
    scope.tenantId, scope.workspaceId, firstDate, owner, fence,
    new Date().toISOString(), canonical.jobId, canonical.artifactId,
    canonical.artifactId, canonical.reportSha, canonical.proofSha,
    canonical.weeklySha, canonical.evidenceBytes, hash(canonical.evidenceBytes),
    canonical.frontendBytes, hash(canonical.frontendBytes),
  ] as const;
  await serializable(params.first, finalizationSql, finalizationValues, scope);
  await serializable(params.first, finalizationSql, finalizationValues, scope);
  const finalized = await params.admin.query<{
    next_unresolved_utc_date: string; publication_id: string;
    reader_summary_job_id: string; reader_summary_artifact_id: string;
    input_tokens: string; output_tokens: string; total_tokens: string;
    duration_ms: string;
  }>(`SELECT cursor.next_unresolved_utc_date::text,
        job.publication_id::text, job.reader_summary_job_id::text,
        job.reader_summary_artifact_id::text, job.input_tokens::text,
        job.output_tokens::text, job.total_tokens::text, job.duration_ms::text
      FROM reader_summary_daily_execution_cursors cursor
      JOIN reader_summary_daily_model_jobs job USING (tenant_id, workspace_id)
      WHERE cursor.tenant_id = $1 AND cursor.workspace_id = $2
        AND job.requested_utc_date = $3`,
    [scope.tenantId, scope.workspaceId, firstDate]);
  assert(finalized.rows[0]?.next_unresolved_utc_date === addUtcDays(firstDate, 1) &&
    finalized.rows[0]?.publication_id === canonical.artifactId &&
    finalized.rows[0]?.reader_summary_job_id === canonical.jobId &&
    finalized.rows[0]?.reader_summary_artifact_id === canonical.artifactId &&
    finalized.rows[0]?.input_tokens === "120" &&
    finalized.rows[0]?.output_tokens === "30" &&
    finalized.rows[0]?.total_tokens === "150" &&
    finalized.rows[0]?.duration_ms === "250",
    "canonical replay changed advancement, binding, or model telemetry");

  const oldScope = scopeIds("2");
  const recovery = await claimWithRetry(
    params.first, oldScope, "worker-recovery", addUtcDays(eligible, -7),
  );
  assert(recovery.outcome === "RECOVERY_REQUIRED",
    "an eight-day unresolved gap must require recovery");

  const ambiguousScope = scopeIds("3");
  await seedSource(params.admin, ambiguousScope, eligible, "ambiguous");
  const ambiguousClaim = await claimWithRetry(
    params.first, ambiguousScope, "worker-ambiguous", eligible,
  );
  await serializable(params.first, `SELECT mark_reader_summary_daily_model_job_running(
    $1,$2,$3,$4,$5,$6)`, [ambiguousScope.tenantId, ambiguousScope.workspaceId,
    eligible, "worker-ambiguous", String(ambiguousClaim.fencing_token), new Date().toISOString()]);
  await params.admin.query(`UPDATE reader_summary_daily_execution_cursors SET
      leased_at = CURRENT_TIMESTAMP - INTERVAL '21 minutes',
      lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '1 minute',
      absolute_expires_at = CURRENT_TIMESTAMP + INTERVAL '1 hour'
    WHERE tenant_id = $1 AND workspace_id = $2`,
    [ambiguousScope.tenantId, ambiguousScope.workspaceId]);
  const failed = await claimWithRetry(params.second, ambiguousScope, "worker-never-call", eligible);
  assert(failed.outcome === "FAILED_AMBIGUOUS",
    "expired RUNNING without a receipt must become FAILED_AMBIGUOUS");
  const failedState = await params.admin.query<{ state: string; receipt_bytes: Buffer | null }>(
    `SELECT state, receipt_bytes FROM reader_summary_daily_model_jobs
     WHERE tenant_id = $1 AND workspace_id = $2 AND requested_utc_date = $3`,
    [ambiguousScope.tenantId, ambiguousScope.workspaceId, eligible],
  );
  assert(failedState.rows[0]?.state === "FAILED_AMBIGUOUS" &&
    failedState.rows[0]?.receipt_bytes === null,
    "ambiguous job acquired a receipt or unsafe state");
};

const expectRejected = async (
  operation: Promise<unknown>,
  message: string,
): Promise<void> => {
  try {
    await operation;
  } catch {
    return;
  }
  throw new Error(message);
};

type ClaimRow = Record<string, unknown> & {
  outcome: string; lease_owner?: string; fencing_token?: string;
  source_canonical_bytes?: Buffer; source_canonical_sha256?: string;
};
const claimWithRetry = async (
  client: ReaderSummaryDailyPostgresClient,
  scope: { tenantId: string; workspaceId: string },
  worker: string,
  firstDate: string,
): Promise<ClaimRow> => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const result = await serializable<ClaimRow>(client,
        "SELECT * FROM claim_reader_summary_daily_execution($1,$2,$3,$4,CURRENT_TIMESTAMP)",
        [scope.tenantId, scope.workspaceId, worker, firstDate]);
      assert(result.rows.length === 1, "daily claim returned an invalid row count");
      return result.rows[0]!;
    } catch (error) {
      if (attempt >= 3 || !retryable(error)) throw error;
    }
  }
};
const serializable = async <TRow extends Record<string, unknown> = Record<string, unknown>>(
  client: ReaderSummaryDailyPostgresClient,
  sql: string,
  values: readonly unknown[],
  scope?: Readonly<{ tenantId: string; workspaceId: string }>,
) => {
  await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  try {
    if (scope !== undefined) {
      await client.query(
        `SELECT set_config('social_monitor.tenant_id', $1, true),
          set_config('social_monitor.workspace_id', $2, true)`,
        [scope.tenantId, scope.workspaceId],
      );
    }
    const result = await client.query<TRow>(sql, values);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
};
const seedSource = async (
  admin: ReaderSummaryDailyPostgresClient,
  scope: { tenantId: string; workspaceId: string },
  date: string,
  suffix: string,
): Promise<void> => {
  const numeric = suffix === "late-backfill" ? "9" : suffix === "ambiguous" ? "8" : "7";
  const sourceId = `${numeric}0000000-0000-4000-8000-00000000000${numeric}`;
  const feedId = `${numeric}1000000-0000-4000-8000-00000000000${numeric}`;
  await admin.query(`INSERT INTO source_items
    (id, tenant_id, workspace_id, content_hash, created_at)
    VALUES ($1,$2,$3,$4,CURRENT_TIMESTAMP - INTERVAL '1 minute')`,
    [sourceId, scope.tenantId, scope.workspaceId, `hash-${suffix}`]);
  await admin.query(`INSERT INTO feed_items
    (id, tenant_id, workspace_id, source_item_id, provider_key, canonical_url,
     title, body_preview, author_handle, published_at, observed_at, status)
    VALUES ($1,$2,$3,$4,'github',$5,$6,$7,NULL,$8::date + INTERVAL '12 hours',
      CURRENT_TIMESTAMP - INTERVAL '1 minute','VISIBLE')`,
    [feedId, scope.tenantId, scope.workspaceId, sourceId,
      `https://example.invalid/${suffix}`, `Title ${suffix}`, `Body ${suffix}`, date]);
};
const seedCanonicalPublication = async (
  params: Readonly<{
    admin: ReaderSummaryDailyPostgresClient;
    schemaOwnerRole: string;
    publicationOwnerRole: string;
  }>,
  scope: { tenantId: string; workspaceId: string },
  date: string,
) => {
  const jobId = "50000000-0000-4000-8000-000000000005";
  const artifactId = "60000000-0000-4000-8000-000000000006";
  const reportSha = "c".repeat(64);
  const proofSha = "d".repeat(64);
  const weeklyBytes = Buffer.from(JSON.stringify({ schemaVersion: 1, requestedUtcDate: date }));
  const weeklySha = hash(weeklyBytes);
  const admin = params.admin;
  await admin.query("BEGIN");
  try {
    await admin.query(
      `SELECT set_config('social_monitor.tenant_id', $1, true),
        set_config('social_monitor.workspace_id', $2, true)`,
      [scope.tenantId, scope.workspaceId],
    );
    await admin.query(`INSERT INTO public.reader_summary_jobs
      (id, tenant_id, workspace_id, status)
      VALUES ($1,$2,$3,'COMPLETED')`,
      [jobId, scope.tenantId, scope.workspaceId]);
    await withCanonicalPublicationFixtureRole({
      admin,
      schemaOwnerRole: params.schemaOwnerRole,
      publicationOwnerRole: params.publicationOwnerRole,
      operation: async () => {
        await admin.query(`INSERT INTO public.reader_summary_artifacts
          (id, tenant_id, workspace_id, status) VALUES ($1,$2,$3,'COMPLETED')`,
        [artifactId, scope.tenantId, scope.workspaceId]);
        await admin.query(`INSERT INTO public.reader_summary_publications
          (id, tenant_id, workspace_id, requested_utc_date, cadence,
           semantic_status, reader_summary_job_id, reader_summary_artifact_id,
           report_sha256, proof_sha256)
          VALUES ($1,$2,$3,$4,'daily','COMPLETED',$5,$1,$6,$7)`,
        [artifactId, scope.tenantId, scope.workspaceId, date, jobId,
          reportSha, proofSha]);
        await admin.query(`INSERT INTO public.reader_summary_weekly_publication_evidence
          (publication_id, reader_summary_job_id, reader_summary_artifact_id,
           tenant_id, workspace_id, canonical_bytes, canonical_sha256)
          VALUES ($1,$2,$1,$3,$4,$5,$6)`,
        [artifactId, jobId, scope.tenantId, scope.workspaceId, weeklyBytes, weeklySha]);
      },
      afterRestore: async () => {
        await admin.query(`UPDATE public.reader_summary_jobs
          SET reader_summary_artifact_id = $2 WHERE id = $1`,
        [jobId, artifactId]);
      },
    });
    await admin.query("COMMIT");
  } catch (error) {
    await admin.query("ROLLBACK");
    throw error;
  }
  const evidenceBytes = Buffer.from(JSON.stringify({
    scope: { tenantId: scope.tenantId, workspaceId: scope.workspaceId },
    result: { readerSummaryJobId: jobId, readerSummaryId: artifactId },
  }));
  const frontendBytes = Buffer.from(JSON.stringify({
    tenantId: scope.tenantId, workspaceId: scope.workspaceId,
    readerSummaryArtifact: { readerSummaryId: artifactId },
  }));
  return { jobId, artifactId, reportSha, proofSha, weeklySha,
    evidenceBytes, frontendBytes };
};
const scopeIds = (digit: string) => ({
  tenantId: `${digit}0000000-0000-4000-8000-000000000001`,
  workspaceId: `${digit}0000000-0000-4000-8000-000000000002`,
});
const addUtcDays = (date: string, days: number): string => {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return utcDate(value);
};
const utcDate = (value: Date): string => value.toISOString().slice(0, 10);
const hash = (value: Buffer): string => createHash("sha256").update(value).digest("hex");
const requiredBuffer = (value: unknown): Buffer => {
  assert(Buffer.isBuffer(value), "PostgreSQL contract expected bytea bytes");
  return value;
};
const retryable = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === "40001";
const quoteRoleIdentifier = (input: string): string =>
  `"${input.replaceAll('"', '""')}"`;
const assert: (condition: unknown, message: string) => asserts condition = (
  condition,
  message,
) => {
  if (!condition) throw new Error(message);
};
