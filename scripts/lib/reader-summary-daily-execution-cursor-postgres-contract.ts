import { createHash } from "node:crypto";

export type ReaderSummaryDailyPostgresClient = Readonly<{
  query<TRow extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    values?: readonly unknown[],
  ): Promise<Readonly<{ rows: readonly TRow[]; rowCount: number | null }>>;
}>;

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
}): Promise<void> => {
  const identity = await params.first.query<{ current_user: string }>("SELECT current_user");
  assert(identity.rows[0]?.current_user === params.terminalRole,
    "daily contract first client is not the dedicated terminal role");
  const privileges = await params.first.query<{
    table_access: boolean; claim_access: boolean; telemetry_complete_access: boolean;
  }>(`SELECT
      has_table_privilege(current_user,
        'reader_summary_daily_model_jobs', 'SELECT') AS table_access,
      has_function_privilege(current_user,
        'claim_reader_summary_daily_execution(uuid,uuid,text,date,timestamptz)',
        'EXECUTE') AS claim_access,
      has_function_privilege(current_user,
        'complete_reader_summary_daily_model_job_v2(uuid,uuid,date,text,bigint,timestamptz,bytea,character,jsonb,bytea,character,bytea,character,bigint,bigint,text,bigint)',
        'EXECUTE') AS telemetry_complete_access`);
  assert(privileges.rows[0]?.table_access === false &&
    privileges.rows[0]?.claim_access === true &&
    privileges.rows[0]?.telemetry_complete_access === true,
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
  const responseBytes = Buffer.from('{"daily":"complete"}', "utf8");
  const responseSha = hash(responseBytes);
  const attestation = {
    schemaVersion: 1, requestId: "pg18-daily-1",
    purpose: "social_monitor.reader_summary.generate",
    canonicalRequestSha256: "a".repeat(64), provider: "codex",
    model: "gpt-5.6-sol", reasoningEffort: "xhigh",
    runtimeEngine: "subscription-runtime-cli", runtimePackageVersion: "1.2.3",
    launcherSha256: "b".repeat(64), selectedOutputKind: "structured_output",
    selectedOutputSha256: responseSha,
  };
  const attestationBytes = Buffer.from(JSON.stringify(attestation), "utf8");
  const jobIdentity = hash(Buffer.from([
    "reader-summary-daily:v1", scope.tenantId, scope.workspaceId, firstDate,
    sealedSha, "codex", "gpt-5.6-sol", "xhigh",
  ].join("|"), "utf8"));
  const receiptBytes = Buffer.from(JSON.stringify({
    schemaVersion: 2,
    modelJobIdentity: jobIdentity,
    responseSha256: responseSha,
    attestationSha256: hash(attestationBytes),
    attestation,
    executionUsage: {
      inputTokens: 120,
      outputTokens: 30,
      usageSource: "PROVIDER_REPORTED",
      durationMs: 250,
    },
  }), "utf8");
  const completionSql = `SELECT complete_reader_summary_daily_model_job_v2(
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`;
  const completionValues = [
    scope.tenantId, scope.workspaceId, firstDate, owner, fence,
    new Date().toISOString(), responseBytes, responseSha,
    attestation, attestationBytes, hash(attestationBytes), receiptBytes, hash(receiptBytes),
    120, 30, "PROVIDER_REPORTED", 250,
  ] as const;
  await serializable(params.first, completionSql, completionValues);
  await serializable(params.first, completionSql, completionValues);
  await expectRejected(
    serializable(params.first, completionSql, [
      ...completionValues.slice(0, 16), 251,
    ]),
    "divergent terminal telemetry replay must conflict",
  );
  const completed = await params.admin.query<{
    state: string; response_bytes: Buffer; receipt_bytes: Buffer;
    next_unresolved_utc_date: string; input_tokens: string;
    output_tokens: string; usage_source: string; duration_ms: string;
  }>(`SELECT job.state, job.response_bytes, job.receipt_bytes,
        cursor.next_unresolved_utc_date::text,
        job.input_tokens::text, job.output_tokens::text,
        job.usage_source, job.duration_ms::text
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
    completed.rows[0]?.usage_source === "PROVIDER_REPORTED" &&
    completed.rows[0]?.duration_ms === "250",
    "COMPLETED receipt must persist without cursor advancement");

  const canonical = await seedCanonicalPublication(params.admin, scope, firstDate);
  const finalizationSql = `SELECT finalize_reader_summary_daily_publication(
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`;
  const finalizationValues = [
    scope.tenantId, scope.workspaceId, firstDate, owner, fence,
    new Date().toISOString(), canonical.jobId, canonical.artifactId,
    canonical.artifactId, canonical.reportSha, canonical.proofSha,
    canonical.weeklySha, canonical.evidenceBytes, hash(canonical.evidenceBytes),
    canonical.frontendBytes, hash(canonical.frontendBytes),
  ] as const;
  await serializable(params.first, finalizationSql, finalizationValues);
  await serializable(params.first, finalizationSql, finalizationValues);
  const finalized = await params.admin.query<{
    next_unresolved_utc_date: string; publication_id: string;
    reader_summary_job_id: string; reader_summary_artifact_id: string;
    input_tokens: string; output_tokens: string; duration_ms: string;
  }>(`SELECT cursor.next_unresolved_utc_date::text,
        job.publication_id::text, job.reader_summary_job_id::text,
        job.reader_summary_artifact_id::text, job.input_tokens::text,
        job.output_tokens::text, job.duration_ms::text
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
) => {
  await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  try {
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
  admin: ReaderSummaryDailyPostgresClient,
  scope: { tenantId: string; workspaceId: string },
  date: string,
) => {
  const jobId = "50000000-0000-4000-8000-000000000005";
  const artifactId = "60000000-0000-4000-8000-000000000006";
  const reportSha = "c".repeat(64);
  const proofSha = "d".repeat(64);
  const weeklyBytes = Buffer.from(JSON.stringify({ schemaVersion: 1, requestedUtcDate: date }));
  const weeklySha = hash(weeklyBytes);
  await admin.query(`INSERT INTO reader_summary_artifacts
    (id, tenant_id, workspace_id, status) VALUES ($1,$2,$3,'COMPLETED')`,
    [artifactId, scope.tenantId, scope.workspaceId]);
  await admin.query(`INSERT INTO reader_summary_jobs
    (id, tenant_id, workspace_id, status, reader_summary_artifact_id)
    VALUES ($1,$2,$3,'COMPLETED',$4)`,
    [jobId, scope.tenantId, scope.workspaceId, artifactId]);
  await admin.query(`INSERT INTO reader_summary_publications
    (id, tenant_id, workspace_id, requested_utc_date, cadence,
     semantic_status, reader_summary_job_id, reader_summary_artifact_id,
     report_sha256, proof_sha256)
    VALUES ($1,$2,$3,$4,'daily','COMPLETED',$5,$1,$6,$7)`,
    [artifactId, scope.tenantId, scope.workspaceId, date, jobId,
      reportSha, proofSha]);
  await admin.query(`INSERT INTO reader_summary_weekly_publication_evidence
    (publication_id, reader_summary_job_id, reader_summary_artifact_id,
     canonical_bytes, canonical_sha256)
    VALUES ($1,$2,$1,$3,$4)`,
    [artifactId, jobId, weeklyBytes, weeklySha]);
  const evidenceBytes = Buffer.from(JSON.stringify({
    scope: { tenantId: scope.tenantId, workspaceId: scope.workspaceId },
    result: { readerSummaryJobId: jobId, readerSummaryId: artifactId },
  }));
  const frontendBytes = Buffer.from(JSON.stringify({
    tenantId: scope.tenantId, workspaceId: scope.workspaceId,
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
const requiredBuffer = (value: Buffer | undefined): Buffer => {
  assert(Buffer.isBuffer(value), "PostgreSQL contract expected bytea bytes");
  return value;
};
const retryable = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === "40001";
const assert: (condition: unknown, message: string) => asserts condition = (
  condition,
  message,
) => {
  if (!condition) throw new Error(message);
};
