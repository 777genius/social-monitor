import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  assertReaderSummaryDailyCheckerActivationOwnershipContract,
  assertReaderSummaryDailyCanonicalPublicationFixtureContract,
  assertReaderSummaryDailyCheckerCanonicalRlsContract,
  assertReaderSummaryDailyCheckerFixtureRoleContract,
  assertReaderSummaryDailyCheckerRoleBootstrapContract,
  assertReaderSummaryDailyProductionOwnerTopologyFixtureContract,
  assertReaderSummaryDailyActivationMigrationContract,
  assertReaderSummaryDailyMigrationContract,
  withCanonicalPublicationFixtureRole,
} from "./reader-summary-daily-execution-cursor-postgres-contract";
import { readerSummaryDailyProductionOwnerAclSql } from
  "./reader-summary-daily-production-owner-topology-postgres";

const migrationPath =
  "prisma/migrations/20260802100000_reader_summary_daily_execution_cursor/migration.sql";
const activationAclMigrationPath =
  "prisma/migrations/20260802143100_reader_summary_daily_execution_publication_activation_acl/migration.sql";

describe("reader summary daily execution cursor PostgreSQL contract", () => {
  it("pins serializable row-lock, lease, catch-up, and immutable source rules", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(() => assertReaderSummaryDailyMigrationContract(sql)).not.toThrow();
  });

  it("separates the durable model receipt from canonical publication advance", () => {
    const sql = readFileSync(
      "prisma/migrations/20260802143000_reader_summary_daily_execution_publication_activation/migration.sql",
      "utf8",
    );
    expect(() => assertReaderSummaryDailyActivationMigrationContract(sql)).not.toThrow();
  });

  it("pins the deployed activation ACL migration checksum", () => {
    const sql = readFileSync(activationAclMigrationPath);
    expect(createHash("sha256").update(sql).digest("hex")).toBe(
      "2e83d1d4c599336b9196015c76f337b22d0162b5fb8cf0c08d62993f30962452",
    );
  });

  it("passes all eighteen telemetry completion arguments", () => {
    const contract = readFileSync(
      "scripts/lib/reader-summary-daily-execution-cursor-postgres-contract.ts",
      "utf8",
    );
    expect(contract).toContain(
      "$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18",
    );
  });

  it("bounds activation CREATE while retaining publication-owner USAGE", () => {
    const checker = readFileSync(
      "scripts/check-reader-summary-daily-execution-cursor-postgres.ts",
      "utf8",
    );
    expect(() => assertReaderSummaryDailyCheckerActivationOwnershipContract(checker))
      .not.toThrow();
    const schemaOwnerSetup = checker.indexOf(
      "ALTER SCHEMA public OWNER TO ${quoteIdentifier(schemaOwnerRole)}",
    );
    const publicationOwnerHandoff = checker.indexOf(
      "ALTER TABLE public.reader_summary_artifacts\n        " +
      "OWNER TO ${quoteIdentifier(publicationOwnerRole)}",
    );
    const activation = checker.indexOf(
      "await executePostgresMigrationWithDiagnostics(admin, {",
    );
    const activationAcl = checker.indexOf(
      "await admin.query(activationAclMigration)",
    );
    const schemaOwnerRoleSwitches = [...checker.matchAll(
      /SET ROLE \$\{quoteIdentifier\(schemaOwnerRole\)\};/gu,
    )].map((match) => match.index);
    const schemaGrants = [...checker.matchAll(
      /GRANT (USAGE, CREATE) ON SCHEMA public\s+TO \$\{quoteIdentifier\(publicationOwnerRole\)\}/gu,
    )];
    const postHandoffGrant = schemaGrants[1]?.index ?? -1;
    const usagePrecondition = checker.indexOf(
      "has_schema_privilege($1, 'public', 'USAGE')",
    );
    const createPrecondition = checker.indexOf(
      "has_schema_privilege($1, 'public', 'CREATE')",
    );
    const createRevoke = checker.indexOf(
      "REVOKE CREATE ON SCHEMA public\n" +
      "        FROM ${quoteIdentifier(publicationOwnerRole)}",
    );
    const aclUsagePrecondition = checker.indexOf(
      "activationAclSchemaPrivileges.rows[0]?.publication_owner_has_usage === true",
    );
    const aclCreateBoundary = checker.indexOf(
      "activationAclSchemaPrivileges.rows[0]?.publication_owner_has_create === false",
    );
    const teardownBoundary = checker.indexOf(
      "retainedActivationSchemaPrivileges.rows[0]?.publication_owner_has_usage ===\n" +
      "      true && retainedActivationSchemaPrivileges.rows[0]?." +
      "publication_owner_has_create ===\n      false",
    );
    const migrationAdminUsageGrant = checker.indexOf(
      "GRANT USAGE ON SCHEMA public\n" +
      "        TO ${quoteIdentifier(migrationAdminRole)}",
    );
    const definerUsageGrants = [...checker.matchAll(
      /GRANT USAGE ON SCHEMA public\s+TO \$\{quoteIdentifier\(definerRole\)\}/gu,
    )];
    const definerUsageGrant = definerUsageGrants[0]?.index ?? -1;
    const publicAclReset = checker.indexOf(
      "REVOKE ALL ON SCHEMA public FROM PUBLIC",
    );
    const jobHandoff = checker.indexOf(
      "ALTER TABLE public.reader_summary_jobs\n" +
      "        OWNER TO ${quoteIdentifier(schemaOwnerRole)}",
    );
    const publicationOwnerProbe = checker.indexOf(
      "admin, publicationOwnerRole, \"public.reader_summary_artifacts\"",
    );
    const migrationAdminProbe = checker.indexOf(
      "admin, migrationAdminRole, \"public.reader_summary_daily_model_jobs\"",
    );
    const schemaOwnerTableHandoffs = [
      "reader_summary_daily_execution_cursors",
      "reader_summary_daily_source_authorities",
      "reader_summary_daily_model_jobs",
      "source_items",
      "feed_items",
    ].map((table) => [...checker.matchAll(new RegExp(
        `ALTER TABLE public\\.${table}\\s+OWNER TO ` +
          "\\$\\{quoteIdentifier\\(schemaOwnerRole\\)\\}",
        "gu",
      ))].map((match) => match.index));
    const dailyFunctionHandoff = checker.indexOf(
      "ALTER FUNCTION public.mark_reader_summary_daily_model_job_running(",
    );
    const migrationAdminUsageRevoke = checker.indexOf(
      "REVOKE USAGE ON SCHEMA public\n" +
      "        FROM ${quoteIdentifier(migrationAdminRole)}",
    );
    const executionContract = checker.indexOf(
      "await assertReaderSummaryDailyExecutionCursorPostgresContract({",
    );
    const completion = checker.indexOf(
      "Reader summary daily execution cursor PostgreSQL 18 gate OK",
    );

    expect(schemaGrants).toHaveLength(2);
    expect(schemaGrants[0]?.index).toBeLessThan(publicationOwnerHandoff);
    expect(publicationOwnerHandoff).toBeGreaterThan(-1);
    expect(publicationOwnerHandoff).toBeLessThan(schemaOwnerSetup);
    expect(schemaOwnerSetup).toBeGreaterThan(-1);
    expect(publicAclReset).toBeGreaterThan(schemaOwnerSetup);
    expect(migrationAdminUsageGrant).toBeGreaterThan(publicAclReset);
    expect(jobHandoff).toBeGreaterThan(migrationAdminUsageGrant);
    expect(postHandoffGrant).toBeGreaterThan(jobHandoff);
    expect(schemaOwnerRoleSwitches.some((roleSwitch) =>
      roleSwitch < postHandoffGrant && roleSwitch > schemaOwnerSetup)).toBe(true);
    expect(usagePrecondition).toBeGreaterThan(postHandoffGrant);
    expect(createPrecondition).toBeGreaterThan(postHandoffGrant);
    expect(usagePrecondition).toBeLessThan(activation);
    expect(createPrecondition).toBeLessThan(activation);
    expect(migrationAdminUsageGrant).toBeLessThan(publicationOwnerProbe);
    expect(publicationOwnerProbe).toBeLessThan(migrationAdminProbe);
    expect(migrationAdminProbe).toBeLessThan(activation);
    for (const indexes of schemaOwnerTableHandoffs) {
      expect(indexes).toHaveLength(1);
      expect(indexes[0]).toBeGreaterThan(schemaOwnerSetup);
      expect(indexes[0]).toBeLessThan(activation);
    }
    expect(createRevoke).toBeGreaterThan(activation);
    expect(createRevoke).toBeLessThan(activationAcl);
    expect(aclUsagePrecondition).toBeGreaterThan(createRevoke);
    expect(aclUsagePrecondition).toBeLessThan(activationAcl);
    expect(aclCreateBoundary).toBeGreaterThan(createRevoke);
    expect(aclCreateBoundary).toBeLessThan(activationAcl);
    expect(definerUsageGrants).toHaveLength(1);
    expect(definerUsageGrant).toBeGreaterThan(publicAclReset);
    expect(definerUsageGrant).toBeGreaterThan(aclCreateBoundary);
    expect(definerUsageGrant).toBeLessThan(activationAcl);
    expect(dailyFunctionHandoff).toBeGreaterThan(activation);
    expect(dailyFunctionHandoff).toBeLessThan(activationAcl);
    expect(migrationAdminUsageRevoke).toBeGreaterThan(executionContract);
    expect(migrationAdminUsageRevoke).toBeLessThan(completion);
    expect(teardownBoundary).toBeGreaterThan(activationAcl);
    expect(schemaOwnerRoleSwitches.some((roleSwitch) =>
      roleSwitch < createRevoke && roleSwitch > activation)).toBe(true);
    expect(checker).not.toContain(
      "REVOKE USAGE ON SCHEMA public\n" +
      "        FROM ${quoteIdentifier(publicationOwnerRole)}",
    );
    expect(checker).not.toContain(
      "REVOKE USAGE, CREATE ON SCHEMA public\n" +
      "      FROM ${quoteIdentifier(publicationOwnerRole)}",
    );
    expect(checker.slice(schemaOwnerSetup)).not.toContain(
      "GRANT USAGE, CREATE ON SCHEMA public\n" +
      "        TO ${quoteIdentifier(migrationAdminRole)}",
    );
    expect(checker).not.toMatch(
      /GRANT\s+(?:CREATE|USAGE\s*,\s*CREATE|CREATE\s*,\s*USAGE|ALL(?:\s+PRIVILEGES)?)\s+ON SCHEMA public\s+TO \$\{quoteIdentifier\(definerRole\)\}/iu,
    );
    expect(checker.match(
      /executePostgresMigrationWithDiagnostics\(admin, \{/gu,
    )).toHaveLength(2);
    expect(checker).not.toContain("locatePostgresMigrationFailureForTestDiagnostics");
    expect(checker).not.toContain("activationParams");
    expect(() => assertReaderSummaryDailyCheckerActivationOwnershipContract(
      checker.replace(
        "publication_owner_has_usage ===\n      true &&",
        "publication_owner_has_usage ===\n      false &&",
      ),
    )).toThrow("durable publication-owner USAGE without CREATE");
    expect(() => assertReaderSummaryDailyCheckerActivationOwnershipContract(
      `${checker}\nREVOKE USAGE ON SCHEMA public ` +
        "FROM ${quoteIdentifier(publicationOwnerRole)};",
    )).toThrow("must not revoke durable publication-owner schema USAGE");
  });

  it("pins production mixed-owner table ACLs before the PG18 migration", () => {
    const source = readFileSync(
      "scripts/lib/reader-summary-daily-production-owner-topology-postgres.ts",
      "utf8",
    );
    expect(() => assertReaderSummaryDailyProductionOwnerTopologyFixtureContract(source))
      .not.toThrow();
    for (const mutation of [
      "readerSummaryDailyProductionOwnerAclSql(",
      "reader_summary_daily_source_authorities",
      "('feed_items', ARRAY['SELECT']::TEXT[])",
      "('source_items', ARRAY['SELECT']::TEXT[])",
      "acl.grantor <> relation.relowner OR acl.is_grantable",
      "row.active_owner_has_create === false",
      'row.relation_count === "5"',
      "row.relation_acls_exact === true",
      "row.bounded_owner_has_create === true",
    ]) {
      expect(() => assertReaderSummaryDailyProductionOwnerTopologyFixtureContract(
        source.replaceAll(mutation, "removed"),
      )).toThrow("grant and prove exact owner table ACLs");
    }
    const productionSql = readFileSync(
      "ops/deploy/reader-summary-publication-post-migration.sql", "utf8",
    );
    const aclSql = readerSummaryDailyProductionOwnerAclSql(productionSql);
    expect(aclSql).toContain("DO $grant_legacy_daily_function_owner_acl$");
    expect(aclSql).toContain("GRANT SELECT, INSERT, UPDATE ON TABLE");
    expect(aclSql).toContain("GRANT SELECT, INSERT ON TABLE");
    expect(aclSql).toContain(
      'GRANT SELECT ON TABLE public."feed_items", public."source_items"',
    );
    expect(aclSql).not.toContain("DELETE");
    expect(aclSql).toContain(
      "v_legacy_function_owner <> 'fixture_migration_admin'::NAME",
    );
    expect(() => readerSummaryDailyProductionOwnerAclSql(
      productionSql.replace(
        "GRANT SELECT, INSERT, UPDATE ON TABLE",
        "GRANT SELECT, INSERT, UPDATE ON TABLE\n    -- DELETE is forbidden",
      ),
    )).toThrow("unexpectedly grants DELETE");
    expect(() => readerSummaryDailyProductionOwnerAclSql(
      productionSql.replace(
        "GRANT SELECT, INSERT, UPDATE ON TABLE",
        "REVOKE UPDATE ON TABLE public.reader_summary_daily_model_jobs " +
          "FROM CURRENT_USER;\n  GRANT SELECT, INSERT, UPDATE ON TABLE",
      ),
    )).toThrow("ACL block digest drifted");
  });

  it("rejects production topology setup moved after telemetry starts", () => {
    const checker = readFileSync(
      "scripts/check-reader-summary-daily-execution-cursor-postgres.ts", "utf8",
    );
    const call = `    await grantAndAssertReaderSummaryDailyProductionOwnerTopology({
      admin, migrationAdminRole, postMigrationSql: publicationPostMigrationSql,
      schemaOwnerRole,
    });`;
    const firstAttempt = "    try {\n      await applyTelemetryMigrationAsMigrationAdmin(admin);";
    const mutated = checker.replace(call, "").replace(
      firstAttempt, `${firstAttempt}\n${call}`,
    );
    expect(() => assertReaderSummaryDailyCheckerActivationOwnershipContract(mutated))
      .toThrow("production mixed-owner topology");
  });

  it("rejects a dormant daily table handoff moved after activation", () => {
    const checker = readFileSync(
      "scripts/check-reader-summary-daily-execution-cursor-postgres.ts",
      "utf8",
    );
    const handoff = "ALTER TABLE public.reader_summary_daily_model_jobs\n" +
      "        OWNER TO ${quoteIdentifier(schemaOwnerRole)}";
    const reversed = checker.replace(handoff, "") + handoff;

    expect(() => assertReaderSummaryDailyCheckerActivationOwnershipContract(reversed))
      .toThrow("before activation");
  });

  it.each(["source_items", "feed_items"])(
    "requires exactly one pre-activation schema-owner handoff for %s",
    (table) => {
      const checker = readFileSync(
        "scripts/check-reader-summary-daily-execution-cursor-postgres.ts",
        "utf8",
      );
      const handoff = `ALTER TABLE public.${table}\n` +
        "        OWNER TO ${quoteIdentifier(schemaOwnerRole)}";

      expect(() => assertReaderSummaryDailyCheckerActivationOwnershipContract(
        checker.replace(handoff, ""),
      )).toThrow(`hand ${table} to the schema owner before activation`);
      expect(() => assertReaderSummaryDailyCheckerActivationOwnershipContract(
        checker.replace(handoff, `${handoff};\n      ${handoff}`),
      )).toThrow(`hand ${table} to the schema owner before activation`);
      expect(() => assertReaderSummaryDailyCheckerActivationOwnershipContract(
        checker.replace(handoff, "") + handoff,
      )).toThrow(`hand ${table} to the schema owner before activation`);
    },
  );

  it("pins schema bootstrap ordering and a unique migration-admin USAGE grant", () => {
    const checker = readFileSync(
      "scripts/check-reader-summary-daily-execution-cursor-postgres.ts",
      "utf8",
    );
    const publicAclReset = "REVOKE ALL ON SCHEMA public FROM PUBLIC;";
    const migrationAdminUsageGrant = `GRANT USAGE ON SCHEMA public
        TO \${quoteIdentifier(migrationAdminRole)}`;
    const tableHandoff = `ALTER TABLE public.reader_summary_jobs
        OWNER TO \${quoteIdentifier(schemaOwnerRole)}`;
    const schemaHandoff =
      "await admin.query(`ALTER SCHEMA public OWNER TO " +
      "${quoteIdentifier(schemaOwnerRole)}`);";

    expect(() => assertReaderSummaryDailyCheckerActivationOwnershipContract(
      checker.replace(publicAclReset, "removed"),
    )).toThrow("revoke implicit PUBLIC schema access as the schema owner");
    expect(() => assertReaderSummaryDailyCheckerActivationOwnershipContract(
      checker.replace(publicAclReset, "").replace(
        schemaHandoff,
        `${publicAclReset}\n    ${schemaHandoff}`,
      ),
    )).toThrow("revoke implicit PUBLIC schema access as the schema owner");
    expect(() => assertReaderSummaryDailyCheckerActivationOwnershipContract(
      checker.replace(migrationAdminUsageGrant, "removed"),
    )).toThrow("one migration-admin USAGE-only grant");
    expect(() => assertReaderSummaryDailyCheckerActivationOwnershipContract(
      checker.replace(migrationAdminUsageGrant, "") + migrationAdminUsageGrant,
    )).toThrow("one migration-admin USAGE-only grant");
    expect(() => assertReaderSummaryDailyCheckerActivationOwnershipContract(
      checker.replace(tableHandoff, `${tableHandoff}\n${migrationAdminUsageGrant}`),
    )).toThrow("one migration-admin USAGE-only grant");
    expect(() => assertReaderSummaryDailyCheckerActivationOwnershipContract(
      checker.replace(migrationAdminUsageGrant, "").replace(
        tableHandoff,
        `${tableHandoff}\n${migrationAdminUsageGrant}`,
      ),
    )).toThrow("table handoff");
    expect(() => assertReaderSummaryDailyCheckerActivationOwnershipContract(
      `${checker}\nGRANT USAGE ON SCHEMA public TO PUBLIC;`,
    )).toThrow("must not re-grant PUBLIC schema privileges");
  });

  it("pins one definer USAGE-only fixture grant immediately before activation ACL", () => {
    const checker = readFileSync(
      "scripts/check-reader-summary-daily-execution-cursor-postgres.ts",
      "utf8",
    );
    const publicAclReset = "REVOKE ALL ON SCHEMA public FROM PUBLIC;";
    const definerUsageGrant = `GRANT USAGE ON SCHEMA public
        TO \${quoteIdentifier(definerRole)}`;
    const definerUsageGrantBlock = `await admin.query(\`SET ROLE \${quoteIdentifier(schemaOwnerRole)};
      ${definerUsageGrant};
      RESET ROLE\`);`;
    const activationAcl = "await admin.query(activationAclMigration);";

    expect(() => assertReaderSummaryDailyCheckerActivationOwnershipContract(
      checker.replace(definerUsageGrant, "removed"),
    )).toThrow("exactly one explicit definer USAGE-only fixture ACL");
    expect(() => assertReaderSummaryDailyCheckerActivationOwnershipContract(
      checker.replace(definerUsageGrant, `${definerUsageGrant}\n${definerUsageGrant}`),
    )).toThrow("exactly one explicit definer USAGE-only fixture ACL");
    expect(() => assertReaderSummaryDailyCheckerActivationOwnershipContract(
      checker.replace(definerUsageGrantBlock, "").replace(
        "await admin.query(`SET ROLE ${quoteIdentifier(schemaOwnerRole)};\n" +
          `      ${publicAclReset}`,
        `${definerUsageGrantBlock}\n    ` +
          "await admin.query(`SET ROLE ${quoteIdentifier(schemaOwnerRole)};\n" +
          `      ${publicAclReset}`,
      ),
    )).toThrow("after the PUBLIC revoke and before activation ACL migration");
    expect(() => assertReaderSummaryDailyCheckerActivationOwnershipContract(
      checker.replace(definerUsageGrant, "").replace(
        activationAcl,
        `${activationAcl}\n    ${definerUsageGrant}`,
      ),
    )).toThrow("after the PUBLIC revoke and before activation ACL migration");
    expect(() => assertReaderSummaryDailyCheckerActivationOwnershipContract(
      checker.replace(definerUsageGrant, definerUsageGrant.replace("USAGE", "CREATE")),
    )).toThrow("must not grant schema CREATE to the activation definer");
  });

  it("pins enabled and forced RLS on every canonical fixture table", () => {
    const checker = readFileSync(
      "scripts/check-reader-summary-daily-execution-cursor-postgres.ts",
      "utf8",
    );
    expect(() => assertReaderSummaryDailyCheckerCanonicalRlsContract(checker))
      .not.toThrow();
    for (const table of [
      "reader_summary_artifacts",
      "reader_summary_publications",
      "reader_summary_weekly_publication_evidence",
      "reader_summary_jobs",
    ]) {
      for (const boundary of ["ENABLE", "FORCE"]) {
        const statement =
          `ALTER TABLE ${table} ${boundary} ROW LEVEL SECURITY;`;
        expect(() => assertReaderSummaryDailyCheckerCanonicalRlsContract(
          checker.replace(statement, "removed"),
        )).toThrow(`${boundary} RLS on canonical fixture table ${table}`);
      }
    }
  });

  it("bounds both database CREATE prerequisites and preserves table domains", () => {
    const checker = readFileSync(
      "scripts/check-reader-summary-daily-execution-cursor-postgres.ts",
      "utf8",
    );
    const databaseCreation = checker.indexOf(
      "CREATE DATABASE ${quoteIdentifier(databaseName)}",
    );
    const databaseGrant = checker.indexOf(
      "GRANT CREATE ON DATABASE ${quoteIdentifier(databaseName)}\n" +
      "    TO ${quoteIdentifier(migrationAdminRole)}, " +
      "${quoteIdentifier(schemaOwnerRole)}",
    );
    const migrationAdminPrecondition = checker.indexOf(
      "has_database_privilege(current_user, current_database(), 'CREATE')",
    );
    const schemaOwnerPrecondition = checker.indexOf(
      "has_database_privilege($1, current_database(), 'CREATE')",
    );
    const schemaHandoff = checker.indexOf(
      "ALTER SCHEMA public OWNER TO ${quoteIdentifier(schemaOwnerRole)}",
    );
    const databaseRevoke = checker.indexOf(
      "REVOKE CREATE ON DATABASE ${quoteIdentifier(databaseName)}\n" +
      "      FROM ${quoteIdentifier(migrationAdminRole)}, " +
      "${quoteIdentifier(schemaOwnerRole)}",
    );
    const jobHandoff = checker.indexOf(
      "ALTER TABLE public.reader_summary_jobs\n" +
      "        OWNER TO ${quoteIdentifier(schemaOwnerRole)}",
    );
    const activation = checker.indexOf(
      "await executePostgresMigrationWithDiagnostics(admin, {",
    );
    const activationAcl = checker.indexOf("await admin.query(activationAclMigration)");

    expect(databaseCreation).toBeGreaterThan(-1);
    expect(databaseGrant).toBeGreaterThan(databaseCreation);
    expect(migrationAdminPrecondition).toBeGreaterThan(databaseGrant);
    expect(schemaOwnerPrecondition).toBeGreaterThan(databaseGrant);
    expect(schemaHandoff).toBeGreaterThan(migrationAdminPrecondition);
    expect(schemaHandoff).toBeGreaterThan(schemaOwnerPrecondition);
    expect(databaseRevoke).toBeGreaterThan(schemaHandoff);
    expect(jobHandoff).toBeGreaterThan(databaseRevoke);
    expect(jobHandoff).toBeLessThan(activation);
    expect(activation).toBeLessThan(activationAcl);
    expect(checker).not.toContain(
      "GRANT ALL PRIVILEGES ON DATABASE ${quoteIdentifier(databaseName)}",
    );
    expect(checker).not.toContain(
      "ALTER TABLE public.reader_summary_jobs\n        " +
      "OWNER TO ${quoteIdentifier(publicationOwnerRole)}",
    );
    expect(checker).not.toContain(
      "REFERENCES ON TABLE public.reader_summary_jobs",
    );
  });

  it("pins the disposable PG18 role bootstrap and pre-existing-role cleanup", () => {
    const checker = readFileSync(
      "scripts/check-reader-summary-daily-execution-cursor-postgres.ts",
      "utf8",
    );
    expect(() => assertReaderSummaryDailyCheckerRoleBootstrapContract(checker))
      .not.toThrow();
    for (const mutation of [
      "CREATE ROLE ${quoteIdentifier(terminalRole)} LOGIN",
      `await roleAdmin.query("SET createrole_self_grant = ''")`,
      "NOLOGIN\n    NOSUPERUSER NOCREATEDB CREATEROLE INHERIT",
      "SET SESSION AUTHORIZATION ${quoteIdentifier(migrationAdminRole)}",
      "member.rolname = session_user AND grantor.rolsuper",
      "membership.admin_option AND NOT membership.inherit_option",
      "AND NOT membership.set_option) = 1",
      "WHERE membership.member = definer.oid",
      "if (terminalRoleCreated)",
      "for (const role of auxiliaryRolesCreated.reverse())",
      "if (migrationAdminRoleCreated)",
    ]) {
      expect(() => assertReaderSummaryDailyCheckerRoleBootstrapContract(
        checker.replaceAll(mutation, "removed"),
      )).toThrow();
    }
  });

  it("bounds schema-owner fixtures outside migration-admin telemetry execution", () => {
    const checker = readFileSync(
      "scripts/check-reader-summary-daily-execution-cursor-postgres.ts",
      "utf8",
    );
    expect(() => assertReaderSummaryDailyCheckerFixtureRoleContract(checker))
      .not.toThrow();
    const overlapGuard = `assert(!schemaOwnerFixtureRoleActive,
    "schema-owner fixture role scope cannot be nested or run in parallel")`;
    const migrationReset = `await admin.query("RESET ROLE");
  await executePostgresMigrationWithDiagnostics(admin, {`;
    const boundedReset = `await admin.query("RESET ROLE");
    await admin.query(boundedMaintenanceMigration);`;
    const seedScope = `await withSchemaOwnerFixtureRole(admin, async (fixtureAdmin) => ({
        historicalScope: await seedHistoricalCompletedDailyJob(fixtureAdmin),
        upgradeScopes: await seedUpgradeStateDailyJobs(fixtureAdmin),
      }))`;
    for (const mutation of [overlapGuard, boundedReset, seedScope]) {
      expect(() => assertReaderSummaryDailyCheckerFixtureRoleContract(
        checker.replace(mutation, "removed"),
      )).toThrow();
    }
    expect(() => assertReaderSummaryDailyCheckerFixtureRoleContract(
      checker.replace(
        migrationReset,
        `await executePostgresMigrationWithDiagnostics(admin, {
  await admin.query("RESET ROLE");`,
      ),
    )).toThrow("reset to migration admin first");
    expect(() => assertReaderSummaryDailyCheckerFixtureRoleContract(
      checker.replace(
        "await applyTelemetryMigrationAsMigrationAdmin(admin)",
        "await admin.query(telemetryMigration)",
      ),
    )).toThrow("route every telemetry migration through diagnosed reset boundary");
    for (const table of [
      "reader_summary_daily_model_jobs",
      "reader_summary_publications",
      "source_items",
      "feed_items",
    ]) {
      expect(() => assertReaderSummaryDailyCheckerFixtureRoleContract(
        `${checker}\nGRANT SELECT ON TABLE public.${table} ` +
          "TO ${quoteIdentifier(migrationAdminRole)};",
      )).toThrow("must not grant migration admin daily or canonical table privileges");
    }
  });

  it("pins the canonical publication owner boundary and canonical ownership", () => {
    const checker = readFileSync(
      "scripts/check-reader-summary-daily-execution-cursor-postgres.ts",
      "utf8",
    );
    const contract = readFileSync(
      "scripts/lib/reader-summary-daily-execution-cursor-postgres-contract.ts",
      "utf8",
    );
    expect(() => assertReaderSummaryDailyCanonicalPublicationFixtureContract(
      checker,
      contract,
    )).not.toThrow();
    for (const mutation of [
      "schemaOwnerRole: params.schemaOwnerRole",
      "publicationOwnerRole: params.publicationOwnerRole",
    ]) {
      const mutationIndex = contract.lastIndexOf(mutation);
      const mutated = contract.slice(0, mutationIndex) + "removed" +
        contract.slice(mutationIndex + mutation.length);
      expect(() => assertReaderSummaryDailyCanonicalPublicationFixtureContract(
        checker,
        mutated,
      )).toThrow();
    }
    for (const qualifiedDml of [
      "INSERT INTO public.reader_summary_jobs",
      "INSERT INTO public.reader_summary_artifacts",
      "INSERT INTO public.reader_summary_publications",
      "INSERT INTO public.reader_summary_weekly_publication_evidence",
      "UPDATE public.reader_summary_jobs",
    ]) {
      const mutationIndex = contract.lastIndexOf(qualifiedDml);
      const mutated = contract.slice(0, mutationIndex) +
        qualifiedDml.replace("public.", "") +
        contract.slice(mutationIndex + qualifiedDml.length);
      expect(() => assertReaderSummaryDailyCanonicalPublicationFixtureContract(
        checker,
        mutated,
      )).toThrow("must public-qualify canonical/job DML");
    }
    for (const transactionBoundary of [
      'await admin.query("BEGIN")',
      "set_config('social_monitor.tenant_id'",
    ]) {
      const mutationIndex = contract.lastIndexOf(transactionBoundary);
      const mutated = contract.slice(0, mutationIndex) + "removed" +
        contract.slice(mutationIndex + transactionBoundary.length);
      expect(() => assertReaderSummaryDailyCanonicalPublicationFixtureContract(
        checker,
        mutated,
      )).toThrow("bound only canonical DML as publication owner");
    }
    for (const mutation of [
      "SET ROLE ${quoteRoleIdentifier(params.publicationOwnerRole)}",
      "params.operation()",
      "SET ROLE ${quoteRoleIdentifier(params.schemaOwnerRole)}",
      "params.afterRestore()",
      "finally {",
    ]) {
      expect(() => assertReaderSummaryDailyCanonicalPublicationFixtureContract(
        checker,
        contract.replace(mutation, "removed"),
      )).toThrow();
    }
    const publicationSwitch =
      "SET ROLE ${quoteRoleIdentifier(params.publicationOwnerRole)}";
    const schemaRestoration =
      "SET ROLE ${quoteRoleIdentifier(params.schemaOwnerRole)}";
    expect(() => assertReaderSummaryDailyCanonicalPublicationFixtureContract(
      checker,
      contract.replace(publicationSwitch, "removed") + `\n${publicationSwitch}`,
    )).toThrow("must not mutate schema ACLs");
    expect(() => assertReaderSummaryDailyCanonicalPublicationFixtureContract(
      checker,
      contract.replace(schemaRestoration, "removed").replace(
        "params.afterRestore()",
        `params.afterRestore()\n${schemaRestoration}`,
      ),
    )).toThrow("restore schema owner, and bind the job before returning");
    for (const schemaAclMutation of [
      "GRANT USAGE ON SCHEMA public TO fixture_role",
      "REVOKE USAGE ON SCHEMA public FROM fixture_role",
    ]) {
      expect(() => assertReaderSummaryDailyCanonicalPublicationFixtureContract(
        checker,
        contract.replace("params.operation();", `params.operation();\n${schemaAclMutation};`),
      )).toThrow("must not mutate schema ACLs");
    }
    const afterRestoreBinding = "afterRestore: async () => {";
    const afterRestoreBindingIndex = contract.lastIndexOf(afterRestoreBinding);
    expect(() => assertReaderSummaryDailyCanonicalPublicationFixtureContract(
      checker,
      contract.slice(0, afterRestoreBindingIndex) + "removed" +
        contract.slice(afterRestoreBindingIndex + afterRestoreBinding.length),
    )).toThrow("bound only canonical DML as publication owner");
    const commit = 'await admin.query("COMMIT");';
    const commitIndex = contract.lastIndexOf(commit);
    const roleBoundary = "await withCanonicalPublicationFixtureRole({";
    const roleBoundaryIndex = contract.lastIndexOf(roleBoundary);
    const commitBeforeBoundary = contract.slice(0, roleBoundaryIndex) + commit + "\n    " +
      contract.slice(roleBoundaryIndex, commitIndex) +
      contract.slice(commitIndex + commit.length);
    expect(() => assertReaderSummaryDailyCanonicalPublicationFixtureContract(
      checker,
      commitBeforeBoundary,
    )).toThrow("bound only canonical DML as publication owner");
    const privilegeProof = checker.slice(
      checker.indexOf("const retainedPublicationOwnerSchemaPrivileges"),
      checker.indexOf("await admin.query(`SET ROLE", checker.indexOf(
        "const retainedPublicationOwnerSchemaPrivileges",
      )),
    );
    expect(() => assertReaderSummaryDailyCanonicalPublicationFixtureContract(
      checker.replace(privilegeProof, "removed"),
      contract,
    )).toThrow("retains durable schema USAGE without CREATE");
    expect(() => assertReaderSummaryDailyCanonicalPublicationFixtureContract(
      `${checker}\nREVOKE USAGE ON SCHEMA public ` +
        "FROM ${quoteIdentifier(publicationOwnerRole)};",
      contract,
    )).toThrow("must not revoke durable publication-owner schema USAGE");
    for (const table of [
      "reader_summary_artifacts",
      "reader_summary_publications",
      "reader_summary_weekly_publication_evidence",
    ]) {
      const handoff = `ALTER TABLE public.${table}\n        ` +
        "OWNER TO ${quoteIdentifier(publicationOwnerRole)}";
      expect(() => assertReaderSummaryDailyCanonicalPublicationFixtureContract(
        checker.replace(handoff, "removed"),
        contract,
      )).toThrow(`keep ${table} owned by the publication owner`);
      for (const role of [
        "schemaOwnerRole",
        "migrationAdminRole",
        "publicationOwnerRole",
      ]) {
        expect(() => assertReaderSummaryDailyCanonicalPublicationFixtureContract(
          `${checker}\nGRANT INSERT ON TABLE public.${table} ` +
            `TO \${quoteIdentifier(${role})};`,
          contract,
        )).toThrow(/must not grant canonical (?:DML|table DML privileges)/u);
      }
    }
  });

  it.each(["", "readerSummaryArtifact: { readerSummaryId: jobId }"])(
    "rejects a missing or changed canonical frontend artifact binding",
    (mutation) => {
      const checker = readFileSync(
        "scripts/check-reader-summary-daily-execution-cursor-postgres.ts", "utf8");
      const contract = readFileSync(
        "scripts/lib/reader-summary-daily-execution-cursor-postgres-contract.ts", "utf8");
      const binding = "readerSummaryArtifact: { readerSummaryId: artifactId }";
      const bindingIndex = contract.lastIndexOf(binding);
      const mutated = contract.slice(0, bindingIndex) + mutation +
        contract.slice(bindingIndex + binding.length);
      expect(() => assertReaderSummaryDailyCanonicalPublicationFixtureContract(
        checker, mutated,
      )).toThrow("frontend fixture must bind the canonical artifact");
    },
  );

  it("orders publication DML, restoration, and schema-owner binding", async () => {
    const queries: string[] = [];
    const client = {
      query: async (sql: string) => {
        queries.push(sql);
        return { rows: [], rowCount: null };
      },
    };
    await expect(withCanonicalPublicationFixtureRole({
      admin: client,
      schemaOwnerRole: "social_monitor_public_schema_owner",
      publicationOwnerRole: "social_monitor_reader_summary_publication_owner",
      operation: async () => {
        queries.push("CANONICAL OPERATION");
        return "fixture-result";
      },
      afterRestore: async () => { await client.query("SCHEMA OWNER JOB UPDATE"); },
    })).resolves.toBe("fixture-result");
    expect(queries).toEqual([
      'SET ROLE "social_monitor_reader_summary_publication_owner"',
      "CANONICAL OPERATION",
      'SET ROLE "social_monitor_public_schema_owner"',
      "SCHEMA OWNER JOB UPDATE",
    ]);
  });

  it("preserves operation, restoration, and binding error precedence", async () => {
    const operationError = new Error("canonical insert failed");
    const bindingError = new Error("schema owner job binding failed");
    const restorationError = new Error("schema owner restoration failed");
    let bindingCalls = 0;
    let queryCount = 0;
    await expect(withCanonicalPublicationFixtureRole({
      admin: {
        query: async () => {
          queryCount += 1;
          if (queryCount === 2) throw restorationError;
          return { rows: [], rowCount: null };
        },
      },
      schemaOwnerRole: "social_monitor_public_schema_owner",
      publicationOwnerRole: "social_monitor_reader_summary_publication_owner",
      operation: async () => undefined,
      afterRestore: async () => { bindingCalls += 1; },
    })).rejects.toBe(restorationError);
    expect(queryCount).toBe(2);
    expect(bindingCalls).toBe(0);

    queryCount = 0;
    await expect(withCanonicalPublicationFixtureRole({
      admin: {
        query: async () => {
          queryCount += 1;
          return { rows: [], rowCount: null };
        },
      },
      schemaOwnerRole: "social_monitor_public_schema_owner",
      publicationOwnerRole: "social_monitor_reader_summary_publication_owner",
      operation: async () => { throw operationError; },
      afterRestore: async () => { throw bindingError; },
    })).rejects.toBe(operationError);
    expect(queryCount).toBe(2);

    queryCount = 0;
    await expect(withCanonicalPublicationFixtureRole({
      admin: {
        query: async () => {
          queryCount += 1;
          return { rows: [], rowCount: null };
        },
      },
      schemaOwnerRole: "social_monitor_public_schema_owner",
      publicationOwnerRole: "social_monitor_reader_summary_publication_owner",
      operation: async () => undefined,
      afterRestore: async () => { throw bindingError; },
    })).rejects.toBe(bindingError);
    expect(queryCount).toBe(2);
  });

  it("rejects missing or reversed canonical fixture roles before switching", async () => {
    const queries: string[] = [];
    const client = {
      query: async (sql: string) => {
        queries.push(sql);
        return { rows: [], rowCount: null };
      },
    };
    for (const roles of [
      { schemaOwnerRole: "", publicationOwnerRole:
        "social_monitor_reader_summary_publication_owner" },
      { schemaOwnerRole: "social_monitor_reader_summary_publication_owner",
        publicationOwnerRole: "social_monitor_public_schema_owner" },
    ]) {
      await expect(withCanonicalPublicationFixtureRole({
        admin: client,
        ...roles,
        operation: async () => undefined,
        afterRestore: async () => undefined,
      })).rejects.toThrow("fixed");
    }
    expect(queries).toEqual([]);
  });

  it.each([
    ["table lock", "\nLOCK TABLE reader_summary_daily_execution_cursors;"],
    ["missing serializable", "current_setting('transaction_isolation') <> 'serializable'"],
    ["missing cutoff", "feed.\"observed_at\" <= invoked_at"],
    ["ambiguous cursor conflict", 'ON CONFLICT ON CONSTRAINT "reader_summary_daily_execution_cursors_pkey"'],
    ["ambiguous model conflict", 'ON CONFLICT ON CONSTRAINT "reader_summary_daily_model_jobs_pkey"'],
    ["model identity drift", "'reader-summary-daily:v1'"],
  ])("rejects %s drift", (_label, mutation) => {
    const sql = readFileSync(migrationPath, "utf8");
    const changed = mutation.startsWith("\n") ? `${sql}${mutation}` : sql.replaceAll(mutation, "removed");
    expect(() => assertReaderSummaryDailyMigrationContract(changed)).toThrow();
  });
});
