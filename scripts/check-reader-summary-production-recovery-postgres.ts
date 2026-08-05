import { randomBytes } from "node:crypto";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
  assertReaderSummaryDailyCanonicalRecoveryV4HistoricalUnavailableMigrationContract,
} from "./lib/reader-summary-daily-canonical-recovery-v4-historical-unavailable-postgres-contract";
import {
  assertReaderSummaryDailyCanonicalRecoveryV4AmbiguityRetryMigrationContract,
  prepareReaderSummaryDailyCanonicalRecoveryV4AmbiguityRetryFixture,
} from "./lib/reader-summary-daily-canonical-recovery-v4-ambiguity-retry-postgres-contract";
import {
  type CanonicalRecoveryAuthority,
  type CanonicalRecoveryFinalizer,
  type CanonicalRecoveryPublication,
  type CanonicalRecoveryWork,
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
const historicalUnavailableMigration =
  "20260805163000_reader_summary_daily_v4_historical_unavailable";
const ambiguityRetryMigrations = [
  "20260804130000_reader_summary_daily_v4_ambiguity_retry_schema",
  "20260804130100_reader_summary_daily_v4_ambiguity_retry_transitions",
  "20260804130200_reader_summary_daily_v4_ambiguity_retry_consumers",
  "20260804130300_reader_summary_daily_v4_ambiguity_retry_evidence",
  "20260805090000_reader_summary_daily_v4_ambiguity_retry_period_guard",
  historicalUnavailableMigration,
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

type PeriodGuardIds = Readonly<{ artifact: string; event: string; job: string; publication: string }>;
type PeriodGuardPublicationInput = Readonly<{ periodStartedAt: string; periodEndedAt: string; requestedUtcDate: string; semanticStatus: "COMPLETED" | "NO_SIGNAL"; timestamp: string }>;
type PreparedPeriodGuardRetry = Readonly<{ artifact: string; evidence: string; job: string; proof: string; publicEvidence: string; publicFrontend: string; publication: string; report: string; requestedAt: string; snapshot: string; state: string }>;
const periodGuardIdsFor = (first: number): PeriodGuardIds => {
  const id = (offset: number): string => `f0000000-0000-4000-8000-000000000${String(first + offset).padStart(3, "0")}`;
  return { artifact: id(0), event: id(1), job: id(2), publication: id(3) };
};
const periodGuardIds = Object.freeze({ authorizationCollision: periodGuardIdsFor(201), historical: periodGuardIdsFor(211), raceCandidate: periodGuardIdsFor(221), racePrior: periodGuardIdsFor(231) });
let assertPeriodGuardAfterExecution: (() => Promise<void>) | undefined;
const withPeriodGuardSeedTransaction = async (client: RecoveryPostgresClient, operation: () => Promise<void>): Promise<void> => {
  await client.query("BEGIN");
  try { await operation(); await client.query("COMMIT"); } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
};
const withPublicationOwner = async (client: RecoveryPostgresClient, operation: () => Promise<void>): Promise<void> => {
  await client.query('SET LOCAL ROLE "social_monitor_reader_summary_publication_owner"'); try { await operation(); } finally { await client.query("RESET ROLE"); }
};
const isExactSha256 = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);

const seedPeriodGuardPublication = async (client: RecoveryPostgresClient, ids: PeriodGuardIds, input: PeriodGuardPublicationInput): Promise<void> => {
  const { tenantId, workspaceId } = readerSummaryProductionRecoveryFixtureScope; const key = ["daily", input.periodStartedAt, input.periodEndedAt, "UTC"].join(":");
  await withPublicationOwner(client, async () => { await client.query(`INSERT INTO public."reader_summary_artifacts" (id,tenant_id,workspace_id,scope_type,scope_key,interest_id,cadence,period_started_at,period_ended_at,period_timezone,period_key,user_id,subscription_id,status,schema_version,model_version,prompt_version,headline,summary_text,artifact_payload,citations,quality_signals,created_at,updated_at) VALUES ($1::UUID,$2::UUID,$3::UUID,'workspace','workspace',NULL,'daily',$4::TIMESTAMPTZ,$5::TIMESTAMPTZ,'UTC',$6::TEXT,NULL,NULL,$7::"SummaryStatus",1,'codex:period-guard-fixture','period-guard-fixture','period guard fixture','period guard fixture','{}'::JSONB,'[]'::JSONB,jsonb_build_object('qualityFlags',CASE WHEN $7::TEXT='NO_SIGNAL' THEN '["no_signal"]'::JSONB ELSE '[]'::JSONB END),$8::TIMESTAMPTZ,$8::TIMESTAMPTZ)`, [ids.artifact, tenantId, workspaceId, input.periodStartedAt, input.periodEndedAt, key, input.semanticStatus, input.timestamp]); });
  await client.query(`INSERT INTO public."reader_summary_jobs" (id,tenant_id,workspace_id,scope_type,scope_key,interest_id,cadence,period_started_at,period_ended_at,period_timezone,period_key,user_id,subscription_id,status,idempotency_key,requested_at,started_at,completed_at,failed_at,reader_summary_artifact_id,failure_reason,created_at,updated_at) VALUES ($1::UUID,$2::UUID,$3::UUID,'workspace','workspace',NULL,'daily',$4::TIMESTAMPTZ,$5::TIMESTAMPTZ,'UTC',$6::TEXT,NULL,NULL,$7::"SummaryStatus",'period-guard:'||$1::TEXT,$8::TIMESTAMPTZ,$8::TIMESTAMPTZ,$8::TIMESTAMPTZ,NULL,$9::UUID,NULL,$8::TIMESTAMPTZ,$8::TIMESTAMPTZ)`, [ids.job, tenantId, workspaceId, input.periodStartedAt, input.periodEndedAt, key, input.semanticStatus, input.timestamp, ids.artifact]);
  await client.query(`INSERT INTO public."outbox_events" (id,tenant_id,workspace_id,event_type,schema_version,payload,status,correlation_id,causation_id,created_at) VALUES ($1::UUID,$2::UUID,$3::UUID,'period-guard-fixture',1,'{}'::JSONB,'PENDING','period-guard-fixture',NULL,$4::TIMESTAMPTZ)`, [ids.event, tenantId, workspaceId, input.timestamp]);
  await withPublicationOwner(client, async () => { await client.query(`WITH publication AS (INSERT INTO public."reader_summary_publications" (id,tenant_id,workspace_id,scope_type,scope_key,cadence,period_started_at,period_ended_at,period_timezone,period_key,requested_utc_date,publication_kind,reader_summary_job_id,reader_summary_artifact_id,semantic_status,requested_at,model_version,model_authority,report_sha256,proof_sha256,exact_proof,outbox_event_id,published_at) VALUES ($1::UUID,$2::UUID,$3::UUID,'workspace','workspace','daily',$4::TIMESTAMPTZ,$5::TIMESTAMPTZ,'UTC',$6::TEXT,$7::DATE,'EXACT',$8::UUID,$9::UUID,$10::"SummaryStatus",$11::TIMESTAMPTZ,'codex:period-guard-fixture',3,repeat('a',64),repeat('b',64),'{"schemaVersion":"reader_summary.publication_proof.v1"}'::JSONB,$12::UUID,$11::TIMESTAMPTZ) RETURNING id) INSERT INTO public."reader_summary_publication_slots" (tenant_id,workspace_id,scope_type,scope_key,cadence,period_started_at,period_ended_at,period_timezone,current_publication_id,updated_at) SELECT $2::UUID,$3::UUID,'workspace','workspace','daily',$4::TIMESTAMPTZ,$5::TIMESTAMPTZ,'UTC',publication.id,$11::TIMESTAMPTZ FROM publication`, [ids.publication, tenantId, workspaceId, input.periodStartedAt, input.periodEndedAt, key, input.requestedUtcDate, ids.job, ids.artifact, input.semanticStatus, input.timestamp, ids.event]); });
};
const periodGuardSnapshot = async (client: RecoveryPostgresClient, ids: PeriodGuardIds): Promise<string> => {
  const result = await client.query<{ snapshot: string }>(`SELECT encode(sha256(convert_to(jsonb_build_object('artifact',(SELECT to_jsonb(artifact) FROM public."reader_summary_artifacts" artifact WHERE artifact.id=$1::UUID),'job',(SELECT to_jsonb(job) FROM public."reader_summary_jobs" job WHERE job.id=$2::UUID),'publication',(SELECT to_jsonb(publication) FROM public."reader_summary_publications" publication WHERE publication.id=$3::UUID),'slot',(SELECT to_jsonb(slot) FROM public."reader_summary_publication_slots" slot WHERE slot.current_publication_id=$3::UUID))::TEXT,'UTF8')),'hex') AS snapshot`, [ids.artifact, ids.job, ids.publication]);
  const snapshot = result.rows[0]?.snapshot; if (!isExactSha256(snapshot)) throw new Error("period-guard fixture snapshot is invalid"); return snapshot;
};
const seedPeriodGuardPublisherCandidate = async (client: RecoveryPostgresClient, input: Readonly<{ recoveryV4: boolean; timestamp: string }>): Promise<void> => {
  const ids = periodGuardIds.raceCandidate; await withPublicationOwner(client, async () => { await client.query(`INSERT INTO public."reader_summary_artifacts" (id,tenant_id,workspace_id,scope_type,scope_key,interest_id,cadence,period_started_at,period_ended_at,period_timezone,period_key,user_id,subscription_id,status,schema_version,model_version,prompt_version,headline,summary_text,artifact_payload,citations,quality_signals,created_at,updated_at) VALUES ($1::UUID,$2::UUID,$3::UUID,'workspace','workspace',NULL,'daily',TIMESTAMPTZ '2026-07-23T00:00:00Z',TIMESTAMPTZ '2026-07-24T00:00:00Z','UTC','daily:2026-07-23T00:00:00.000Z:2026-07-24T00:00:00.000Z:UTC',NULL,NULL,'RUNNING',1,'codex:period-guard-fixture','period-guard-fixture','period guard candidate','period guard candidate',jsonb_build_object('schemaVersion','reader_summary.artifact.v1','readerSummaryId',$1::TEXT,'tenantId',$2::TEXT,'workspaceId',$3::TEXT,'scope',jsonb_build_object('type','workspace'),'period',jsonb_build_object('cadence','daily','startedAt','2026-07-23T00:00:00.000Z','endedAt','2026-07-24T00:00:00.000Z','timezone','UTC','periodKey','daily:2026-07-23T00:00:00.000Z:2026-07-24T00:00:00.000Z:UTC'),'lineage',jsonb_build_object('modelVersion','codex:period-guard-fixture','promptVersion','period-guard-fixture'),'headline','period guard candidate','executiveSummary','period guard candidate','citationMap','[]'::JSONB,'qualityFlags','["no_signal"]'::JSONB,'noSignalReason','period guard fixture'),'[]'::JSONB,jsonb_build_object('qualityFlags','["no_signal"]'::JSONB,'githubProjectionAudit',CASE WHEN $4::BOOLEAN THEN jsonb_build_object('recoveryV4',jsonb_build_object('recoveryVersion','reader_summary.daily_canonical_recovery.v4')) ELSE jsonb_build_object('schemaVersion','reader_summary.github_projection.v1','status','not_required','requestedUtcDay','2026-07-23','pageCount',1,'scannedItemCount',0,'eligibleBindingIds','[]'::JSONB,'bindings','[]'::JSONB,'violationCodes','[]'::JSONB,'reasons','[]'::JSONB) END),$5::TIMESTAMPTZ,$5::TIMESTAMPTZ)`, [ids.artifact, readerSummaryProductionRecoveryFixtureScope.tenantId, readerSummaryProductionRecoveryFixtureScope.workspaceId, input.recoveryV4, input.timestamp]); });
  await client.query(`INSERT INTO public."reader_summary_jobs" (id,tenant_id,workspace_id,scope_type,scope_key,interest_id,cadence,period_started_at,period_ended_at,period_timezone,period_key,user_id,subscription_id,status,idempotency_key,requested_at,started_at,completed_at,failed_at,reader_summary_artifact_id,failure_reason,created_at,updated_at) VALUES ($1::UUID,$2::UUID,$3::UUID,'workspace','workspace',NULL,'daily',TIMESTAMPTZ '2026-07-23T00:00:00Z',TIMESTAMPTZ '2026-07-24T00:00:00Z','UTC','daily:2026-07-23T00:00:00.000Z:2026-07-24T00:00:00.000Z:UTC',NULL,NULL,'RUNNING','period-guard-race-candidate',$5::TIMESTAMPTZ,NULL,NULL,NULL,$4::UUID,NULL,$5::TIMESTAMPTZ,$5::TIMESTAMPTZ)`, [ids.job, readerSummaryProductionRecoveryFixtureScope.tenantId, readerSummaryProductionRecoveryFixtureScope.workspaceId, ids.artifact, input.timestamp]);
};
const publishPeriodGuardCandidate = (client: RecoveryPostgresClient) => client.query<{ outcome: string; publication_id: string }>(`SELECT * FROM public."publish_reader_summary"($1::JSONB)`, [JSON.stringify({ schemaVersion: "reader_summary.publication_command.v2", tenantId: readerSummaryProductionRecoveryFixtureScope.tenantId, workspaceId: readerSummaryProductionRecoveryFixtureScope.workspaceId, readerSummaryJobId: periodGuardIds.raceCandidate.job, readerSummaryArtifactId: periodGuardIds.raceCandidate.artifact })]);

const assertAmbiguityRetryPublishedHistoryPeriodGuard = async (input: Readonly<{ auditor: RecoveryPostgresClient; originalModelJobIdentity: string; sourceAuthoritySha256: string }>): Promise<void> => {
  const historical = periodGuardIds.historical;
  await withPeriodGuardSeedTransaction(input.auditor, () => seedPeriodGuardPublication(input.auditor, historical, { periodStartedAt: "2026-07-22T00:00:00.000Z", periodEndedAt: "2026-07-23T00:00:00.000Z", requestedUtcDate: "2026-07-23", semanticStatus: "COMPLETED", timestamp: "2026-07-23T12:00:00.000Z" }));
  const historicalSnapshot = await periodGuardSnapshot(input.auditor, historical);
  assertPeriodGuardAfterExecution = async () => {
    const result = await input.auditor.query<{ targetRows: string; publicationDate: string; evidenceDate: string; liveJobRequest: boolean }>(`
      SELECT (SELECT count(*)::TEXT FROM public."reader_summary_publications" publication WHERE publication.tenant_id=$1::UUID AND publication.workspace_id=$2::UUID AND publication.scope_type='workspace' AND publication.scope_key='workspace' AND publication.cadence='daily' AND publication.period_timezone='UTC' AND publication.period_started_at=TIMESTAMPTZ '2026-07-23T00:00:00Z' AND publication.period_ended_at=TIMESTAMPTZ '2026-07-24T00:00:00Z') AS "targetRows", publication.requested_utc_date::TEXT AS "publicationDate", evidence.requested_utc_date::TEXT AS "evidenceDate", (job.requested_at AT TIME ZONE 'UTC')::DATE <> DATE '2026-07-23' AS "liveJobRequest"
      FROM public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" retry JOIN public."reader_summary_publications" publication ON publication.id=retry.publication_id JOIN public."reader_summary_jobs" job ON job.id=retry.reader_summary_job_id JOIN public."reader_summary_weekly_publication_evidence" evidence ON evidence.publication_id=publication.id WHERE retry.tenant_id=$1::UUID AND retry.workspace_id=$2::UUID AND retry.requested_utc_date=DATE '2026-07-23'
    `, [readerSummaryProductionRecoveryFixtureScope.tenantId, readerSummaryProductionRecoveryFixtureScope.workspaceId]);
    const row = result.rows[0]; assert((await periodGuardSnapshot(input.auditor, historical)) === historicalSnapshot && row?.targetRows === "1" && row.publicationDate === "2026-07-23" && row.evidenceDate === "2026-07-23" && row.liveJobRequest === true, `period guard changed Jul22 history or V4 dates: ${JSON.stringify(row)}`);
  };
  await input.auditor.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  try {
    await seedPeriodGuardPublication(input.auditor, periodGuardIds.authorizationCollision, { periodStartedAt: "2026-07-23T00:00:00.000Z", periodEndedAt: "2026-07-24T00:00:00.000Z", requestedUtcDate: "2026-08-05", semanticStatus: "NO_SIGNAL", timestamp: "2026-08-04T12:00:00.000Z" }); await input.auditor.query('SET LOCAL SESSION AUTHORIZATION "social_monitor_reader_summary_daily_terminal"');
    let message: string | undefined; try { await input.auditor.query(`SELECT * FROM public."authorize_reader_summary_daily_canonical_recovery_v4_ambiguity_retry"($1::UUID,$2::UUID,DATE '2026-07-23',$3::CHAR(64),$4::CHAR(64),transaction_timestamp())`, [readerSummaryProductionRecoveryFixtureScope.tenantId, readerSummaryProductionRecoveryFixtureScope.workspaceId, input.originalModelJobIdentity, input.sourceAuthoritySha256]); } catch (error) { message = error instanceof Error ? error.message : String(error); }
    assert(message?.includes("cannot supersede published history"), "authorization accepted a current-date/status collision");
  } finally { await input.auditor.query("ROLLBACK"); }
};
const assertPostAuthorizationPublisherRace = async (input: Readonly<{ auditor: RecoveryPostgresClient; runtimeCallCount(): number }>): Promise<void> => {
  const callsBefore = input.runtimeCallCount(); await input.auditor.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  try {
    await seedPeriodGuardPublication(input.auditor, periodGuardIds.racePrior, { periodStartedAt: "2026-07-23T00:00:00.000Z", periodEndedAt: "2026-07-24T00:00:00.000Z", requestedUtcDate: "2026-08-04", semanticStatus: "COMPLETED", timestamp: "2026-08-04T12:00:00.000Z" }); const before = await periodGuardSnapshot(input.auditor, periodGuardIds.racePrior); await seedPeriodGuardPublisherCandidate(input.auditor, { recoveryV4: true, timestamp: "2026-08-04T13:00:00.000Z" }); await input.auditor.query('SET LOCAL ROLE "social_monitor_reader_summary_publication_owner"'); await input.auditor.query("SAVEPOINT before_period_guard_publisher");
    let message: string | undefined; try { await publishPeriodGuardCandidate(input.auditor); } catch (error) { message = error instanceof Error ? error.message : String(error); } await input.auditor.query("ROLLBACK TO SAVEPOINT before_period_guard_publisher"); await input.auditor.query("RESET ROLE");
    const retry = await input.auditor.query<{ state: string; unprepared: boolean }>(`SELECT state,reader_summary_job_id IS NULL AND reader_summary_artifact_id IS NULL AND publication_id IS NULL AND publication_prepared_at IS NULL AND finalized_at IS NULL AS unprepared FROM public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" WHERE tenant_id=$1::UUID AND workspace_id=$2::UUID AND requested_utc_date=DATE '2026-07-23'`, [readerSummaryProductionRecoveryFixtureScope.tenantId, readerSummaryProductionRecoveryFixtureScope.workspaceId]);
    assert(message?.includes("retry cannot supersede target publication slot") && (await periodGuardSnapshot(input.auditor, periodGuardIds.racePrior)) === before && retry.rows[0]?.state === "CONSUMED" && retry.rows[0]?.unprepared === true, `post-authorization publisher race mutated history or retry: ${message ?? "accepted"}`);
  } finally { await input.auditor.query("ROLLBACK"); }
  assert(input.runtimeCallCount() === callsBefore, "post-authorization publisher race made an unbounded model call");
};
const preparedPeriodGuardRetry = async (client: RecoveryPostgresClient): Promise<PreparedPeriodGuardRetry> => {
  const result = await client.query<PreparedPeriodGuardRetry>(`
    SELECT retry.state,retry.reader_summary_artifact_id::TEXT AS artifact,retry.reader_summary_job_id::TEXT AS job,retry.publication_id::TEXT AS publication,btrim(retry.publication_report_sha256) AS report,btrim(retry.publication_proof_sha256) AS proof,btrim(retry.weekly_evidence_sha256) AS evidence,btrim(retry.public_evidence_sha256) AS "publicEvidence",btrim(retry.public_frontend_sha256) AS "publicFrontend",job.requested_at::TEXT AS "requestedAt",encode(sha256(convert_to(jsonb_build_object('retry',to_jsonb(retry),'publication',to_jsonb(publication),'slot',to_jsonb(slot))::TEXT,'UTF8')),'hex') AS snapshot
    FROM public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" retry JOIN public."reader_summary_publications" publication ON publication.id=retry.publication_id JOIN public."reader_summary_jobs" job ON job.id=retry.reader_summary_job_id JOIN public."reader_summary_publication_slots" slot ON slot.tenant_id=publication.tenant_id AND slot.workspace_id=publication.workspace_id AND slot.scope_type=publication.scope_type AND slot.scope_key=publication.scope_key AND slot.cadence=publication.cadence AND slot.period_started_at=publication.period_started_at AND slot.period_ended_at=publication.period_ended_at AND slot.period_timezone=publication.period_timezone WHERE retry.tenant_id=$1::UUID AND retry.workspace_id=$2::UUID AND retry.requested_utc_date=DATE '2026-07-23'
  `, [readerSummaryProductionRecoveryFixtureScope.tenantId, readerSummaryProductionRecoveryFixtureScope.workspaceId]);
  const row = result.rows[0]; if (row === undefined || row.state !== "PUBLICATION_PENDING" || ![row.report,row.proof,row.evidence,row.publicEvidence,row.publicFrontend,row.snapshot].every(isExactSha256)) throw new Error(`prepared finalization retry is invalid: ${JSON.stringify(row)}`); return row;
};
const assertPreparedFinalizationPublisherRace = async (input: Readonly<{ auditor: RecoveryPostgresClient; work: CanonicalRecoveryWork }>): Promise<void> => {
  const before = await preparedPeriodGuardRetry(input.auditor); if (input.work.attemptOrdinal !== 2) throw new Error("prepared finalization race lacks attempt 2");
  await withPeriodGuardSeedTransaction(input.auditor, () => seedPeriodGuardPublisherCandidate(input.auditor, { recoveryV4: false, timestamp: new Date(Date.parse(before.requestedAt) + 1).toISOString() }));
  await input.auditor.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  try {
    await input.auditor.query(`SET LOCAL SESSION AUTHORIZATION ${quotePostgresIdentifier(runtimeRole)}`);
    const published = await publishPeriodGuardCandidate(input.auditor); assert(published.rows[0]?.outcome === "published" && published.rows[0]?.publication_id === periodGuardIds.raceCandidate.artifact, `prepared finalization race did not publish its competing slot: ${JSON.stringify(published.rows[0])}`); await input.auditor.query("SAVEPOINT before_finalize_period_guard_race");
    let message: string | undefined;
    try { await input.auditor.query(`SELECT public."finalize_reader_summary_daily_canonical_recovery_v4"($1::UUID,$2::UUID,$3::DATE,$4::CHAR(64),$5::SMALLINT,$6::TEXT,$7::BIGINT,$8::UUID,$9::UUID,$10::UUID,$11::CHAR(64),$12::CHAR(64),$13::CHAR(64),$14::CHAR(64),$15::CHAR(64))`, [input.work.tenantId,input.work.workspaceId,input.work.requestedUtcDate,input.work.modelJobIdentity,2,input.work.workerId,input.work.fencingToken.toString(),before.job,before.artifact,before.publication,before.report,before.proof,before.evidence,before.publicEvidence,before.publicFrontend]); } catch (error) { message = error instanceof Error ? error.message : String(error); }
    await input.auditor.query("ROLLBACK TO SAVEPOINT before_finalize_period_guard_race");
    await input.auditor.query("RESET SESSION AUTHORIZATION");
    const observed = await input.auditor.query<{ state: string; pending: boolean; rows: string; current: string }>(`SELECT retry.state,retry.finalized_at IS NULL AS pending,(SELECT count(*)::TEXT FROM public."reader_summary_publications" publication WHERE publication.tenant_id=$1::UUID AND publication.workspace_id=$2::UUID AND publication.scope_type='workspace' AND publication.scope_key='workspace' AND publication.cadence='daily' AND publication.period_timezone='UTC' AND publication.period_started_at=TIMESTAMPTZ '2026-07-23T00:00:00Z' AND publication.period_ended_at=TIMESTAMPTZ '2026-07-24T00:00:00Z') AS rows,(SELECT slot.current_publication_id::TEXT FROM public."reader_summary_publication_slots" slot WHERE slot.tenant_id=$1::UUID AND slot.workspace_id=$2::UUID AND slot.scope_type='workspace' AND slot.scope_key='workspace' AND slot.cadence='daily' AND slot.period_timezone='UTC' AND slot.period_started_at=TIMESTAMPTZ '2026-07-23T00:00:00Z' AND slot.period_ended_at=TIMESTAMPTZ '2026-07-24T00:00:00Z') AS current FROM public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" retry WHERE retry.tenant_id=$1::UUID AND retry.workspace_id=$2::UUID AND retry.requested_utc_date=DATE '2026-07-23'`, [input.work.tenantId,input.work.workspaceId]);
    const row = observed.rows[0]; assert(message?.includes("finalization target slot diverged") && row?.state === "PUBLICATION_PENDING" && row.pending === true && row.rows === "2" && row.current === periodGuardIds.raceCandidate.artifact, `prepared finalization race accepted a superseding publication: ${message ?? JSON.stringify(row)}`);
  } finally { await input.auditor.query("ROLLBACK"); }
  const after = await preparedPeriodGuardRetry(input.auditor); assert(after.snapshot === before.snapshot, "prepared finalization race changed retry, target publication, or current slot bytes");
};

const main = async (): Promise<void> => {
  assertReaderSummaryDailyCanonicalRecoveryV4MigrationContract();
  assertReaderSummaryDailyCanonicalRecoveryV4HistoricalUnavailableMigrationContract();
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
        let realFinalizedReadCount = 0;
        let realTerminalReadCount = 0;
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
            realFinalizedReadCount += 1;
            assert(
              canonicalJsonBytes(actual).equals(
                canonicalJsonBytes(recordedPublications),
              ),
              "terminal authority readback did not byte-match ordered finalizer publications",
            );
            return actual;
          },
          readTerminals: async (input) => {
            const actual = await baseAuthority.readTerminals(input);
            realTerminalReadCount += 1;
            const expected = Object.freeze(
              recordedPublications.map((publication) =>
                Object.freeze({
                  kind: "finalized" as const,
                  publication: immutablePublication(publication),
                }),
              ),
            );
            assert(
              canonicalJsonBytes(actual).equals(canonicalJsonBytes(expected)),
              "terminal authority terminal readback diverged from ordered finalized terminal publications",
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
              assertPublishedHistory: ({
                originalModelJobIdentity,
                sourceAuthoritySha256,
              }) => assertAmbiguityRetryPublishedHistoryPeriodGuard({
                auditor,
                originalModelJobIdentity,
                sourceAuthoritySha256,
              }),
              tenantId: readerSummaryProductionRecoveryFixtureScope.tenantId,
              workspaceId: readerSummaryProductionRecoveryFixtureScope.workspaceId,
            });
          await assertPostAuthorizationPublisherRace({
            auditor,
            runtimeCallCount: () => runtime.callCount,
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
          const immutableEvidenceConflict = join(
            publicDirectory,
            "durable-reader-summary-2026-07-23.v1.json",
          );
          writeFileSync(
            immutableEvidenceConflict,
            Buffer.from("checker-only conflicting immutable Jul23 evidence", "utf8"),
            { flag: "wx", mode: 0o444 },
          );
          let immutableConflict: string | undefined;
          try {
            await claimedRetryExecutor.runOne({
              tenantId: readerSummaryProductionRecoveryFixtureScope.tenantId,
              workspaceId: readerSummaryProductionRecoveryFixtureScope.workspaceId,
              workerId: ambiguityRetry.retryWork.workerId,
            });
          } catch (error) {
            immutableConflict = error instanceof Error ? error.message : String(error);
          }
          const preparedRetry = await preparedPeriodGuardRetry(auditor);
          assert(
            immutableConflict === "Canonical public file conflicts with immutable bytes" &&
              preparedRetry.state === "PUBLICATION_PENDING" &&
              runtime.callCount === 1,
            `attempt-2 conflict did not leave exactly one prepared publication: ${immutableConflict ?? "completed"}`,
          );
          await assertPreparedFinalizationPublisherRace({
            auditor,
            work: ambiguityRetry.retryWork,
          });
          // Remove only the checker-created public evidence collision.
          rmSync(immutableEvidenceConflict);
          // Fixture-only expiry lets the ordinary terminal claim replay prepared bytes.
          const expiredRetry = await auditor.query<{ state: string }>(`
            UPDATE public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries"
            SET lease_expires_at = transaction_timestamp() - INTERVAL '1 second'
            WHERE tenant_id = $1::UUID AND workspace_id = $2::UUID
              AND requested_utc_date = DATE '2026-07-23'
              AND state = 'PUBLICATION_PENDING'
            RETURNING state
          `, [
            readerSummaryProductionRecoveryFixtureScope.tenantId,
            readerSummaryProductionRecoveryFixtureScope.workspaceId,
          ]);
          assert(
            expiredRetry.rows.length === 1 &&
              expiredRetry.rows[0]?.state === "PUBLICATION_PENDING",
            "checker-only retry lease expiry did not preserve the prepared publication",
          );
          const replayExecutor = new ReaderSummaryDailyCanonicalRecoveryV4Executor({
            authority: baseAuthority,
            runtime,
            finalizer: baseFinalizer,
            now: () => new Date(),
          });
          const replayedRetry = await replayExecutor.runOne({
            tenantId: readerSummaryProductionRecoveryFixtureScope.tenantId,
            workspaceId: readerSummaryProductionRecoveryFixtureScope.workspaceId,
            workerId: `daily-recovery-pg18-resume-${suffix}`,
          });
          assert(
            replayedRetry.kind === "replayed" &&
              replayedRetry.publication.requestedUtcDate === "2026-07-23",
            "ordinary retry replay did not finalize the prepared Jul23 publication",
          );
          recordedPublications.push(immutablePublication(replayedRetry.publication));
          assert(
            runtime.callCount === 1,
            "the disposable retry E2E must make exactly one model call before replay coverage",
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
            assertPeriodGuardAfterExecution !== undefined,
            "period-guard post-execution assertion is missing",
          );
          await assertPeriodGuardAfterExecution();
          assert(
            recordedPublications.length === 8,
            `checker-only batching must record exactly 8 finalizer publications; received ${recordedPublications.length}`,
          );
          assert(
            pendingFinalizeReadback === false,
            "checker-only batching must clear the final pending post-finalize readback",
          );
          assert(
            deferredReadCount === 7,
            `checker-only batching must defer exactly 7 post-replay executor readbacks; received ${deferredReadCount}`,
          );
          assert(
            realFinalizedReadCount === 0,
            `checker-only batching must perform exactly 0 real finalized authority readbacks; received ${realFinalizedReadCount}`,
          );
          assert(
            realTerminalReadCount === 2,
            `checker-only batching must perform exactly 2 real terminal authority readbacks; received ${realTerminalReadCount}`,
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
