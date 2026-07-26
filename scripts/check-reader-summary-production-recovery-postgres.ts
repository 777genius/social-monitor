import { randomBytes } from "node:crypto";
import { Pool } from "pg";

import {
  provisionReaderSummaryPublicationFixtureScope,
  readerSummaryPublicationBackendPid,
  requiredReaderSummaryPublicationAdminDatabaseUrl,
  setReaderSummaryPublicationSessionScope,
} from "./lib/reader-summary-publication-postgres-fixture-scope";
import {
  applyOrderedReaderSummaryMigrations,
  assertReaderSummaryMigrationDatabaseMatchesSchema,
  createReaderSummaryPublicationMigrationWorkspace,
  installPublicationAndFollowingMigrations,
  preparePrePublicationMigrations,
  removeReaderSummaryPublicationMigrationWorkspace,
} from "./lib/reader-summary-publication-postgres-migrations";
import {
  assertReaderSummaryProductionRecoveryPostgresContract,
  seedReaderSummaryProductionRecoveryFixture,
} from "./lib/reader-summary-production-recovery-postgres-contract";
import {
  createPublicationFixtureRuntimeRole,
  dropPublicationFixtureDatabaseAndRoles,
  grantLegacyMigrationOwnership,
  makePublicationFixtureRuntimeDatabaseOwner,
  publicationDatabaseUrl,
  publicationProtectedRolePresence,
  publicationRuntimeDatabaseUrl,
  quotePostgresIdentifier,
  quotePostgresLiteral,
  runReaderSummaryPublicationBootstrapSql,
} from "./reader-summary-publication-postgres-privileges";

const serverAdminDatabaseUrl =
  requiredReaderSummaryPublicationAdminDatabaseUrl(process.env);
const suffix = randomBytes(10).toString("hex");
const databaseName = `reader_summary_recovery_test_${suffix}`;
const migrationAdminRole = `social_monitor_recovery_admin_${suffix}`;
const migrationAdminPassword = randomBytes(24).toString("base64url");
const runtimeRole = `social_monitor_recovery_test_${suffix}`;
const runtimePassword = randomBytes(24).toString("base64url");
const targetDatabaseUrl = publicationDatabaseUrl(
  serverAdminDatabaseUrl,
  databaseName,
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
const serverAdmin = new Pool({
  connectionString: serverAdminDatabaseUrl,
  max: 1,
});
const migrationWorkspace =
  createReaderSummaryPublicationMigrationWorkspace();
let ownerRolePreexisting = false;
let capabilityRolePreexisting = false;
let schemaOwnerRolePreexisting = false;
let tenantSystemCapabilityRolePreexisting = false;
let fixtureDatabaseCreated = false;
let fixtureMigrationAdminRoleCreated = false;
let fixtureRuntimeRoleCreated = false;

const main = async (): Promise<void> => {
  assert(
    /^reader_summary_recovery_test_[0-9a-f]{20}$/u.test(databaseName),
    "temporary recovery database name must be bounded",
  );
  const protectedRoles = await publicationProtectedRolePresence(serverAdmin);
  ownerRolePreexisting = protectedRoles.owner;
  capabilityRolePreexisting = protectedRoles.capability;
  schemaOwnerRolePreexisting = protectedRoles.schemaOwner;
  tenantSystemCapabilityRolePreexisting =
    protectedRoles.tenantSystemCapability;
  try {
    await serverAdmin.query(
      `CREATE ROLE ${quotePostgresIdentifier(
        migrationAdminRole,
      )} LOGIN PASSWORD ${quotePostgresLiteral(migrationAdminPassword)}
       NOSUPERUSER NOCREATEDB CREATEROLE INHERIT NOREPLICATION NOBYPASSRLS`,
    );
    fixtureMigrationAdminRoleCreated = true;
    await serverAdmin.query(
      `CREATE DATABASE ${quotePostgresIdentifier(
        databaseName,
      )} OWNER ${quotePostgresIdentifier(migrationAdminRole)}`,
    );
    fixtureDatabaseCreated = true;
    await createPublicationFixtureRuntimeRole({
      databaseName,
      migrationAdminRole,
      runtimePassword,
      runtimeRole,
      serverAdminDatabaseUrl,
    });
    fixtureRuntimeRoleCreated = true;
    await makePublicationFixtureRuntimeDatabaseOwner({
      databaseName,
      migrationAdminDatabaseUrl: adminDatabaseUrl,
      migrationAdminRole,
      runtimeRole,
      targetDatabaseUrl,
    });

    preparePrePublicationMigrations(migrationWorkspace);
    await grantLegacyMigrationOwnership(adminDatabaseUrl, runtimeRole);
    applyOrderedReaderSummaryMigrations(
      runtimeDatabaseUrl,
      migrationWorkspace,
    );
    await runReaderSummaryPublicationBootstrapSql(
      "pre",
      adminDatabaseUrl,
      runtimeRole,
    );
    installPublicationAndFollowingMigrations(migrationWorkspace);
    applyOrderedReaderSummaryMigrations(
      adminDatabaseUrl,
      migrationWorkspace,
    );
    await runReaderSummaryPublicationBootstrapSql(
      "post",
      adminDatabaseUrl,
      runtimeRole,
    );
    assertReaderSummaryMigrationDatabaseMatchesSchema(targetDatabaseUrl);

    const auditorPool = new Pool({
      connectionString: targetDatabaseUrl,
      max: 1,
    });
    const runtimePool = new Pool({
      connectionString: runtimeDatabaseUrl,
      max: 2,
    });
    try {
      const auditor = await auditorPool.connect();
      const first = await runtimePool.connect();
      const second = await runtimePool.connect();
      try {
        await provisionReaderSummaryPublicationFixtureScope(auditor);
        await seedReaderSummaryProductionRecoveryFixture(auditor);
        await Promise.all([
          setReaderSummaryPublicationSessionScope(first),
          setReaderSummaryPublicationSessionScope(second),
        ]);
        const [firstPid, secondPid] = await Promise.all([
          readerSummaryPublicationBackendPid(first),
          readerSummaryPublicationBackendPid(second),
        ]);
        assert(
          firstPid !== secondPid,
          "concurrency gate must use independent PostgreSQL connections",
        );
        await assertReaderSummaryProductionRecoveryPostgresContract({
          auditor,
          first,
          second,
        });
      } finally {
        auditor.release();
        first.release();
        second.release();
      }
    } finally {
      await runtimePool.end();
      await auditorPool.end();
    }
  } finally {
    removeReaderSummaryPublicationMigrationWorkspace(migrationWorkspace);
    await dropPublicationFixtureDatabaseAndRoles({
      serverAdmin,
      databaseName,
      migrationAdminRole,
      runtimeRole,
      ownerRolePreexisting,
      capabilityRolePreexisting,
      schemaOwnerRolePreexisting,
      tenantSystemCapabilityRolePreexisting,
      fixtureDatabaseCreated,
      fixtureMigrationAdminRoleCreated,
      fixtureRuntimeRoleCreated,
    });
  }
  console.log(
    "Reader summary production recovery PostgreSQL authority gate OK",
  );
};

function assert(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
