import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { join } from "node:path";

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
  type RecoveryPostgresClient,
  readerSummaryProductionRecoveryFixtureScope,
  seedReaderSummaryProductionRecoveryFixture,
} from "./lib/reader-summary-production-recovery-postgres-contract";
import {
  assertReaderSummaryProductionRecoveryGapPostgresContract,
  removeOriginalCutoffGapFixtureCollision,
  seedReaderSummaryProductionRecoveryGapFixture,
} from "./lib/reader-summary-production-recovery-gap-postgres-contract";

type RecoveryPoolClient = RecoveryPostgresClient &
  Readonly<{ release(): void }>;
type RecoveryPool = RecoveryPostgresClient &
  Readonly<{
    connect(): Promise<RecoveryPoolClient>;
    end(): Promise<void>;
  }>;
type PostgresRuntimeModule = Readonly<{
  Pool: new (config: {
    readonly connectionString: string;
    readonly max: number;
  }) => RecoveryPool;
}>;
type PublicationPrivilegesModule = Readonly<{
  publicationProtectedRolePresence(pool: RecoveryPool): Promise<{
    readonly capability: boolean;
    readonly owner: boolean;
    readonly schemaOwner: boolean;
    readonly tenantSystemCapability: boolean;
    readonly dailyActivationDefiner: boolean;
  }>;
  publicationDatabaseUrl(
    serverAdminDatabaseUrl: string,
    databaseName: string,
  ): string;
  publicationRuntimeDatabaseUrl(
    databaseUrl: string,
    role: string,
    password: string,
  ): string;
  quotePostgresIdentifier(value: string): string;
  quotePostgresLiteral(value: string): string;
  createPublicationFixtureRuntimeRole(params: {
    readonly databaseName: string;
    readonly migrationAdminRole: string;
    readonly runtimePassword: string;
    readonly runtimeRole: string;
    readonly serverAdminDatabaseUrl: string;
  }): Promise<void>;
  provisionPublicationFixtureDailyTerminalRole(params: {
    readonly dailyTerminalPassword: string;
    readonly migrationAdminRole: string;
    readonly serverAdmin: RecoveryPool;
  }): Promise<boolean>;
  makePublicationFixtureRuntimeDatabaseOwner(params: {
    readonly databaseName: string;
    readonly migrationAdminDatabaseUrl: string;
    readonly migrationAdminRole: string;
    readonly runtimeRole: string;
    readonly systemRuntimeRole: string;
    readonly targetDatabaseUrl: string;
  }): Promise<void>;
  grantLegacyMigrationOwnership(
    adminDatabaseUrl: string,
    runtimeRole: string,
  ): Promise<void>;
  runReaderSummaryPublicationBootstrapSql(
    phase: "pre" | "post",
    adminDatabaseUrl: string,
    runtimeRole: string,
  ): Promise<void>;
  dropPublicationFixtureDatabaseAndRoles(params: {
    readonly serverAdmin: RecoveryPool;
    readonly databaseName: string;
    readonly migrationAdminRole: string;
    readonly runtimeRole: string;
    readonly ownerRolePreexisting: boolean;
    readonly capabilityRolePreexisting: boolean;
    readonly schemaOwnerRolePreexisting: boolean;
    readonly tenantSystemCapabilityRolePreexisting: boolean;
    readonly dailyActivationDefinerRolePreexisting: boolean;
    readonly fixtureDatabaseCreated: boolean;
    readonly fixtureMigrationAdminRoleCreated: boolean;
    readonly fixtureRuntimeRoleCreated: boolean;
    readonly fixtureDailyTerminalRoleCreated?: boolean;
  }): Promise<void>;
}>;

const runtimeRequire = createRequire(join(process.cwd(), "package.json"));
const { Pool } = runtimeRequire("pg") as PostgresRuntimeModule;
(
  process as NodeJS.Process & {
    [key: symbol]: Readonly<{ enabled(value: boolean): boolean }> | undefined;
  }
)[Symbol.for("ts-node.register.instance")]?.enabled(false);
(runtimeRequire("ts-node") as {
  register(options: {
    readonly transpileOnly: boolean;
    readonly compilerOptions: Readonly<{ rootDir: string }>;
  }): unknown;
}).register({
  transpileOnly: true,
  compilerOptions: { rootDir: process.cwd() },
});
const {
  createPublicationFixtureRuntimeRole,
  dropPublicationFixtureDatabaseAndRoles,
  grantLegacyMigrationOwnership,
  makePublicationFixtureRuntimeDatabaseOwner,
  publicationDatabaseUrl,
  publicationProtectedRolePresence,
  provisionPublicationFixtureDailyTerminalRole,
  publicationRuntimeDatabaseUrl,
  quotePostgresIdentifier,
  quotePostgresLiteral,
  runReaderSummaryPublicationBootstrapSql,
} = runtimeRequire(
  "./scripts/reader-summary-publication-postgres-privileges",
) as PublicationPrivilegesModule;
const serverAdminDatabaseUrl =
  requiredReaderSummaryPublicationAdminDatabaseUrl(process.env);
const suffix = randomBytes(10).toString("hex");
const databaseName = `reader_summary_recovery_test_${suffix}`;
const migrationAdminRole = `social_monitor_recovery_admin_${suffix}`;
const migrationAdminPassword = randomBytes(24).toString("base64url");
const runtimeRole = `social_monitor_recovery_test_${suffix}`;
const runtimePassword = randomBytes(24).toString("base64url");
const dailyTerminalPassword = randomBytes(24).toString("base64url");
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
let dailyActivationDefinerRolePreexisting = false;
let fixtureDatabaseCreated = false;
let fixtureMigrationAdminRoleCreated = false;
let fixtureRuntimeRoleCreated = false;
let fixtureDailyTerminalRoleCreated = false;

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
  dailyActivationDefinerRolePreexisting = protectedRoles.dailyActivationDefiner;
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
    fixtureDailyTerminalRoleCreated =
      await provisionPublicationFixtureDailyTerminalRole({
        dailyTerminalPassword,
        migrationAdminRole,
        serverAdmin,
      });
    await makePublicationFixtureRuntimeDatabaseOwner({
      databaseName,
      migrationAdminDatabaseUrl: adminDatabaseUrl,
      migrationAdminRole,
      runtimeRole,
      systemRuntimeRole: runtimeRole,
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
        await provisionReaderSummaryPublicationFixtureScope(
          auditor,
          readerSummaryProductionRecoveryFixtureScope,
        );
        await seedReaderSummaryProductionRecoveryFixture(auditor);
        await Promise.all([
          setReaderSummaryPublicationSessionScope(
            first,
            readerSummaryProductionRecoveryFixtureScope,
          ),
          setReaderSummaryPublicationSessionScope(
            second,
            readerSummaryProductionRecoveryFixtureScope,
          ),
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
        await removeOriginalCutoffGapFixtureCollision(auditor);
        await seedReaderSummaryProductionRecoveryGapFixture(auditor);
        await assertReaderSummaryProductionRecoveryGapPostgresContract({
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
      dailyActivationDefinerRolePreexisting,
      fixtureDatabaseCreated,
      fixtureMigrationAdminRoleCreated,
      fixtureRuntimeRoleCreated,
      fixtureDailyTerminalRoleCreated,
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
