import { randomBytes } from "node:crypto";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { defaultPostgresRuntimePoolConfig } from "@social-monitor/platform-persistence";
import { PrismaSummaryConnection } from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-connection";

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
import {
  assertReaderSummaryDailyCanonicalRecoveryV4MigrationContract,
  assertReaderSummaryDailyCanonicalRecoveryV4PostgresContract,
} from "./lib/reader-summary-daily-canonical-recovery-v4-postgres-contract";
import {
  PostgresCanonicalRecoveryAuthority,
  canonicalJsonBytes,
  sha256,
} from "./lib/reader-summary-daily-canonical-recovery-v4";
import { ReaderSummaryDailyCanonicalRecoveryV4Executor } from "./lib/reader-summary-daily-canonical-recovery-v4-executor";
import { createReaderSummaryDailyTerminalRuntimeConnection } from "./lib/reader-summary-daily-terminal-runtime-connection";
import { createReaderSummaryDailyCanonicalRecoveryV4Finalizer } from "./run-reader-summary-daily-canonical-recovery";

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
const dailyTerminalDatabaseUrl = publicationRuntimeDatabaseUrl(
  adminDatabaseUrl,
  "social_monitor_reader_summary_daily_terminal",
  dailyTerminalPassword,
);
const serverAdmin = new Pool({
  connectionString: serverAdminDatabaseUrl,
  max: 1,
});
const migrationWorkspace =
  createReaderSummaryPublicationMigrationWorkspace();
const deferredCanonicalRecoveryMigrations = [
  "20260802233000_reader_summary_daily_canonical_recovery_v4",
  "20260802233100_reader_summary_daily_canonical_recovery_v4_security",
] as const;
let ownerRolePreexisting = false;
let capabilityRolePreexisting = false;
let schemaOwnerRolePreexisting = false;
let tenantSystemCapabilityRolePreexisting = false;
let dailyActivationDefinerRolePreexisting = false;
let fixtureDatabaseCreated = false;
let fixtureMigrationAdminRoleCreated = false;
let fixtureRuntimeRoleCreated = false;
let fixtureDailyTerminalRoleCreated = false;

class DeterministicDailyRecoveryRuntime {
  readonly runtimeEngine = "subscription-runtime-cli" as const;
  private readonly responseBytes = canonicalJsonBytes({
    headline: "Canonical recovery fixture",
    executiveSummary: "Immutable recovery evidence is intentionally no-signal.",
    narrativeSections: [],
    content: {
      headline: "Canonical recovery fixture",
      oneLineTakeaway: "Immutable recovery evidence is intentionally no-signal.",
      bullets: [],
      interestSections: [],
      sourceMix: [],
      topReads: [],
      claimBoard: [],
      reliabilityReport: {
        mode: "shadow",
        policyVersion: "reader_summary.reliability.v1",
        riskLevel: "low",
        riskScore: 0,
        risks: [],
      },
      trendDelta: {
        newSignals: [],
        growingSignals: [],
        repeatedSignals: [],
        fadingSignals: [],
      },
      openQuestions: [],
      risks: [],
      nextActions: [],
    },
    topStories: [],
    interestHighlights: [],
    repeatedSignals: [],
    risksAndUnknowns: [],
    citationMap: [],
    qualityFlags: ["no_signal"],
    confidence: { level: "low", score: 0, rationale: "No invented signal." },
    noSignalReason: "No immutable signal.",
  });
  private readonly requestedUtcDates: string[] = [];

  get callCount(): number {
    return this.requestedUtcDates.length;
  }

