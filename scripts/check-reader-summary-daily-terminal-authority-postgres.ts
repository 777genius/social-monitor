import { createHash, randomBytes, randomUUID } from "node:crypto"; import { spawnSync } from "node:child_process";
import { cpSync, readFileSync, rmSync } from "node:fs"; import { createRequire } from "node:module";
import { join } from "node:path";
import { provisionReaderSummaryPublicationFixtureScope, readerSummaryPublicationBackendPid, readerSummaryPublicationFixtureScope, requiredReaderSummaryPublicationAdminDatabaseUrl, setReaderSummaryPublicationSessionScope } from "./lib/reader-summary-publication-postgres-fixture-scope";
import { applyOrderedReaderSummaryMigrations, assertDailyActivationIntermediateIsFailClosed, assertDailyActivationMigrationContract, assertDailyActivationRejectsNullishCompletionBindings, assertDailyActivationRejectsTemporaryForgeries, assertDailyActivationRuntimeSecurity, assertReaderSummaryMigrationDatabaseMatchesSchema, createReaderSummaryPublicationMigrationWorkspace, installDailyActivationMigration, installFailingDailyActivationAclMigration, installPublicationAndFollowingMigrations, installPublicationMigrationsBeforeDailyActivation, preparePrePublicationMigrations, readerSummaryDailyActivationAclMigration, readerSummaryDailyActivationMigration, removeInstalledReaderSummaryMigration, removeReaderSummaryPublicationMigrationWorkspace, resolveRolledBackReaderSummaryMigration, runOrderedReaderSummaryMigrations } from "./lib/reader-summary-publication-postgres-migrations";
type Row = Readonly<Record<string, unknown>>; type QueryResult<T> = Readonly<{ rows: readonly T[] }>;
type Client = Readonly<{ query<T = Record<string, unknown>>(sql: string, values?: readonly unknown[]): Promise<QueryResult<T>> }>;
type PoolClient = Client & Readonly<{ release(): void }>; type Pool = Client & Readonly<{ connect(): Promise<PoolClient>; end(): Promise<void> }>;
type PgModule = Readonly<{ Pool: new (config: Readonly<{ connectionString: string; max: number }>) => Pool }>;
type PrivilegesModule = Readonly<{
  publicationProtectedRolePresence(pool: Pool): Promise<Readonly<{ capability: boolean; owner: boolean; schemaOwner: boolean; tenantSystemCapability: boolean; dailyActivationDefiner: boolean }>>;
  publicationDatabaseUrl(adminUrl: string, database: string): string; publicationRuntimeDatabaseUrl(url: string, role: string, password: string): string;
  quotePostgresIdentifier(value: string): string; quotePostgresLiteral(value: string): string;
  createPublicationFixtureRuntimeRole(input: Readonly<{ databaseName: string; migrationAdminRole: string; runtimePassword: string; runtimeRole: string; serverAdminDatabaseUrl: string }>): Promise<void>; provisionPublicationFixtureProtectedRoles(input: Readonly<{ serverAdmin: Pool; migrationAdmin: Pool; migrationAdminRole: string }>): Promise<void>;
  makePublicationFixtureRuntimeDatabaseOwner(input: Readonly<{ databaseName: string; migrationAdminDatabaseUrl: string; migrationAdminRole: string; runtimeRole: string; systemRuntimeRole: string; targetDatabaseUrl: string }>): Promise<void>;
  grantLegacyMigrationOwnership(url: string, role: string): Promise<void>; runReaderSummaryPublicationBootstrapSql(phase: "pre" | "post", url: string, role: string, systemRuntimeRole?: string): Promise<void>;
  dropPublicationFixtureDatabaseAndRoles(input: Readonly<{ serverAdmin: Pool; databaseName: string; migrationAdminRole: string; runtimeRole: string; ownerRolePreexisting: boolean; capabilityRolePreexisting: boolean; schemaOwnerRolePreexisting: boolean; tenantSystemCapabilityRolePreexisting: boolean; dailyActivationDefinerRolePreexisting: boolean; fixtureDatabaseCreated: boolean; fixtureMigrationAdminRoleCreated: boolean; fixtureRuntimeRoleCreated: boolean; fixtureDailyTerminalRoleCreated?: boolean; systemRuntimeRole?: string; systemRuntimeRoleCreated?: boolean }>): Promise<void>;
}>;
const runtimeRequire = createRequire(join(process.cwd(), "package.json"));
const { Pool } = runtimeRequire("pg") as PgModule;
const tsNodeProcess = process as NodeJS.Process & { [key: symbol]: Readonly<{ enabled(value: boolean): boolean }> | undefined };
tsNodeProcess[Symbol.for("ts-node.register.instance")]?.enabled(false);
(runtimeRequire("ts-node") as { register(options: Readonly<{ transpileOnly: boolean; compilerOptions: Readonly<{ rootDir: string }> }>): unknown }).register({ transpileOnly: true, compilerOptions: { rootDir: process.cwd() } });
const privileges = runtimeRequire("./scripts/reader-summary-publication-postgres-privileges") as PrivilegesModule;
const scope = readerSummaryPublicationFixtureScope;
const day = new Date(); day.setUTCHours(0, 0, 0, 0); day.setUTCDate(day.getUTCDate() - 10);
const fixtureDates = Array.from({ length: 7 }, (_, offset) => { const value = new Date(day); value.setUTCDate(value.getUTCDate() + offset); return value.toISOString().slice(0, 10) });
const claimSql = `SELECT * FROM claim_reader_summary_daily_terminal($1::UUID, $2::UUID, $3::UUID, $4::TEXT)`;
const finalizeSql = `SELECT * FROM finalize_reader_summary_daily_terminal($1::UUID, $2::UUID, $3::DATE, $4::TEXT, $5::TEXT, $6::TEXT, $7::BIGINT)`;
const readOnlyTables = ["reader_summary_publications", "reader_summary_publication_slots", "reader_summary_weekly_publication_evidence"] as const, directAccessDeniedTables = ["reader_summary_jobs", "reader_summary_production_recovery_leases", "reader_summary_production_recovery_days", "reader_summary_production_recovery_dry_runs", "reader_summary_recovery_receipts", "reader_summary_weekly_certification_seals"] as const, dailyTerminalMigration = "20260730120000_reader_summary_daily_terminal_authority", terminalCapabilityMigration = "20260801120000_reader_summary_daily_terminal_runtime_capability", terminalRole = "social_monitor_reader_summary_daily_terminal";
const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Readonly<Record<string, unknown>>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
};
const canonicalBytes = (value: unknown): Buffer => Buffer.from(canonicalJson(value), "utf8");
const digest = (value: Buffer): string => createHash("sha256").update(value).digest("hex");
const postgresDate = (value: unknown): string => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
const transaction = async <T extends Row>(client: Client, sql: string,
  values: readonly unknown[], readOnly = false): Promise<T> => {
  await client.query(
    `BEGIN ISOLATION LEVEL SERIALIZABLE${readOnly ? " READ ONLY" : ""}`,);
  try {
    const result = await client.query<T>(sql, values);
    await client.query("COMMIT");
    const row = result.rows[0];
    assert(row !== undefined, "transaction returned no row");
    return row;
  } catch (error: unknown) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
};
type TerminalBinding = Readonly<{ authority_sha256: unknown; claim_token: unknown; evidence_sha256: unknown; fencing: unknown }>;
const claim = (
  client: Client, attempt = randomUUID(), token: string | null = null,
): Promise<TerminalBinding & Row> => transaction<TerminalBinding & Row>(
  client, claimSql, [
  scope.tenantId, scope.workspaceId, attempt, token,
]);
const finalize = (
  client: Client, date: string, binding: TerminalBinding, readOnly = false,
): Promise<Row> => transaction(client, finalizeSql, [
  scope.tenantId, scope.workspaceId, date, binding.authority_sha256,
  binding.claim_token, binding.evidence_sha256, binding.fencing,
], readOnly);
const expectFailure = async (
  operation: () => Promise<unknown>,
  fragment: string,
): Promise<void> => {
  try {
    await operation();
  } catch (error: unknown) {
    assert(
      error instanceof Error && error.message.includes(fragment),
      `expected failure containing ${fragment}`,);
    return;
  }
  throw new Error(`expected failure containing ${fragment}`);
};
const applySystemDsnBootstrapHelper = async (
  admin: Client, output: string, runtimeRole: string, systemRuntimeRole: string,
  password: string,
): Promise<void> => {
  const generated = spawnSync("bash", ["-c", ["set -eu", "IFS= read -r password",
    "source ops/deploy/reader-summary-publication-system-dsn-bootstrap-lib.sh",
    'reader_summary_publication_write_system_runtime_bootstrap_sql "$1" "$password"'].join("\n"), "daily-terminal-bootstrap", output], {
    cwd: process.cwd(), encoding: "utf8", input: `${password}\n`,
  });
  assert(generated.status === 0, `system-DSN bootstrap helper failed: ${generated.stderr.trim()}`);
  const sql = readFileSync(output, "utf8")
    .replace(/^\\set[^\n]*\n/gm, "")
    .replaceAll(":'runtime_role'", privileges.quotePostgresLiteral(runtimeRole))
    .replaceAll(":'system_runtime_role'", privileges.quotePostgresLiteral(systemRuntimeRole));
  await admin.query(sql);
};
type SourceFixture = Readonly<{
  date: string; providerCounts: readonly Row[];
  providerEvidence: Readonly<Record<string, readonly Row[]>>;
}>;
const seedSourceAuthority = async (
  auditor: Client,
  date: string,
  validBytes: boolean,
): Promise<SourceFixture> => {
  const recoveryId = randomUUID();
  const firstItemId = randomUUID(), secondItemId = randomUUID();
  const firstBindingId = randomUUID(), secondBindingId = randomUUID();
  const duplicate = {
    providerKey: "rss", sourceItemId: firstItemId,
    sourceBindingId: firstBindingId,
  };
  const providerEvidence = {
    rss: [
      duplicate,
      duplicate,
      {
        providerKey: "rss", sourceItemId: secondItemId,
        sourceBindingId: secondBindingId,
      },
    ],
    github: [{
      providerKey: "github", sourceItemId: randomUUID(),
      sourceBindingId: randomUUID(),
    }],
  };
  const providerCounts = Object.entries(providerEvidence).map(
    ([providerKey, rows]) => ({ providerKey, count: rows.length }),);
  const providerDigests = Object.entries(providerEvidence).map(
    ([providerKey, rows]) => ({
      providerKey, count: rows.length, sha256: digest(canonicalBytes(rows)),
    }),);
  const providerEvidenceSha = digest(canonicalBytes(providerDigests));
  const dayRecord = { schemaVersion: "reader_summary.production_recovery_day.v2",
    recoveryId, tenantId: scope.tenantId, workspaceId: scope.workspaceId,
    requestedUtcDate: date, providerCounts, providerEvidenceDigests: providerDigests,
    providerEvidenceSha256: providerEvidenceSha };
  const dayBytes = canonicalBytes(dayRecord);
  const leaseRecord = { schemaVersion: "reader_summary.production_recovery_authority.v2",
    recoveryId, tenantId: scope.tenantId, workspaceId: scope.workspaceId,
    requestedUtcDates: [date] };
  const leaseBytes = canonicalBytes(leaseRecord);
  await auditor.query("BEGIN");
  try {
    await auditor.query(
      `SELECT set_config('social_monitor.tenant_id', $1, true),
              set_config('social_monitor.workspace_id', $2, true),
              set_config('social_monitor.system_access', 'false', true)`,
      [scope.tenantId, scope.workspaceId],);
    await auditor.query(
      `SET LOCAL ROLE "social_monitor_reader_summary_publication_owner"`,);
    await auditor.query(
      `SELECT set_config(
        'social_monitor.production_recovery_write', 'on', true
      )`,);
    await auditor.query(
      `INSERT INTO reader_summary_production_recovery_leases
       (id, tenant_id, workspace_id, identity, state, canonical_record,
        canonical_bytes, canonical_sha256, issued_at, consumed_at)
       VALUES ($1, $2, $3, $4, 'ISSUED', $5::JSONB, $6, $7, now(), NULL)`,
      [recoveryId, scope.tenantId, scope.workspaceId,
        `fixture-source:${recoveryId}`, JSON.stringify(leaseRecord), leaseBytes,
        digest(leaseBytes)],);
    await auditor.query(
      `INSERT INTO reader_summary_production_recovery_days
       (recovery_id, tenant_id, workspace_id, requested_utc_date, identity,
        provider_counts, provider_evidence, provider_evidence_sha256,
        github_evidence, canonical_record, canonical_bytes, canonical_sha256,
        recorded_at)
       VALUES ($1, $2, $3, $4::DATE, $5, $6::JSONB, $7::JSONB, $8,
        '{}'::JSONB, $9::JSONB, $10, $11, now())`,
      [recoveryId, scope.tenantId, scope.workspaceId, date,
        `fixture-day:${recoveryId}`, JSON.stringify(providerCounts),
        JSON.stringify(providerEvidence), providerEvidenceSha,
        JSON.stringify(dayRecord), validBytes ? dayBytes : Buffer.concat(
          [dayBytes, Buffer.from(" ")]), digest(dayBytes)],);
    await auditor.query(
      `UPDATE reader_summary_production_recovery_leases
       SET state = 'CONSUMED', consumed_at = now()
       WHERE id = $1 AND state = 'ISSUED'`,
      [recoveryId],);
    await auditor.query("COMMIT");
  } catch (error: unknown) {
    await auditor.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
  return { date, providerCounts, providerEvidence };
};
type DurablePublicationBinding = Readonly<{
  artifactId: string; jobId: string; reportSha: string;
  proofSha: string; weeklyEvidenceSha: string;
}>;
const seedDurablePublication = async (
  auditor: Client,
  source: SourceFixture,
  variant: "exact" | "provider" | "binding" | "multiplicity" | "quality"
    = "exact",
): Promise<DurablePublicationBinding> => {
  const artifactId = randomUUID();
  const jobId = randomUUID();
  const outboxId = randomUUID();
  const report = {
    schemaVersion: "reader_summary.publication_report.v1",
    citations: [],
    fixture: true,
  };
  const reportSha = digest(canonicalBytes(report));
  const exactProof = {
    schemaVersion: "reader_summary.publication_proof.v1",
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    requestedUtcDate: source.date,
    readerSummaryJobId: jobId,
    readerSummaryArtifactId: artifactId,
    semanticStatus: "COMPLETED",
    reportSha256: reportSha,
  };
  const proofSha = digest(canonicalBytes(exactProof));
  const artifactPayload = { qualityFlags: [] };
  const qualitySignals = {
    qualityFlags: [],
    publicationDecision: {
      status: "published", qualityPassed: variant !== "quality",
    },
  };
  const providerEvidence = Object.values(source.providerEvidence)
    .flat().map((row) => ({ ...row }));
  if (variant === "provider") {
    providerEvidence[2]!.providerKey = "github";
    providerEvidence[3]!.providerKey = "rss";
  } else if (variant === "binding") {
    providerEvidence[0]!.sourceBindingId = randomUUID();
  } else if (variant === "multiplicity") {
    providerEvidence[1] = { ...providerEvidence[2]! };
  }
  const providerEvidenceSha = digest(canonicalBytes(providerEvidence));
  const evidenceRecord = {
    schemaVersion: "reader_summary.weekly_publication_evidence.v1",
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    requestedUtcDate: source.date,
    publicationId: artifactId,
    artifactId,
    jobId,
    providerCounts: source.providerCounts,
    providerEvidenceSha256: providerEvidenceSha,
  };
  const evidenceBytes = canonicalBytes(evidenceRecord);
  await auditor.query("BEGIN");
  try {
    await auditor.query(
      `SELECT set_config('social_monitor.tenant_id', $1, true),
              set_config('social_monitor.workspace_id', $2, true),
              set_config('social_monitor.system_access', 'false', true)`,
      [scope.tenantId, scope.workspaceId],);
    await auditor.query(
      `SET LOCAL ROLE "social_monitor_reader_summary_publication_owner"`,);
    await auditor.query(
      `INSERT INTO reader_summary_artifacts
       (id, tenant_id, workspace_id, scope_type, scope_key, interest_id,
        cadence, period_started_at, period_ended_at, period_timezone,
        period_key, user_id, subscription_id, status, schema_version,
        model_version, prompt_version, headline, summary_text,
        artifact_payload, citations, quality_signals, created_at, updated_at)
       VALUES ($1, $2, $3, 'workspace', 'workspace', NULL, 'daily',
        $4::DATE::TIMESTAMP AT TIME ZONE 'UTC',
        ($4::DATE + 1)::TIMESTAMP AT TIME ZONE 'UTC', 'UTC', $4, NULL, NULL,
        'COMPLETED', 1, 'fixture-model', 'fixture-prompt', 'Fixture', 'Fixture',
        $5::JSONB, '[]'::JSONB, $6::JSONB,
        $4::DATE::TIMESTAMP AT TIME ZONE 'UTC' + INTERVAL '2 hours',
        $4::DATE::TIMESTAMP AT TIME ZONE 'UTC' + INTERVAL '2 hours')`,
      [artifactId, scope.tenantId, scope.workspaceId, source.date,
        JSON.stringify(artifactPayload), JSON.stringify(qualitySignals)],);
    await auditor.query("RESET ROLE");
    await auditor.query(
      `INSERT INTO reader_summary_jobs
       (id, tenant_id, workspace_id, scope_type, scope_key, interest_id,
        cadence, period_started_at, period_ended_at, period_timezone,
        period_key, user_id, subscription_id, status, idempotency_key,
        requested_at, started_at, completed_at, failed_at,
        reader_summary_artifact_id, failure_reason, created_at, updated_at)
       VALUES ($1, $2, $3, 'workspace', 'workspace', NULL, 'daily',
        $4::DATE::TIMESTAMP AT TIME ZONE 'UTC',
        ($4::DATE + 1)::TIMESTAMP AT TIME ZONE 'UTC', 'UTC', $4, NULL, NULL,
        'COMPLETED', $5, $4::DATE::TIMESTAMP AT TIME ZONE 'UTC',
        $4::DATE::TIMESTAMP AT TIME ZONE 'UTC' + INTERVAL '1 hour',
        $4::DATE::TIMESTAMP AT TIME ZONE 'UTC' + INTERVAL '2 hours',
        NULL, $6, NULL, $4::DATE::TIMESTAMP AT TIME ZONE 'UTC',
        $4::DATE::TIMESTAMP AT TIME ZONE 'UTC' + INTERVAL '2 hours')`,
      [jobId, scope.tenantId, scope.workspaceId, source.date,
        `fixture-job:${jobId}`, artifactId],);
    await auditor.query(
      `INSERT INTO outbox_events
       (id, tenant_id, workspace_id, event_type, schema_version, payload,
        correlation_id, created_at)
       VALUES ($1, $2, $3, 'reader-summary.published', 1, '{}'::JSONB, $4,
        $5::DATE::TIMESTAMP AT TIME ZONE 'UTC' + INTERVAL '2 hours')`,
      [outboxId, scope.tenantId, scope.workspaceId, jobId, source.date],);
    await auditor.query(
      `SET LOCAL ROLE "social_monitor_reader_summary_publication_owner"`,);
    await auditor.query(
      `INSERT INTO reader_summary_publication_slots
       (tenant_id, workspace_id, scope_type, scope_key, cadence,
        period_started_at, period_ended_at, period_timezone,
        current_publication_id, updated_at)
       VALUES ($1, $2, 'workspace', 'workspace', 'daily',
        $3::DATE::TIMESTAMP AT TIME ZONE 'UTC',
        ($3::DATE + 1)::TIMESTAMP AT TIME ZONE 'UTC', 'UTC', NULL,
        $3::DATE::TIMESTAMP AT TIME ZONE 'UTC' + INTERVAL '2 hours')`,
      [scope.tenantId, scope.workspaceId, source.date],);
    await auditor.query(
      `INSERT INTO reader_summary_publications
       (id, tenant_id, workspace_id, scope_type, scope_key, cadence,
        period_started_at, period_ended_at, period_timezone, period_key,
        requested_utc_date, publication_kind, reader_summary_job_id,
        reader_summary_artifact_id, semantic_status, requested_at,
        model_version, model_authority, report_sha256, proof_sha256,
        exact_proof, outbox_event_id, published_at)
       VALUES ($1, $2, $3, 'workspace', 'workspace', 'daily',
        $4::DATE::TIMESTAMP AT TIME ZONE 'UTC',
        ($4::DATE + 1)::TIMESTAMP AT TIME ZONE 'UTC', 'UTC', $4, $4,
        'EXACT', $5, $1, 'COMPLETED',
        $4::DATE::TIMESTAMP AT TIME ZONE 'UTC', 'fixture-model', 2,
        $6, $7, $8::JSONB, $9,
        $4::DATE::TIMESTAMP AT TIME ZONE 'UTC' + INTERVAL '2 hours')`,
      [artifactId, scope.tenantId, scope.workspaceId, source.date, jobId,
        reportSha, proofSha, JSON.stringify(exactProof), outboxId],);
    await auditor.query(
      `UPDATE reader_summary_publication_slots
       SET current_publication_id = $1
       WHERE tenant_id = $2 AND workspace_id = $3
         AND scope_type = 'workspace' AND scope_key = 'workspace'
         AND cadence = 'daily'
         AND period_started_at =
           $4::DATE::TIMESTAMP AT TIME ZONE 'UTC'`,
      [artifactId, scope.tenantId, scope.workspaceId, source.date],);
    await auditor.query(
      `INSERT INTO reader_summary_weekly_publication_evidence
       (publication_id, tenant_id, workspace_id, scope_type, scope_key,
        cadence, period_started_at, period_ended_at, period_timezone,
        requested_utc_date, reader_summary_job_id, reader_summary_artifact_id,
        report_id, proof_id, semantic_status, report, report_sha256,
        exact_proof, proof_sha256, artifact_payload_sha256, provider_evidence,
        provider_evidence_sha256, github_evidence, canonical_record,
        canonical_bytes, canonical_sha256, identity, recorded_at)
       VALUES ($1, $2, $3, 'workspace', 'workspace', 'daily',
        $4::DATE::TIMESTAMP AT TIME ZONE 'UTC',
        ($4::DATE + 1)::TIMESTAMP AT TIME ZONE 'UTC', 'UTC', $4, $5, $1,
        $6, $7, 'COMPLETED', $8::JSONB, $9, $10::JSONB, $11, $12,
        $13::JSONB, $14, $15::JSONB, $16::JSONB, $17, $18, $19, now())`,
      [artifactId, scope.tenantId, scope.workspaceId, source.date, jobId,
        `fixture-report:${randomUUID()}`, `fixture-proof:${randomUUID()}`,
        JSON.stringify(report), reportSha, JSON.stringify(exactProof), proofSha,
        digest(canonicalBytes(artifactPayload)), JSON.stringify(providerEvidence),
        providerEvidenceSha, JSON.stringify({ mode: "verified", evidenceCount: 0 }),
        JSON.stringify(evidenceRecord), evidenceBytes, digest(evidenceBytes),
        `fixture-evidence:${randomUUID()}`],);
    await auditor.query("COMMIT");
  } catch (error: unknown) {
    await auditor.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
  return { artifactId, jobId, reportSha, proofSha,
    weeklyEvidenceSha: digest(evidenceBytes) };
};
const assertDailyPublicationRejectsFrontendArtifactBindings = async (auditor: Client,
  terminal: Client, date: string, publication: DurablePublicationBinding): Promise<void> => {
  const worker = "activation-json-negative";
  const claimed = await transaction<Row>(terminal, `SELECT * FROM
    public.claim_reader_summary_daily_execution($1, $2, $3, $4::DATE,
    pg_catalog.transaction_timestamp())`,
    [scope.tenantId, scope.workspaceId, worker, date]);
  const fencing = claimed.fencing_token;
  await transaction(terminal, `SELECT public.mark_reader_summary_daily_model_job_running(
      $1, $2, $3::DATE, $4, $5, pg_catalog.transaction_timestamp())`,
    [scope.tenantId, scope.workspaceId, date, worker, fencing]);
  const identity = (await auditor.query<{ readonly identity: string }>(
    `SELECT identity FROM public.reader_summary_daily_model_jobs WHERE
     tenant_id = $1 AND workspace_id = $2 AND requested_utc_date = $3::DATE`,
    [scope.tenantId, scope.workspaceId, date])).rows[0]?.identity;
  assert(identity !== undefined, "daily activation fixture job was not reserved");
  const response = Buffer.from("activation-response", "utf8"), responseSha = digest(response);
  await assertDailyActivationRejectsNullishCompletionBindings(terminal, auditor, {
    tenantId: scope.tenantId, workspaceId: scope.workspaceId, date, worker, fencing, identity, response, responseSha });
  const attestation = { provider: "codex", model: "gpt-5.6-sol",
    reasoningEffort: "xhigh", runtimeEngine: "subscription-runtime-cli",
    selectedOutputSha256: responseSha };
  const attestationBytes = canonicalBytes(attestation), attestationSha = digest(attestationBytes);
  const receiptBytes = canonicalBytes({ modelJobIdentity: identity,
    responseSha256: responseSha, attestationSha256: attestationSha });
  await transaction(terminal, `SELECT public.complete_reader_summary_daily_model_job(
      $1, $2, $3::DATE, $4, $5, pg_catalog.transaction_timestamp(),
      $6, $7, $8::JSONB, $9, $10, $11, $12)`,
    [scope.tenantId, scope.workspaceId, date, worker, fencing, response,
      responseSha, JSON.stringify(attestation), attestationBytes, attestationSha,
      receiptBytes, digest(receiptBytes)]);
  const evidenceBytes = canonicalBytes({ scope: { tenantId: scope.tenantId,
    workspaceId: scope.workspaceId }, result: { readerSummaryJobId: publication.jobId,
    readerSummaryId: publication.artifactId } });
  for (const readerSummaryArtifact of [{}, { readerSummaryId: null },
    { readerSummaryId: randomUUID() }]) {
    const frontendBytes = canonicalBytes({ tenantId: scope.tenantId,
      workspaceId: scope.workspaceId, readerSummaryArtifact });
    await expectFailure(() => transaction(terminal, `SELECT
      public.finalize_reader_summary_daily_publication(
        $1, $2, $3::DATE, $4, $5, pg_catalog.transaction_timestamp(),
        $6, $7, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [scope.tenantId, scope.workspaceId, date, worker, fencing,
        publication.jobId, publication.artifactId, publication.reportSha,
        publication.proofSha, publication.weeklyEvidenceSha, evidenceBytes,
        digest(evidenceBytes), frontendBytes, digest(frontendBytes)]),
    "daily public files do not bind the canonical publication");
  }
};
const insertExpiredClaim = async (
  auditor: Client,
  date: string,
): Promise<string> => {
  const token = randomBytes(32).toString("hex");
  await auditor.query("BEGIN");
  try {
    await auditor.query(
      `SELECT set_config('social_monitor.tenant_id', $1, true),
              set_config('social_monitor.workspace_id', $2, true),
              set_config('social_monitor.system_access', 'false', true)`,
      [scope.tenantId, scope.workspaceId],);
    await auditor.query(
      `SET LOCAL ROLE "social_monitor_reader_summary_publication_owner"`,);
    await auditor.query(
      `SELECT set_config(
        'social_monitor.production_recovery_write', 'on', true
      )`,);
    await auditor.query(
      `WITH authority AS (
         SELECT * FROM reader_summary_daily_terminal_authority($1, $2, $3)
       ), body AS (
         SELECT jsonb_build_object(
           'schemaVersion', 'reader_summary.daily_terminal_claim.v2',
           'tenantId', $1::TEXT,
           'workspaceId', $2::TEXT,
           'requestedUtcDate', to_char($3::DATE, 'YYYY-MM-DD'),
           'attemptId', $4::UUID::TEXT,
           'authoritySha256', authority_sha256,
           'evidenceSha256', evidence_sha256,
           'tokenDigest', encode(sha256(convert_to($5, 'UTF8')), 'hex'),
           'fencing', 1,
           'expiresAt', to_char(
             clock_timestamp() - INTERVAL '1 minute',
             'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
           )
         ) AS record
         FROM authority
       ), encoded AS (
         SELECT record, convert_to(
           reader_summary_production_recovery_canonical_json(record),
           'UTF8'
         ) AS bytes
         FROM body
       )
       INSERT INTO reader_summary_production_recovery_leases
       (id, tenant_id, workspace_id, identity, state, canonical_record,
        canonical_bytes, canonical_sha256, issued_at, consumed_at)
       SELECT $4::UUID, $1, $2, 'fixture-expired-claim:' || $4::UUID::TEXT, 'ISSUED',
         record, bytes, encode(sha256(bytes), 'hex'),
         clock_timestamp() - INTERVAL '2 minutes', NULL
       FROM encoded`,
      [scope.tenantId, scope.workspaceId, date, randomUUID(), token],);
    await auditor.query("COMMIT");
  } catch (error: unknown) {
    await auditor.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
  return token;
};
const assertMetadata = async (auditor: Client, migratorRole: string,
  ordinaryRoles: readonly string[]): Promise<void> => {
  const migration = readFileSync("prisma/migrations/20260730120000_reader_summary_daily_terminal_authority/migration.sql", "utf8");
  assert(
    !/\b20\d{2}-\d{2}-\d{2}\b/.test(migration) &&
      !/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/.test(migration) &&
      !/\b[0-9a-f]{64}\b/.test(migration),
    "migration must not contain production date, UUID, or SHA literals",);
  assert(!migration.includes("reader_summary_daily_terminal_fact") &&
    !migration.includes("'terminalSealSha'") && !migration.includes("existingModelReceipt"),
  "migration must not contain synthetic facts, self-hash, or receipts");
  const metadata = await auditor.query<{
    readonly secure: boolean; readonly fixed_path: boolean; readonly fixed_session_user: boolean; readonly public_execute: boolean;
    readonly terminal_execute: boolean; readonly internal_execute: boolean; readonly weekly_execute: boolean; readonly evidence_read: boolean;
    readonly evidence_dml: boolean; readonly protected_access: boolean; readonly other_owned_execute: boolean; readonly has_table_lock: boolean;
    readonly has_row_locks: boolean; readonly terminal_login: boolean; readonly terminal_inherit: boolean; readonly terminal_unsafe: boolean;
    readonly terminal_config: readonly string[]; readonly terminal_incoming: string;
    readonly terminal_incoming_valid: boolean; readonly terminal_outgoing: string;
    readonly ordinary_terminal_access: boolean; readonly ordinary_terminal_inherit: boolean;
  }>(`
    WITH terminal_functions AS (
      SELECT proc.*, pg_get_functiondef(proc.oid) AS definition
      FROM pg_proc proc WHERE proc.oid IN (
        'claim_reader_summary_daily_terminal(uuid,uuid,uuid,text)'::regprocedure,
        'finalize_reader_summary_daily_terminal(uuid,uuid,date,text,text,text,bigint)'::regprocedure
      )
    ) SELECT
      bool_and(proc.prosecdef) AS secure,
      bool_and(proc.proconfig = ARRAY['search_path=pg_catalog, public']::TEXT[])
        AS fixed_path,
      bool_and(proc.definition LIKE '%session_user <> ''${terminalRole}''%')
        AS fixed_session_user,
      bool_or(has_function_privilege('public', proc.oid, 'EXECUTE')) AS public_execute,
      bool_and(has_function_privilege(current_user, proc.oid, 'EXECUTE')) AS terminal_execute,
      has_function_privilege(current_user,
        'reader_summary_daily_terminal_authority(uuid,uuid,date)', 'EXECUTE') AS internal_execute,
      has_function_privilege(current_user, 'publish_reader_summary(jsonb)', 'EXECUTE') AS weekly_execute,
      (SELECT bool_and(has_table_privilege(current_user, name, 'SELECT'))
       FROM unnest('{reader_summary_artifacts,reader_summary_publications,reader_summary_publication_slots,reader_summary_weekly_publication_evidence}'::TEXT[]) evidence(name)) AS evidence_read,
      EXISTS (SELECT 1 FROM unnest('{reader_summary_artifacts,reader_summary_publications,reader_summary_publication_slots,reader_summary_weekly_publication_evidence}'::TEXT[]) evidence(name)
        CROSS JOIN unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) privilege(name)
        WHERE has_table_privilege(current_user, evidence.name, privilege.name)) AS evidence_dml,
      EXISTS (SELECT 1 FROM unnest('{reader_summary_jobs,reader_summary_production_recovery_leases,reader_summary_production_recovery_days,reader_summary_production_recovery_dry_runs,reader_summary_recovery_receipts,reader_summary_weekly_certification_seals}'::TEXT[]) protected(name)
        CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) privilege(name)
        WHERE has_table_privilege(current_user, protected.name, privilege.name)) AS protected_access,
      EXISTS (SELECT 1 FROM pg_proc owned_proc JOIN pg_roles owner ON owner.oid = owned_proc.proowner
        WHERE owner.rolname = 'social_monitor_reader_summary_publication_owner'
          AND owned_proc.oid NOT IN (SELECT oid FROM terminal_functions)
          AND owned_proc.oid NOT IN ('claim_reader_summary_daily_canonical_recovery_v4(uuid,uuid,text,timestamptz)'::regprocedure, 'renew_reader_summary_daily_canonical_recovery_v4_lease(uuid,uuid,date,text,bigint,timestamptz)'::regprocedure, 'mark_reader_summary_daily_canonical_recovery_v4_running(uuid,uuid,date,text,bigint,timestamptz)'::regprocedure, 'complete_reader_summary_daily_canonical_recovery_v4(uuid,uuid,date,text,bigint,timestamptz,bytea,character,jsonb,bytea,character,bytea,character)'::regprocedure, 'read_reader_summary_daily_canonical_recovery_v4_finalized(uuid,uuid)'::regprocedure)
          AND has_function_privilege(current_user, owned_proc.oid, 'EXECUTE')) AS other_owned_execute,
      bool_or(proc.definition ~* 'LOCK[[:space:]]+TABLE') AS has_table_lock,
      bool_and(proc.definition ~* 'ORDER BY[\\s\\S]+FOR (UPDATE|SHARE)') AS has_row_locks,
      role.rolcanlogin AS terminal_login, role.rolinherit AS terminal_inherit,
      role.rolsuper OR role.rolcreatedb OR role.rolcreaterole
        OR role.rolreplication OR role.rolbypassrls AS terminal_unsafe,
      role.rolconfig AS terminal_config,
      (SELECT count(*)::TEXT FROM pg_auth_members membership
       WHERE membership.roleid = role.oid) AS terminal_incoming,
      (SELECT COALESCE(bool_and(member.rolname = $1 AND grantor.rolsuper
          AND membership.admin_option AND NOT membership.inherit_option
          AND NOT membership.set_option), true)
       FROM pg_auth_members membership JOIN pg_roles member ON member.oid = membership.member
       JOIN pg_roles grantor ON grantor.oid = membership.grantor
       WHERE membership.roleid = role.oid) AS terminal_incoming_valid,
      (SELECT count(*)::TEXT FROM pg_auth_members membership
       WHERE membership.member = role.oid) AS terminal_outgoing,
      EXISTS (SELECT 1 FROM unnest($2::TEXT[]) ordinary(name)
        CROSS JOIN unnest(ARRAY['MEMBER','USAGE','SET']) capability(name)
        WHERE pg_has_role(ordinary.name, role.rolname, capability.name)) AS ordinary_terminal_access,
      EXISTS (SELECT 1 FROM pg_auth_members membership JOIN pg_roles member ON member.oid = membership.member
        WHERE membership.roleid = role.oid AND member.rolname = ANY($2::TEXT[])
          AND membership.inherit_option) AS ordinary_terminal_inherit
    FROM terminal_functions proc
    CROSS JOIN pg_roles role
    WHERE role.rolname = '${terminalRole}'
    GROUP BY role.oid, role.rolname, role.rolcanlogin, role.rolinherit, role.rolsuper, role.rolcreatedb,
      role.rolcreaterole, role.rolreplication, role.rolbypassrls, role.rolconfig
  `, [migratorRole, ordinaryRoles]);
  const row = metadata.rows[0];
  assert(row?.secure === true, "terminal functions must be SECURITY DEFINER"); assert(row.fixed_path === true, "terminal functions need fixed search paths");
  assert(row.fixed_session_user === true, "terminal functions need fixed LOGIN guards"); assert(row.public_execute === false, "PUBLIC execute must be denied");
  assert(row.terminal_execute === true, "terminal execute must be admitted"); assert(row.internal_execute === false, "terminal internal helpers must be denied");
  assert(row.weekly_execute === false, "terminal weekly publish must be denied"); assert(row.evidence_read === true, "terminal evidence SELECT must be admitted"); assert(row.evidence_dml === false, "terminal evidence DML must be denied"); assert(row.protected_access === false, "terminal protected access must be denied");
  assert(row.other_owned_execute === false, "terminal internal helpers must be denied"); assert(row.has_table_lock === false, "terminal functions must not table-lock");
  assert(row.has_row_locks === true, "terminal functions need ordered row locks");
  assert(row.terminal_login && !row.terminal_inherit && !row.terminal_unsafe, "terminal LOGIN attributes must remain least privilege");
  assert(JSON.stringify(row.terminal_config) === JSON.stringify(["search_path=pg_catalog, public"]), "terminal search_path must be fixed");
  assert(["0", "1"].includes(row.terminal_incoming) && row.terminal_incoming_valid,
    "terminal LOGIN incoming membership must match the PostgreSQL 18 creator row");
  assert(row.terminal_outgoing === "0", "terminal LOGIN must have no outgoing memberships");
  assert(!row.ordinary_terminal_access && !row.ordinary_terminal_inherit,
    "ordinary and system runtimes must have no terminal capability");
};
const assertOrdinaryRuntime = async (client: Client): Promise<void> => {
  const identity = await client.query<{ readonly current_user: string; readonly can_claim: boolean;
    readonly can_finalize: boolean; readonly can_publish_weekly: boolean }>(`
    SELECT current_user,
      has_function_privilege(current_user,
        'claim_reader_summary_daily_terminal(uuid,uuid,uuid,text)', 'EXECUTE') AS can_claim,
      has_function_privilege(current_user,
        'finalize_reader_summary_daily_terminal(uuid,uuid,date,text,text,text,bigint)', 'EXECUTE') AS can_finalize,
      has_function_privilege(current_user,
        'publish_reader_summary(jsonb)', 'EXECUTE') AS can_publish_weekly`);
  assert(identity.rows[0]?.current_user !== terminalRole, "ordinary and terminal LOGINs must be distinct");
  assert(!identity.rows[0]?.can_claim && !identity.rows[0]?.can_finalize, "ordinary runtime must not claim or finalize daily terminal authority");
  assert(identity.rows[0]?.can_publish_weekly === true, "ordinary runtime must retain weekly publication authority");
  for (const table of ["reader_summary_jobs", "reader_summary_artifacts"]) {
    await client.query(`SELECT * FROM ${table} LIMIT 0`);
    await client.query(`INSERT INTO ${table} SELECT * FROM ${table} WHERE FALSE`);
    await client.query(`UPDATE ${table} SET id = id WHERE FALSE`);
    await client.query(`DELETE FROM ${table} WHERE FALSE`);
    for (const privilege of ["TRUNCATE", "REFERENCES", "TRIGGER"]) {
      const result = await client.query<{ readonly admitted: boolean }>(`SELECT has_table_privilege(current_user, $1, $2) AS admitted`, [table, privilege]);
      assert(result.rows[0]?.admitted === false, `ordinary runtime retained ${privilege} on ${table}`);
    }
  }
  for (const table of readOnlyTables) { await client.query(`SELECT * FROM ${table} LIMIT 0`); const result = await client.query<{ readonly admitted: boolean }>(`SELECT has_table_privilege(current_user, $1, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS admitted`, [table]); assert(result.rows[0]?.admitted === false, `ordinary runtime retained writes on ${table}`); } };
const assertTerminal = (
  terminal: Row,
  status: "COMPLETE" | "PARTIAL" | "UNAVAILABLE",
  deficitCodes: readonly string[],
  durable: boolean,
  quality: boolean,
): void => {
  const bytes = terminal.terminal_bytes as Buffer;
  const record = terminal.terminal_record as Readonly<Record<string, unknown>>;
  assert(
    digest(bytes) === terminal.terminal_seal_sha256,
    "terminal hash must cover the exact returned bytes",);
  assert(
    bytes.equals(canonicalBytes(record)),
    "terminal bytes must be the exact canonical record",);
  assert(
    !("terminalSealSha" in record) &&
      !("existingModelReceipt" in record) &&
      !("modelReceipt" in record),
    "terminal record must not contain a self-hash or receipt",);
  assert(record.terminalStatus === status, "terminal status diverged");
  assert(
    record.terminalAuthorityModelCallPerformed === false,
    "terminal authority must never claim a model call",);
  const actualCodes = (record.deficits as readonly Row[])
    .map((deficit) => deficit.code);
  assert(
    JSON.stringify(actualCodes) === JSON.stringify(deficitCodes),
    `${status} deficits must equal failed predicates`,);
  assert(
    (record.durableExecutionAttestation !== null) === durable,
    `${status} durable attestation must equal its predicate`,);
  assert(
    (record.qualityAuthorizedArtifact !== null) === quality,
    `${status} quality artifact must equal its predicate`,);
  assert(
    record.generationDisposition === (
      durable
        ? "DURABLE_EXECUTION_ATTESTED"
        : "NO_DURABLE_EXECUTION_ATTESTATION"
    ),
    `${status} generation disposition must equal durable execution`,);
};
const assertAuthority = async (
  auditor: PoolClient,
  first: PoolClient,
  second: PoolClient,
  migratorRole: string,
  ordinaryRoles: readonly string[],
): Promise<void> => {
  await assertMetadata(first, migratorRole, ordinaryRoles);
  await assertDailyActivationRuntimeSecurity(auditor, ["public", "social_monitor_public_schema_owner", "social_monitor_reader_summary_publication_owner", "social_monitor_reader_summary_publication_runtime", "social_monitor_tenant_system_runtime", migratorRole, ...ordinaryRoles], migratorRole);
  await assertDailyActivationRejectsTemporaryForgeries(first);
  const sources: SourceFixture[] = [];
  for (const [index, date] of fixtureDates.entries()) {
    sources.push(await seedSourceAuthority(
      auditor, date, index < fixtureDates.length - 2,));
  }
  const variants = [
    "exact", "provider", "binding", "multiplicity", "quality", "exact",
  ] as const;
  const publications: DurablePublicationBinding[] = [];
  for (const [index, variant] of variants.entries()) {
    publications.push(await seedDurablePublication(
      auditor, sources[index]!, variant));
  }
  await assertDailyPublicationRejectsFrontendArtifactBindings(
    auditor, first, fixtureDates[5]!, publications[5]!);
  await expectFailure(
    () =>
      first.query(claimSql, [
        scope.tenantId,
        scope.workspaceId,
        randomUUID(),
        null,
      ]),
    "claim transaction is invalid",);
  await auditor.query("BEGIN");
  await auditor.query(
    `SELECT id FROM workspaces WHERE id = $1 ORDER BY id FOR UPDATE`,
    [scope.workspaceId],);
  await first.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  await first.query("SET LOCAL statement_timeout = '500ms'");
  await expectFailure(
    () =>
      first.query(claimSql, [
        randomUUID(),
        scope.workspaceId,
        randomUUID(),
        null,
      ]),
    "session scope is invalid",);
  await first.query("ROLLBACK");
  await auditor.query("ROLLBACK");
  await Promise.all(readOnlyTables.map((table) =>
    first.query(`SELECT * FROM ${table} LIMIT 0`)));
  await first.query("SELECT * FROM reader_summary_artifacts LIMIT 0");
  for (const table of directAccessDeniedTables) {
    await expectFailure(() => first.query(`SELECT * FROM ${table} LIMIT 0`), "permission denied");
  }
  for (const table of ["reader_summary_artifacts", ...directAccessDeniedTables]) {
    await expectFailure(() => first.query(`DELETE FROM ${table} WHERE FALSE`), "permission denied");
  }
  const attempt = randomUUID();
  await first.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  const acquired = (
    await first.query<TerminalBinding & Row>(claimSql, [
      scope.tenantId,
      scope.workspaceId,
      attempt,
      null,
    ])
  ).rows[0]!;
  assert(acquired.outcome === "acquired", "first claim must acquire");
  assert(
    postgresDate(acquired.requested_utc_date) === fixtureDates[0],
    "claim must choose the earliest unresolved source day",);
  const firstPid = await readerSummaryPublicationBackendPid(first);
  const secondPid = await readerSummaryPublicationBackendPid(second);
  assert(firstPid !== secondPid, "concurrency needs independent sessions");
  const locks = await auditor.query<{ readonly mode: string }>(
    `SELECT mode FROM pg_locks
     WHERE pid = $1 AND locktype = 'relation' AND granted`,
    [firstPid],);
  assert(
    locks.rows.every(
      ({ mode }) =>
        ![
          "ShareLock",
          "ShareRowExclusiveLock",
          "ExclusiveLock",
          "AccessExclusiveLock",
        ].includes(mode),
    ),
    "claim acquired a forbidden relation lock",);
  await second.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  let settled = false;
  const competing = second
    .query(claimSql, [
      scope.tenantId,
      scope.workspaceId,
      randomUUID(),
      null,
    ])
    .then((result) => ({ result, error: undefined }))
    .catch((error: unknown) => ({ result: undefined, error }))
    .finally(() => {
      settled = true;
    });
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert(settled === false, "competing claim bypassed the workspace row fence");
  await first.query("COMMIT");
  const competition = await competing;
  if (competition.error === undefined) {
    assert(
      competition.result?.rows[0]?.outcome === "busy",
      "concurrent claim must observe busy authority",);
    await second.query("COMMIT");
  } else {
    assert(
      typeof competition.error === "object" &&
        competition.error !== null &&
        "code" in competition.error &&
        competition.error.code === "40001",
      "concurrent claim must fail as a SERIALIZABLE retry",);
    await second.query("ROLLBACK");
  }
  const resumed = await claim(first, attempt, acquired.claim_token as string);
  assert(
    resumed.outcome === "resume_same_attempt",
    "same attempt and token must resume",);
  await expectFailure(
    () =>
      transaction(first, finalizeSql, [
        scope.tenantId,
        scope.workspaceId,
        fixtureDates[1],
        acquired.authority_sha256,
        acquired.claim_token,
        acquired.evidence_sha256,
        acquired.fencing,
      ]),
    "date skipping is forbidden",);
  await expectFailure(
    () =>
      transaction(first, finalizeSql, [
        scope.tenantId,
        scope.workspaceId,
        fixtureDates[0],
        randomBytes(32).toString("hex"),
        acquired.claim_token,
        acquired.evidence_sha256,
        acquired.fencing,
      ]),
    "claim token or fence is stale",);
  const complete = await finalize(first, fixtureDates[0]!, acquired);
  assertTerminal(complete, "COMPLETE", [], true, true);
  const staleToken = await insertExpiredClaim(auditor, fixtureDates[1]!);
  const partialClaim = await claim(first);
  assert(partialClaim.fencing === "2", "expired claim must advance fencing");
  await expectFailure(
    () =>
      transaction(first, finalizeSql, [
        scope.tenantId,
        scope.workspaceId,
        fixtureDates[1],
        partialClaim.authority_sha256,
        staleToken,
        partialClaim.evidence_sha256,
        1,
      ]),
    "claim token or fence is stale",);
  const providerTamper = await finalize(first, fixtureDates[1]!, partialClaim);
  assertTerminal(providerTamper, "PARTIAL", [
    "SOURCE_MULTISET_BINDING_UNAVAILABLE",
  ], true, true);
  for (const index of [2, 3]) {
    const binding = await claim(first);
    const tampered = await finalize(first, fixtureDates[index]!, binding);
    assertTerminal(tampered, "PARTIAL", [
      "SOURCE_MULTISET_BINDING_UNAVAILABLE",
    ], true, true);
  }
  const qualityClaim = await claim(first);
  const mixedPartial = await finalize(first, fixtureDates[4]!, qualityClaim);
  assertTerminal(mixedPartial, "PARTIAL", [
    "QUALITY_AUTHORIZATION_UNAVAILABLE",
  ], true, false);
  const unavailableClaim = await claim(first);
  const unavailable = await finalize(first, fixtureDates[5]!, unavailableClaim);
  assertTerminal(
    unavailable, "UNAVAILABLE", ["SOURCE_AUTHORITY_INVALID"], true, true);
  const emptyUnavailableClaim = await claim(first);
  const emptyUnavailable = await finalize(first, fixtureDates[6]!, emptyUnavailableClaim);
  assertTerminal(emptyUnavailable, "UNAVAILABLE", [
    "SOURCE_AUTHORITY_INVALID", "DURABLE_EXECUTION_ATTESTATION_UNAVAILABLE",
    "QUALITY_AUTHORIZATION_UNAVAILABLE", "EXACT_PROOF_UNAVAILABLE",
    "SOURCE_MULTISET_BINDING_UNAVAILABLE",
  ], false, false);
  await auditor.query("BEGIN");
  try {
    await auditor.query(
      `SELECT set_config('social_monitor.tenant_id', $1, true),
              set_config('social_monitor.workspace_id', $2, true)`,
      [scope.tenantId, scope.workspaceId],);
    await auditor.query(
      `SET LOCAL ROLE "social_monitor_reader_summary_publication_owner"`,);
    await expectFailure(
      () =>
        auditor.query(
          `UPDATE reader_summary_production_recovery_leases
           SET canonical_bytes = canonical_bytes || decode('00', 'hex')
           WHERE canonical_record->>'schemaVersion' =
             'reader_summary.daily_terminal_seal.v2'`,
        ),
      "immutable",);
  } finally {
    await auditor.query("ROLLBACK").catch(() => undefined);
  }
  const before = await auditor.query<{ readonly fingerprint: string }>(
    `SELECT md5(COALESCE(jsonb_agg(to_jsonb(lease) ORDER BY lease.id)::TEXT, ''))
       AS fingerprint
     FROM reader_summary_production_recovery_leases AS lease
     WHERE lease.tenant_id = $1 AND lease.workspace_id = $2`,
    [scope.tenantId, scope.workspaceId],);
  const replay = await finalize(first, fixtureDates[0]!, {
    authority_sha256: complete.authority_sha256,
    claim_token: acquired.claim_token,
    evidence_sha256: complete.evidence_sha256,
    fencing: acquired.fencing,
  }, true);
  assert(replay.outcome === "replayed", "READ ONLY replay must succeed");
  assertTerminal(replay, "COMPLETE", [], true, true);
  assert(
    (replay.terminal_bytes as Buffer).equals(complete.terminal_bytes as Buffer),
    "replay must return byte-identical terminal authority",);
  const after = await auditor.query<{ readonly fingerprint: string }>(
    `SELECT md5(COALESCE(jsonb_agg(to_jsonb(lease) ORDER BY lease.id)::TEXT, ''))
       AS fingerprint
     FROM reader_summary_production_recovery_leases AS lease
     WHERE lease.tenant_id = $1 AND lease.workspace_id = $2`,
    [scope.tenantId, scope.workspaceId],);
  assert(
    before.rows[0]?.fingerprint === after.rows[0]?.fingerprint,
    "READ ONLY replay must perform zero writes",);
};
const main = async (): Promise<void> => {
  assertDailyActivationMigrationContract();
  const serverAdminDatabaseUrl = requiredReaderSummaryPublicationAdminDatabaseUrl(process.env);
  const suffix = randomBytes(10).toString("hex");
  const databaseName = `reader_summary_daily_terminal_${suffix}`,
    migrationAdminRole = `social_monitor_daily_terminal_admin_${suffix}`,
    migrationAdminPassword = randomBytes(24).toString("base64url"),
    runtimeRole = `social_monitor_daily_terminal_runtime_${suffix}`,
    systemRuntimeRole = `social_monitor_daily_terminal_system_${suffix}`,
    runtimePassword = randomBytes(24).toString("base64url"),
    terminalPassword = randomBytes(24).toString("base64url");
  const targetDatabaseUrl = privileges.publicationDatabaseUrl(serverAdminDatabaseUrl, databaseName);
  const adminDatabaseUrl = privileges.publicationRuntimeDatabaseUrl(targetDatabaseUrl, migrationAdminRole, migrationAdminPassword);
  const runtimeDatabaseUrl = privileges.publicationRuntimeDatabaseUrl(adminDatabaseUrl, runtimeRole, runtimePassword);
  const terminalDatabaseUrl = privileges.publicationRuntimeDatabaseUrl(adminDatabaseUrl, terminalRole, terminalPassword);
  const serverAdmin = new Pool({ connectionString: serverAdminDatabaseUrl, max: 1 });
  const workspace = createReaderSummaryPublicationMigrationWorkspace();
  let ownerRolePreexisting = false, capabilityRolePreexisting = false, schemaOwnerRolePreexisting = false,
    tenantSystemCapabilityRolePreexisting = false, dailyActivationDefinerRolePreexisting = false, fixtureDatabaseCreated = false, fixtureMigrationAdminRoleCreated = false,
    fixtureRuntimeRoleCreated = false, fixtureSystemRuntimeRoleCreated = false, fixtureTerminalRoleCreated = false;
  try {
    const protectedRoles = await privileges.publicationProtectedRolePresence(serverAdmin);
    ownerRolePreexisting = protectedRoles.owner; capabilityRolePreexisting = protectedRoles.capability; schemaOwnerRolePreexisting = protectedRoles.schemaOwner;
    tenantSystemCapabilityRolePreexisting = protectedRoles.tenantSystemCapability; dailyActivationDefinerRolePreexisting = protectedRoles.dailyActivationDefiner;
    await serverAdmin.query(`CREATE ROLE ${privileges.quotePostgresIdentifier(migrationAdminRole)}
      LOGIN PASSWORD ${privileges.quotePostgresLiteral(migrationAdminPassword)}
      NOSUPERUSER NOCREATEDB CREATEROLE INHERIT NOREPLICATION NOBYPASSRLS`);
    fixtureMigrationAdminRoleCreated = true;
    await serverAdmin.query(`CREATE DATABASE ${privileges.quotePostgresIdentifier(databaseName)}
      OWNER ${privileges.quotePostgresIdentifier(migrationAdminRole)}`);
    fixtureDatabaseCreated = true;
    await privileges.createPublicationFixtureRuntimeRole({ databaseName, migrationAdminRole, runtimePassword, runtimeRole, serverAdminDatabaseUrl });
    fixtureRuntimeRoleCreated = true;
    const existingTerminal = await serverAdmin.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [terminalRole]);
    fixtureTerminalRoleCreated = existingTerminal.rows.length === 0;
    const bootstrapAdmin = new Pool({ connectionString: adminDatabaseUrl, max: 1 });
    try { await privileges.provisionPublicationFixtureProtectedRoles({ serverAdmin, migrationAdmin: bootstrapAdmin, migrationAdminRole });
      await applySystemDsnBootstrapHelper(bootstrapAdmin, join(workspace.directory, "system-dsn-bootstrap-create.sql"), runtimeRole, systemRuntimeRole, terminalPassword);
      fixtureSystemRuntimeRoleCreated = true;
      await bootstrapAdmin.query(`ALTER ROLE ${privileges.quotePostgresIdentifier(terminalRole)} NOLOGIN CREATEROLE INHERIT`);
      await applySystemDsnBootstrapHelper(bootstrapAdmin, join(workspace.directory, "system-dsn-bootstrap-repair.sql"), runtimeRole, systemRuntimeRole, terminalPassword);
      for (const attribute of ["SUPERUSER", "CREATEDB", "REPLICATION", "BYPASSRLS"]) {
        await serverAdmin.query(`ALTER ROLE ${privileges.quotePostgresIdentifier(terminalRole)} ${attribute}`);
        await expectFailure(() => applySystemDsnBootstrapHelper(bootstrapAdmin, join(workspace.directory, `system-dsn-bootstrap-reject-${attribute}.sql`), runtimeRole, systemRuntimeRole, terminalPassword), "requires privileged attribute repair");
        await bootstrapAdmin.query("ROLLBACK");
        await serverAdmin.query(`ALTER ROLE ${privileges.quotePostgresIdentifier(terminalRole)} NO${attribute}`);
      }
    } finally {
      await bootstrapAdmin.end();
    }
    await privileges.makePublicationFixtureRuntimeDatabaseOwner({
      databaseName, migrationAdminDatabaseUrl: adminDatabaseUrl,
      migrationAdminRole, runtimeRole, systemRuntimeRole, targetDatabaseUrl,
    });
    preparePrePublicationMigrations(workspace);
    await privileges.grantLegacyMigrationOwnership(adminDatabaseUrl, runtimeRole);
    applyOrderedReaderSummaryMigrations(runtimeDatabaseUrl, workspace);
    await privileges.runReaderSummaryPublicationBootstrapSql("pre", adminDatabaseUrl, runtimeRole, systemRuntimeRole);
    installPublicationMigrationsBeforeDailyActivation(workspace);
    for (const migration of [dailyTerminalMigration, terminalCapabilityMigration]) rmSync(join(workspace.directory, "migrations", migration), { recursive: true });
    applyOrderedReaderSummaryMigrations(adminDatabaseUrl, workspace);
    for (const migration of [dailyTerminalMigration, terminalCapabilityMigration]) cpSync(join("prisma/migrations", migration), join(workspace.directory, "migrations", migration), { recursive: true });
    applyOrderedReaderSummaryMigrations(adminDatabaseUrl, workspace); const activationAdmin = new Pool({ connectionString: adminDatabaseUrl, max: 1 });
    try { await activationAdmin.query(`SET ROLE social_monitor_public_schema_owner; REVOKE CREATE ON SCHEMA public FROM social_monitor_reader_summary_publication_owner; RESET ROLE`);
      installDailyActivationMigration(workspace, readerSummaryDailyActivationMigration); applyOrderedReaderSummaryMigrations(adminDatabaseUrl, workspace);
      await assertDailyActivationIntermediateIsFailClosed(activationAdmin); installFailingDailyActivationAclMigration(workspace);
      const failed = runOrderedReaderSummaryMigrations(adminDatabaseUrl, workspace); const expectedChecksum = digest(readFileSync(join(workspace.directory, "migrations", readerSummaryDailyActivationAclMigration, "migration.sql"))); const failedMigration = await activationAdmin.query<{ readonly checksum: string; readonly logs: string | null }>(`SELECT checksum, logs FROM public."_prisma_migrations" WHERE migration_name = $1 AND finished_at IS NULL AND rolled_back_at IS NULL`, [readerSummaryDailyActivationAclMigration]); const failedRow = failedMigration.rows[0];
      assert(failed.status !== 0 && failedMigration.rows.length === 1 && failedRow?.checksum === expectedChecksum && typeof failedRow?.logs === "string" && failedRow.logs.length > 0, `fixture ACL migration must retain one unfinished row with exact checksum and nonempty logs (status=${failed.status}; fixtureFailureSeen=${`${failed.stdout}${failed.stderr}`.includes("fixture daily activation ACL failure")}; rows=${failedMigration.rows.length}; checksumMatches=${failedRow?.checksum === expectedChecksum}; logsLength=${failedRow?.logs?.length ?? 0})`);
      const blocked = runOrderedReaderSummaryMigrations(adminDatabaseUrl, workspace); assert(blocked.status !== 0 && `${blocked.stdout}${blocked.stderr}`.includes("P3009"), "unfinished ACL migration must block Prisma with P3009");
      resolveRolledBackReaderSummaryMigration(adminDatabaseUrl, workspace, readerSummaryDailyActivationAclMigration);
      removeInstalledReaderSummaryMigration(workspace, readerSummaryDailyActivationAclMigration); installDailyActivationMigration(workspace, readerSummaryDailyActivationAclMigration); applyOrderedReaderSummaryMigrations(adminDatabaseUrl, workspace);
    } finally { await activationAdmin.end(); }
    await privileges.runReaderSummaryPublicationBootstrapSql("post", adminDatabaseUrl, runtimeRole, systemRuntimeRole); installPublicationAndFollowingMigrations(workspace); applyOrderedReaderSummaryMigrations(adminDatabaseUrl, workspace);
    for (let replay = 0; replay < 2; replay += 1) { await privileges.runReaderSummaryPublicationBootstrapSql("pre", adminDatabaseUrl, runtimeRole, systemRuntimeRole); await privileges.runReaderSummaryPublicationBootstrapSql("post", adminDatabaseUrl, runtimeRole, systemRuntimeRole); }
    assertReaderSummaryMigrationDatabaseMatchesSchema(targetDatabaseUrl);
    const auditorPool = new Pool({ connectionString: targetDatabaseUrl, max: 1 }); const runtimePool = new Pool({ connectionString: runtimeDatabaseUrl, max: 1 });
    const terminalPool = new Pool({ connectionString: terminalDatabaseUrl, max: 2 });
    try {
      const auditor = await auditorPool.connect();
      const application = await runtimePool.connect();
      const first = await terminalPool.connect();
      const second = await terminalPool.connect();
      try {
        await provisionReaderSummaryPublicationFixtureScope(auditor, scope);
        await Promise.all([
          setReaderSummaryPublicationSessionScope(application, scope),
          setReaderSummaryPublicationSessionScope(first, scope),
          setReaderSummaryPublicationSessionScope(second, scope),
        ]);
        await assertOrdinaryRuntime(application);
        await assertAuthority(auditor, first, second, migrationAdminRole,
          [runtimeRole, systemRuntimeRole]);
      } finally {
        auditor.release(); application.release(); first.release(); second.release();
      }
    } finally {
      await runtimePool.end(); await terminalPool.end(); await auditorPool.end();
    }
  } finally {
    removeReaderSummaryPublicationMigrationWorkspace(workspace);
    await privileges.dropPublicationFixtureDatabaseAndRoles({
      serverAdmin, databaseName, migrationAdminRole, runtimeRole,
      ownerRolePreexisting, capabilityRolePreexisting,
      schemaOwnerRolePreexisting, tenantSystemCapabilityRolePreexisting, dailyActivationDefinerRolePreexisting,
      fixtureDatabaseCreated, fixtureMigrationAdminRoleCreated,
      fixtureRuntimeRoleCreated,
      fixtureDailyTerminalRoleCreated: fixtureTerminalRoleCreated,
      systemRuntimeRole,
      systemRuntimeRoleCreated: fixtureSystemRuntimeRoleCreated,
    });
    await serverAdmin.end();
  }
  console.log("Reader summary daily terminal PostgreSQL authority gate OK");
};
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
