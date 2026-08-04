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
  assertReaderSummaryDailyCanonicalRecoveryV4AmbiguityRetryMigrationContract,
  prepareReaderSummaryDailyCanonicalRecoveryV4AmbiguityRetryFixture,
} from "./lib/reader-summary-daily-canonical-recovery-v4-ambiguity-retry-postgres-contract";
import {
  type CanonicalRecoveryAuthority,
  type CanonicalRecoveryFinalizer,
  type CanonicalRecoveryPublication,
  PostgresCanonicalRecoveryAmbiguityRetryAuthorizer,
  PostgresCanonicalRecoveryAuthority,
  canonicalJsonBytes,
  canonicalRecoveryDates,
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
const canonicalRecoveryFoundationMigrations = [
  "20260802233000_reader_summary_daily_canonical_recovery_v4",
  "20260802233100_reader_summary_daily_canonical_recovery_v4_security",
  "20260803173000_reader_summary_daily_canonical_recovery_v4_tenant_rls",
] as const;
const originalCutoffForwardMigration =
  "20260804110000_reader_summary_daily_v4_original_cutoff_forward_correction";
const ambiguityRetryMigrations = [
  "20260804130000_reader_summary_daily_v4_ambiguity_retry_schema",
  "20260804130100_reader_summary_daily_v4_ambiguity_retry_transitions",
  "20260804130200_reader_summary_daily_v4_ambiguity_retry_consumers",
  "20260804130300_reader_summary_daily_v4_ambiguity_retry_evidence",
] as const;
const deferredCanonicalRecoveryMigrations = [
  ...canonicalRecoveryFoundationMigrations,
  originalCutoffForwardMigration,
  ...ambiguityRetryMigrations,
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

const assertReaderSummaryDailyCanonicalRecoveryV4GenericFixture = async (
  client: RecoveryPostgresClient,
  expectedV4Rows: "0" | "18",
): Promise<string> => {
  const { tenantId, workspaceId } = readerSummaryProductionRecoveryFixtureScope;
  const result = await client.query<{
    aliasScope: string; legacyAuthorities: string; legacySha: string;
    jul23Items: string; jul23Rss: string; jul24Items: string; jul24Rss: string;
    legacySnapshot: string; v4Rows: string;
  }>(`
    SELECT
      (SELECT count(*) FROM public.reader_summary_production_recovery_authority_corrections
       WHERE tenant_id = '${tenantId}' AND workspace_id = '${workspaceId}')::TEXT "aliasScope",
      (SELECT count(*) FROM public.reader_summary_production_recovery_leases
       WHERE tenant_id = '${tenantId}' AND workspace_id = '${workspaceId}'
         AND canonical_record->>'schemaVersion' =
           'reader_summary.production_recovery_authority.v2')::TEXT "legacyAuthorities",
      (SELECT btrim(canonical_sha256) FROM public.reader_summary_production_recovery_leases
       WHERE tenant_id = '${tenantId}' AND workspace_id = '${workspaceId}'
         AND canonical_record->>'schemaVersion' =
           'reader_summary.production_recovery_authority.v2') "legacySha",
      (SELECT sum(jsonb_array_length(value))::TEXT FROM public.reader_summary_production_recovery_days,
       LATERAL jsonb_each(provider_evidence) evidence(key, value)
       WHERE tenant_id = '${tenantId}' AND workspace_id = '${workspaceId}'
         AND requested_utc_date = DATE '2026-07-23') "jul23Items",
      (SELECT jsonb_array_length(provider_evidence->'rss')::TEXT
       FROM public.reader_summary_production_recovery_days WHERE tenant_id = '${tenantId}'
         AND workspace_id = '${workspaceId}' AND requested_utc_date = DATE '2026-07-23') "jul23Rss",
      (SELECT sum(jsonb_array_length(value))::TEXT FROM public.reader_summary_production_recovery_days,
       LATERAL jsonb_each(provider_evidence) evidence(key, value)
       WHERE tenant_id = '${tenantId}' AND workspace_id = '${workspaceId}'
         AND requested_utc_date = DATE '2026-07-24') "jul24Items",
      (SELECT jsonb_array_length(provider_evidence->'rss')::TEXT
       FROM public.reader_summary_production_recovery_days WHERE tenant_id = '${tenantId}'
         AND workspace_id = '${workspaceId}' AND requested_utc_date = DATE '2026-07-24') "jul24Rss",
      ((SELECT count(*) FROM public.reader_summary_daily_canonical_recovery_v4_plans
        WHERE tenant_id = '${tenantId}' AND workspace_id = '${workspaceId}') +
       (SELECT count(*) FROM public.reader_summary_daily_canonical_recovery_v4_authorities
        WHERE tenant_id = '${tenantId}' AND workspace_id = '${workspaceId}') +
       (SELECT count(*) FROM public.reader_summary_daily_canonical_recovery_v4_leases
        WHERE tenant_id = '${tenantId}' AND workspace_id = '${workspaceId}'))::TEXT "v4Rows",
      encode(sha256(convert_to(jsonb_build_object(
        'aliases', (SELECT coalesce(jsonb_agg(to_jsonb(alias) ORDER BY recovery_id), '[]'::JSONB)
          FROM public.reader_summary_production_recovery_authority_corrections alias
          WHERE tenant_id = '${tenantId}' AND workspace_id = '${workspaceId}'),
        'leases', (SELECT coalesce(jsonb_agg(to_jsonb(lease) ORDER BY id), '[]'::JSONB)
          FROM public.reader_summary_production_recovery_leases lease
          WHERE tenant_id = '${tenantId}' AND workspace_id = '${workspaceId}'),
        'days', (SELECT coalesce(jsonb_agg(to_jsonb(day) ORDER BY recovery_id, requested_utc_date), '[]'::JSONB)
          FROM public.reader_summary_production_recovery_days day
          WHERE tenant_id = '${tenantId}' AND workspace_id = '${workspaceId}'),
        'dryRuns', (SELECT coalesce(jsonb_agg(to_jsonb(dry) ORDER BY recovery_id, ordinal), '[]'::JSONB)
          FROM public.reader_summary_production_recovery_dry_runs dry
          WHERE tenant_id = '${tenantId}' AND workspace_id = '${workspaceId}')
      )::TEXT, 'UTF8')), 'hex') "legacySnapshot"
  `);
  const row = result.rows[0];
  assert(
    row?.aliasScope === "0" && row.legacyAuthorities === "1" &&
      row.legacySha.length === 64 &&
      row.legacySha !== "7fa94c8538f55592349e820685dc4d34d84c4f3a4afe9165e18df6271d7816f3" &&
      row.jul23Items === "342" && row.jul23Rss === "75" &&
      row.jul24Items === "350" && row.jul24Rss === "67" &&
      row.v4Rows === expectedV4Rows && row.legacySnapshot.length === 64,
    `generic corrected non-target fixture diverged: ${JSON.stringify(row)}`,
  );
  return row.legacySnapshot;
};

const main = async (): Promise<void> => {
  assertReaderSummaryDailyCanonicalRecoveryV4MigrationContract();
  assertReaderSummaryDailyCanonicalRecoveryV4AmbiguityRetryMigrationContract();
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
    for (const migration of canonicalRecoveryFoundationMigrations) {
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
        const legacyRecoveryBeforeForward =
          await assertReaderSummaryDailyCanonicalRecoveryV4GenericFixture(
            auditor,
            "0",
          );
        for (const migration of [
          originalCutoffForwardMigration,
          ...ambiguityRetryMigrations,
        ]) {
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
        await runReaderSummaryPublicationBootstrapSql(
          "post",
          adminDatabaseUrl,
          runtimeRole,
        );
        assertReaderSummaryMigrationDatabaseMatchesSchema(targetDatabaseUrl);
        const legacyRecoveryAfterForward =
          await assertReaderSummaryDailyCanonicalRecoveryV4GenericFixture(
            auditor,
            "18",
          );
        assert(
          legacyRecoveryAfterForward === legacyRecoveryBeforeForward,
          "forward migration changed generic legacy recovery rows, bytes, or hashes",
        );
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
        const baseAuthority: CanonicalRecoveryAuthority =
          new PostgresCanonicalRecoveryAuthority(terminalRuntime.terminal);
        const baseFinalizer: CanonicalRecoveryFinalizer =
          createReaderSummaryDailyCanonicalRecoveryV4Finalizer({
            prisma,
            publicDirectory,
          });
        const recordedPublications: CanonicalRecoveryPublication[] = [];
        let pendingFinalizeReadback = false;
        let deferredReadCount = 0;
        let realReadCount = 0;
        const immutablePublication = (
          publication: CanonicalRecoveryPublication,
        ): CanonicalRecoveryPublication => Object.freeze({ ...publication });

        // Checker-only batching defers immediate reads; terminal authority is verified twice.
        const wrappedFinalizer: CanonicalRecoveryFinalizer = {
          finalize: async (input) => {
            assert(
              !pendingFinalizeReadback,
              "checker-only batching requires the prior post-finalize readback",
            );
            const publication = await baseFinalizer.finalize(input);
            assert(
              !recordedPublications.some(
                (recorded) =>
                  recorded.requestedUtcDate === publication.requestedUtcDate,
              ),
              `checker-only batching recorded duplicate finalized date ${publication.requestedUtcDate}`,
            );
            const expectedNextDate =
              canonicalRecoveryDates[recordedPublications.length];
            assert(
              expectedNextDate !== undefined &&
                publication.requestedUtcDate === expectedNextDate,
              `checker-only batching finalized non-chronological next date: expected ${expectedNextDate ?? "none"}, received ${publication.requestedUtcDate}`,
            );
            recordedPublications.push(immutablePublication(publication));
            pendingFinalizeReadback = true;
            return publication;
          },
        };
        const wrappedAuthority: CanonicalRecoveryAuthority = {
          claim: (input) => baseAuthority.claim(input),
          markRunning: (work, at) => baseAuthority.markRunning(work, at),
          renew: (work, at) => baseAuthority.renew(work, at),
          complete: (work, input) => baseAuthority.complete(work, input),
          readFinalized: async (input) => {
            if (pendingFinalizeReadback) {
              pendingFinalizeReadback = false;
              deferredReadCount += 1;
              return Object.freeze(recordedPublications.map(immutablePublication));
            }
            const actual = await baseAuthority.readFinalized(input);
            realReadCount += 1;
            assert(
              canonicalJsonBytes(actual).equals(
                canonicalJsonBytes(recordedPublications),
              ),
              "terminal authority readback did not byte-match ordered finalizer publications",
            );
            return actual;
          },
        };
        const executor = new ReaderSummaryDailyCanonicalRecoveryV4Executor({
          authority: wrappedAuthority,
          runtime,
          finalizer: wrappedFinalizer,
          now: () => new Date(),
        });
        try {
          const ambiguityRetry =
            await prepareReaderSummaryDailyCanonicalRecoveryV4AmbiguityRetryFixture({
              auditor,
              firstTerminal,
              rogue: first,
              authority: baseAuthority,
              authorizer: new PostgresCanonicalRecoveryAmbiguityRetryAuthorizer(
                terminalRuntime.terminal,
              ),
              tenantId: readerSummaryProductionRecoveryFixtureScope.tenantId,
              workspaceId: readerSummaryProductionRecoveryFixtureScope.workspaceId,
            });
          const claimedRetryExecutor =
            new ReaderSummaryDailyCanonicalRecoveryV4Executor({
              authority: {
                ...wrappedAuthority,
                claim: async () => ({
                  kind: "claimed" as const,
                  work: ambiguityRetry.retryWork,
                }),
              },
              runtime,
              finalizer: wrappedFinalizer,
              now: () => new Date(),
            });
          const claimedRetryOutcome = await claimedRetryExecutor.runOne({
            tenantId: readerSummaryProductionRecoveryFixtureScope.tenantId,
            workspaceId: readerSummaryProductionRecoveryFixtureScope.workspaceId,
            workerId: ambiguityRetry.retryWork.workerId,
          });
          assert(
            claimedRetryOutcome.kind === "completed",
            "genuine attempt-2 work did not succeed after stale callbacks were rejected",
          );
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
          await ambiguityRetry.assertAfterExecution();
          assert(
            recordedPublications.length === 8,
            `checker-only batching must record exactly 8 finalizer publications; received ${recordedPublications.length}`,
          );
          assert(
            pendingFinalizeReadback === false,
            "checker-only batching must clear the final pending post-finalize readback",
          );
          assert(
            deferredReadCount === 8,
            `checker-only batching must defer exactly 8 immediate executor readbacks; received ${deferredReadCount}`,
          );
          assert(
            realReadCount === 2,
            `checker-only batching must perform exactly 2 real terminal authority readbacks; received ${realReadCount}`,
          );
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
    try {
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
    } finally {
      await serverAdmin.end();
    }
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