  async run(input: Readonly<{
    requestedUtcDate: string;
    signal: AbortSignal;
  }>): Promise<Readonly<{
    responseBytes: Buffer;
    executionAttestation: Readonly<Record<string, unknown>>;
  }>> {
    if (input.signal.aborted) {
      throw new Error("Daily recovery runtime was aborted before output_text");
    }
    this.requestedUtcDates.push(input.requestedUtcDate);
    const responseSha256 = sha256(this.responseBytes);
    return {
      responseBytes: Buffer.from(this.responseBytes),
      executionAttestation: {
        schemaVersion: 1,
        requestId: `daily-recovery-pg18-${input.requestedUtcDate}`,
        purpose: "social_monitor.reader_summary.weekly.generate",
        canonicalRequestSha256: sha256(Buffer.from(
          `daily-recovery-pg18-request:${input.requestedUtcDate}`,
          "utf8",
        )),
        provider: "codex",
        model: "gpt-5.6-sol",
        reasoningEffort: "xhigh",
        runtimeEngine: "subscription-runtime-cli",
        runtimePackageVersion: "1.0.0",
        launcherSha256: sha256(Buffer.from(
          "daily-recovery-pg18-launcher",
          "utf8",
        )),
        selectedOutputKind: "output_text",
        selectedOutputSha256: responseSha256,
      },
    };
  }
}

const main = async (): Promise<void> => {
  assertReaderSummaryDailyCanonicalRecoveryV4MigrationContract();
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
    for (const migration of deferredCanonicalRecoveryMigrations) {
      rmSync(join(migrationWorkspace.directory, "migrations", migration), {
        recursive: true,
      });
    }
    applyOrderedReaderSummaryMigrations(
      adminDatabaseUrl,
      migrationWorkspace,
    );
    await runReaderSummaryPublicationBootstrapSql(
      "post",
      adminDatabaseUrl,
      runtimeRole,
    );
    const auditorPool = new Pool({
      connectionString: targetDatabaseUrl,
      max: 1,
    });
    const runtimePool = new Pool({
      connectionString: runtimeDatabaseUrl,
      max: 2,
    });
    const dailyTerminalPool = new Pool({
      connectionString: dailyTerminalDatabaseUrl,
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
        for (const migration of deferredCanonicalRecoveryMigrations) {
          cpSync(
            join(process.cwd(), "prisma", "migrations", migration),
            join(migrationWorkspace.directory, "migrations", migration),
            { recursive: true },
          );
        }
        applyOrderedReaderSummaryMigrations(
          adminDatabaseUrl,
          migrationWorkspace,
        );
        assertReaderSummaryMigrationDatabaseMatchesSchema(targetDatabaseUrl);
        const firstTerminal = await dailyTerminalPool.connect();
        const terminalRuntime = createReaderSummaryDailyTerminalRuntimeConnection({
          READER_SUMMARY_DAILY_TERMINAL_DATABASE_URL: dailyTerminalDatabaseUrl,
          READER_SUMMARY_DAILY_AUDITOR_DATABASE_URL: runtimeDatabaseUrl,
        });
        const prisma = await PrismaSummaryConnection.create(
          defaultPostgresRuntimePoolConfig(runtimeDatabaseUrl, "daily-runner"),
        );
        const publicDirectory = mkdtempSync(
          join(tmpdir(), "social-monitor-daily-recovery-v4-pg18-"),
        );
        const runtime = new DeterministicDailyRecoveryRuntime();
        const executor = new ReaderSummaryDailyCanonicalRecoveryV4Executor({
          authority: new PostgresCanonicalRecoveryAuthority(
            terminalRuntime.terminal,
          ),
          runtime,
          finalizer: createReaderSummaryDailyCanonicalRecoveryV4Finalizer({
            prisma,
            publicDirectory,
          }),
          now: () => new Date(),
        });
        try {
          await assertReaderSummaryDailyCanonicalRecoveryV4PostgresContract({
            auditor,
            firstTerminal,
            executeAll: () => executor.runAll({
              tenantId: readerSummaryProductionRecoveryFixtureScope.tenantId,
              workspaceId: readerSummaryProductionRecoveryFixtureScope.workspaceId,
              workerId: `daily-recovery-pg18-${suffix}`,
            }),
            runtimeCallCount: () => runtime.callCount,
          });
        } finally {
          firstTerminal.release();
          rmSync(publicDirectory, { recursive: true, force: true });
          await Promise.all([prisma.close(), terminalRuntime.close()]);
        }
      } finally {
        auditor.release();
        first.release();
        second.release();
      }
    } finally {
      await dailyTerminalPool.end();
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
