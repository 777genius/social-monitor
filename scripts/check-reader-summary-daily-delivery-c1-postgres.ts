import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

import { Pool, type PoolClient } from "pg";

const tenantId = "00000000-0000-7000-8000-000000000901";
const workspaceId = "00000000-0000-7000-8000-000000000902";
const dates = [
  "2026-07-25",
  "2026-07-26",
  "2026-07-27",
  "2026-07-28",
  "2026-07-29",
  "2026-07-30",
] as const;
const c0Dates = ["2026-07-24", ...dates] as const;
const ownerRole = "social_monitor_reader_summary_publication_owner";
const schemaOwnerRole = "social_monitor_public_schema_owner";
const capabilityRole = "social_monitor_tenant_system_runtime";
const systemLogin = "social_monitor_system_app";
const terminalRole = "social_monitor_reader_summary_daily_terminal";
const protectedRoles = [
  ownerRole,
  schemaOwnerRole,
  capabilityRole,
  "social_monitor_reader_summary_publication_runtime",
] as const;
const suffix = randomBytes(8).toString("hex");
const databaseName = `reader_summary_daily_delivery_c1_${suffix}`;
const wrongCapableLogin = `sm_c1_wrong_capable_${suffix}`;
const wrongUncapableLogin = `sm_c1_wrong_uncapable_${suffix}`;
const serverUrl = requiredAdminUrl(process.env);
const targetUrl = databaseUrl(serverUrl, databaseName);
const migration = readFileSync(
  "prisma/migrations/20260811170000_reader_summary_daily_delivery_c1_retry_evidence/migration.sql",
  "utf8",
);
const ordinaryCursorMigration = readFileSync(
  "prisma/migrations/20260802100000_reader_summary_daily_execution_cursor/migration.sql",
  "utf8",
);
const boundedClaimMigration = readFileSync(
  "prisma/migrations/20260804130400_reader_summary_daily_bounded_maintenance_claim/migration.sql",
  "utf8",
);
const server = new Pool({ connectionString: serverUrl, min: 0, max: 1 });
const createdRoles: string[] = [];
let databaseCreated = false;
let systemMembershipCreated = false;

type EvidenceRow = Readonly<{
  requestedUtcDate: string;
  attemptOrdinal: number;
  receiptSha256: string;
  readerSummaryJobId: string;
  readerSummaryArtifactId: string;
  publicationId: string;
  publicationReportSha256: string;
  publicationProofSha256: string;
  weeklyEvidenceSha256: string;
  publicEvidenceSha256: string;
  publicFrontendSha256: string;
}>;

const main = async (): Promise<void> => {
  assert(
    ordinaryCursorMigration.includes(
      `v_eligible - v_cursor."next_unresolved_utc_date" + 1 > 7`,
    ) &&
      !migration.includes(
        'CREATE OR REPLACE FUNCTION public."claim_reader_summary_daily_execution"',
      ),
    "C1 migration weakened the ordinary seven-day recovery guard",
  );
  const version = await server.query<{ version: number }>(
    "SELECT current_setting('server_version_num')::integer AS version",
  );
  assert(
    (version.rows[0]?.version ?? 0) >= 180_000,
    "daily delivery C1 contract requires disposable PostgreSQL 18+",
  );
  for (const role of protectedRoles) await ensureRole(role, false);
  await ensureRole(systemLogin, true);
  await ensureRole(terminalRole, true);
  await ensureRole(wrongCapableLogin, true);
  await ensureRole(wrongUncapableLogin, true);
  systemMembershipCreated = await ensureMembership(capabilityRole, systemLogin);
  await ensureMembership(capabilityRole, wrongCapableLogin);
  await server.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
  databaseCreated = true;

  const adminPool = new Pool({ connectionString: targetUrl, min: 0, max: 1 });
  try {
    await adminPool.query(
      `ALTER SCHEMA public OWNER TO ${quoteIdentifier(schemaOwnerRole)}`,
    );
    await adminPool.query(`SET ROLE ${quoteIdentifier(schemaOwnerRole)};
      GRANT USAGE, CREATE ON SCHEMA public TO ${quoteIdentifier(ownerRole)};
      CREATE TABLE public."reader_summary_daily_execution_cursors" (
        tenant_id UUID NOT NULL,
        workspace_id UUID NOT NULL,
        next_unresolved_utc_date DATE NOT NULL,
        active_requested_utc_date DATE,
        lease_owner TEXT,
        fencing_token BIGINT NOT NULL DEFAULT 0,
        leased_at TIMESTAMPTZ,
        lease_expires_at TIMESTAMPTZ,
        absolute_expires_at TIMESTAMPTZ,
        recovery_required_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT reader_summary_daily_execution_cursors_pkey
          PRIMARY KEY (tenant_id, workspace_id)
      );
      CREATE TABLE public."reader_summary_daily_source_authorities" (
        tenant_id UUID NOT NULL, workspace_id UUID NOT NULL,
        requested_utc_date DATE NOT NULL, ingestion_cutoff TIMESTAMPTZ NOT NULL,
        canonical_record JSONB NOT NULL, canonical_bytes BYTEA NOT NULL,
        canonical_sha256 CHAR(64) NOT NULL, created_at TIMESTAMPTZ NOT NULL,
        CONSTRAINT reader_summary_daily_source_authorities_pkey
          PRIMARY KEY (tenant_id, workspace_id, requested_utc_date)
      );
      CREATE TABLE public."reader_summary_daily_model_jobs" (
        tenant_id UUID NOT NULL, workspace_id UUID NOT NULL,
        requested_utc_date DATE NOT NULL, identity TEXT NOT NULL,
        source_authority_sha256 CHAR(64) NOT NULL, provider TEXT NOT NULL,
        model TEXT NOT NULL, reasoning_effort TEXT NOT NULL,
        runtime_engine TEXT NOT NULL, state TEXT NOT NULL,
        reserved_at TIMESTAMPTZ NOT NULL, running_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ, failed_ambiguous_at TIMESTAMPTZ,
        response_bytes BYTEA, response_sha256 CHAR(64), attestation JSONB,
        attestation_bytes BYTEA, attestation_sha256 CHAR(64),
        receipt_bytes BYTEA, receipt_sha256 CHAR(64),
        CONSTRAINT reader_summary_daily_model_jobs_pkey
          PRIMARY KEY (tenant_id, workspace_id, requested_utc_date)
      );
      CREATE TABLE public."source_items" (
        id UUID PRIMARY KEY, content_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE public."feed_items" (
        id UUID PRIMARY KEY, tenant_id UUID NOT NULL, workspace_id UUID NOT NULL,
        source_item_id UUID NOT NULL, provider_key TEXT NOT NULL,
        canonical_url TEXT NOT NULL, title TEXT NOT NULL,
        body_preview TEXT NOT NULL, author_handle TEXT,
        published_at TIMESTAMPTZ NOT NULL, observed_at TIMESTAMPTZ NOT NULL,
        status TEXT NOT NULL
      );
      RESET ROLE;
      SET ROLE ${quoteIdentifier(ownerRole)};
      CREATE TABLE public."reader_summary_artifacts" (
        id UUID PRIMARY KEY, status TEXT NOT NULL
      );
      CREATE TABLE public."reader_summary_jobs" (
        id UUID PRIMARY KEY, status TEXT NOT NULL
      );
      CREATE TABLE public."reader_summary_publications" (
        id UUID PRIMARY KEY, tenant_id UUID NOT NULL, workspace_id UUID NOT NULL,
        requested_utc_date DATE NOT NULL, cadence TEXT NOT NULL,
        semantic_status TEXT NOT NULL, reader_summary_job_id UUID NOT NULL,
        reader_summary_artifact_id UUID NOT NULL,
        report_sha256 CHAR(64) NOT NULL, proof_sha256 CHAR(64) NOT NULL
      );
      CREATE TABLE public."reader_summary_publication_slots" (
        id UUID PRIMARY KEY, current_publication_id UUID NOT NULL
      );
      CREATE TABLE public."reader_summary_weekly_publication_evidence" (
        publication_id UUID PRIMARY KEY, canonical_sha256 CHAR(64) NOT NULL
      );
      CREATE TABLE public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" (
        tenant_id UUID NOT NULL,
        workspace_id UUID NOT NULL,
        requested_utc_date DATE NOT NULL,
        attempt_ordinal SMALLINT NOT NULL,
        state TEXT NOT NULL,
        receipt_bytes BYTEA,
        receipt_sha256 CHAR(64),
        reader_summary_job_id UUID,
        reader_summary_artifact_id UUID,
        publication_id UUID,
        publication_report_sha256 CHAR(64),
        publication_proof_sha256 CHAR(64),
        weekly_evidence_sha256 CHAR(64),
        public_evidence_sha256 CHAR(64),
        public_frontend_sha256 CHAR(64),
        PRIMARY KEY (tenant_id, workspace_id, requested_utc_date)
      );
      RESET ROLE;
      ALTER TABLE public."reader_summary_daily_model_jobs"
        ADD COLUMN reader_summary_job_id UUID,
        ADD COLUMN public_evidence_sha256 CHAR(64),
        ADD COLUMN public_frontend_sha256 CHAR(64);
      ALTER TABLE public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries"
        ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries"
        FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation
        ON public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries"
        USING (
          current_user = '${ownerRole}' OR (
            tenant_id = NULLIF(current_setting('social_monitor.tenant_id', TRUE), '')::UUID
            AND workspace_id = NULLIF(current_setting('social_monitor.workspace_id', TRUE), '')::UUID
          )
        );
      CREATE FUNCTION public."assert_reader_summary_daily_canonical_recovery_v4_binding"()
      RETURNS BOOLEAN LANGUAGE SQL VOLATILE SECURITY DEFINER
      SET search_path=pg_catalog AS 'SELECT TRUE';
      CREATE FUNCTION public."reader_summary_daily_canonical_recovery_v4_terminals_from_projection"(
        target_tenant_id UUID, target_workspace_id UUID
      ) RETURNS TABLE (
        outcome TEXT, requested_utc_date DATE, reason_code TEXT,
        signal_count INTEGER, source_authority_sha256 TEXT,
        model_job_identity TEXT, attempt_ordinal SMALLINT,
        reader_summary_job_id UUID, reader_summary_artifact_id UUID,
        publication_id UUID, report_sha256 TEXT, proof_sha256 TEXT,
        weekly_evidence_sha256 TEXT, public_evidence_sha256 TEXT,
        public_frontend_sha256 TEXT
      ) LANGUAGE SQL VOLATILE STRICT SECURITY DEFINER
      SET search_path=pg_catalog AS $fixture$
        SELECT 'UNAVAILABLE'::TEXT, DATE '2026-07-23',
          'LEGACY_GAP'::TEXT, 0::INTEGER, NULL::TEXT, NULL::TEXT,
          NULL::SMALLINT, NULL::UUID, NULL::UUID, NULL::UUID,
          NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT
        UNION ALL
        SELECT 'FINALIZED'::TEXT, publication.requested_utc_date,
          NULL::TEXT, NULL::INTEGER, repeat('f',64), repeat('0',64),
          NULL::SMALLINT, publication.reader_summary_job_id,
          publication.reader_summary_artifact_id, publication.id,
          btrim(publication.report_sha256), btrim(publication.proof_sha256),
          btrim(evidence.canonical_sha256), btrim(model_job.public_evidence_sha256),
          btrim(model_job.public_frontend_sha256)
        FROM public."reader_summary_publications" AS publication
        JOIN public."reader_summary_weekly_publication_evidence" AS evidence
          ON evidence.publication_id=publication.id
        JOIN public."reader_summary_jobs" AS job
          ON job.id=publication.reader_summary_job_id
        JOIN public."reader_summary_daily_model_jobs" AS model_job
          ON model_job.tenant_id=publication.tenant_id
          AND model_job.workspace_id=publication.workspace_id
          AND model_job.requested_utc_date=publication.requested_utc_date
          AND model_job.reader_summary_job_id=publication.reader_summary_job_id
        WHERE publication.tenant_id=target_tenant_id
          AND publication.workspace_id=target_workspace_id
      $fixture$;
      RESET ROLE;
      SET ROLE ${quoteIdentifier(schemaOwnerRole)};
      REVOKE CREATE ON SCHEMA public FROM ${quoteIdentifier(ownerRole)};
      RESET ROLE`);
    await insertC0Evidence(adminPool);
    await adminPool.query(boundedClaimMigration);
    await adminPool.query(migration);
    await assertCatalog(adminPool);

    const rows = await readEvidence(
      systemLogin,
      {
        tenantId,
        workspaceId,
        systemAccess: "false",
      },
      tenantId,
      workspaceId,
    );
    assert(
      rows.length === dates.length,
      "C1 boundary did not return exactly six rows",
    );
    assert(
      rows.every(
        (row, index) =>
          row.requestedUtcDate === dates[index] &&
          row.attemptOrdinal === 2 &&
          row.receiptSha256 === receiptSha(dates[index]!) &&
          row.readerSummaryJobId === fixtureId("1", dates[index]!) &&
          row.readerSummaryArtifactId === fixtureId("2", dates[index]!) &&
          row.publicationId === fixtureId("3", dates[index]!) &&
          row.publicationReportSha256 === "a".repeat(64) &&
          row.publicationProofSha256 === "b".repeat(64) &&
          row.weeklyEvidenceSha256 === "c".repeat(64) &&
          row.publicEvidenceSha256 === "d".repeat(64) &&
          row.publicFrontendSha256 === "e".repeat(64),
      ),
      "C1 boundary returned divergent receipt/publication bindings",
    );

    await expectRejected(
      () => readEvidence(wrongCapableLogin, exactGucs(), tenantId, workspaceId),
      "wrong login with capability",
    );
    await expectRejected(
      () =>
        readEvidence(wrongUncapableLogin, exactGucs(), tenantId, workspaceId),
      "wrong login without capability",
    );
    await expectRejected(
      () => readEvidence(systemLogin, {}, tenantId, workspaceId),
      "missing tenant GUCs",
    );
    await expectRejected(
      () =>
        readEvidence(
          systemLogin,
          {
            tenantId: "00000000-0000-7000-8000-000000000999",
            workspaceId,
            systemAccess: "false",
          },
          tenantId,
          workspaceId,
        ),
      "wrong tenant GUC",
    );
    await expectRejected(
      () =>
        readEvidence(
          systemLogin,
          {
            tenantId,
            workspaceId: "00000000-0000-7000-8000-000000000999",
            systemAccess: "false",
          },
          tenantId,
          workspaceId,
        ),
      "wrong workspace GUC",
    );
    await expectRejected(
      () =>
        readEvidence(
          systemLogin,
          {
            tenantId,
            workspaceId,
            systemAccess: "true",
          },
          tenantId,
          workspaceId,
        ),
      "system-access bypass GUC",
    );
    await expectRejected(
      () =>
        readEvidence(
          systemLogin,
          exactGucs(),
          "00000000-0000-7000-8000-000000000999",
          workspaceId,
        ),
      "wrong target scope",
    );
    await expectRejected(
      () =>
        readEvidence(
          systemLogin,
          exactGucs(),
          tenantId,
          "00000000-0000-7000-8000-000000000999",
        ),
      "wrong target workspace",
    );

    const advanced = await advanceCursor(
      terminalRole,
      cursorGucs(),
      tenantId,
      workspaceId,
    );
    assert(
      advanced === "2026-07-23",
      "absent C1 cursor did not initialize at Jul23",
    );
    const firstClaim = await claimLegacy(
      terminalRole,
      cursorGucs(),
      "2026-07-23",
    );
    assert(
      firstClaim.outcome === "CLAIMED" &&
        firstClaim.requestedUtcDate === "2026-07-23",
      "absent C1 path did not claim Jul23",
    );
    const persisted = await adminPool.query<{ next: string }>(
      `SELECT
      next_unresolved_utc_date::TEXT AS next
      FROM public."reader_summary_daily_execution_cursors"
      WHERE tenant_id=$1::UUID AND workspace_id=$2::UUID`,
      [tenantId, workspaceId],
    );
    assert(
      persisted.rows[0]?.next === "2026-07-23",
      "C1 Jul23 claim did not preserve the fenced cursor",
    );
    await adminPool.query(
      `UPDATE public."reader_summary_daily_execution_cursors"
       SET next_unresolved_utc_date=DATE '2026-07-24',
         active_requested_utc_date=NULL, lease_owner=NULL, leased_at=NULL,
         lease_expires_at=NULL, absolute_expires_at=NULL
       WHERE tenant_id=$1::UUID AND workspace_id=$2::UUID`,
      [tenantId, workspaceId],
    );
    assert(
      (await advanceCursor(
        terminalRole,
        cursorGucs(),
        tenantId,
        workspaceId,
      )) === "2026-07-31",
      "C1 did not adopt exact Jul24 and Jul25-Jul30 evidence at Jul24 cursor",
    );
    await adminPool.query(
      `UPDATE public."reader_summary_daily_execution_cursors"
       SET next_unresolved_utc_date=(statement_timestamp() AT TIME ZONE 'UTC')::DATE,
         active_requested_utc_date=NULL, lease_owner=NULL, leased_at=NULL,
         lease_expires_at=NULL, absolute_expires_at=NULL
       WHERE tenant_id=$1::UUID AND workspace_id=$2::UUID`,
      [tenantId, workspaceId],
    );
    const caughtUpCursor = await advanceCursor(
      terminalRole,
      cursorGucs(),
      tenantId,
      workspaceId,
    );
    const caughtUpState = await adminPool.query<{ caughtUp: boolean }>(
      `SELECT next_unresolved_utc_date >
          (statement_timestamp() AT TIME ZONE 'UTC')::DATE - 1 AS "caughtUp"
       FROM public."reader_summary_daily_execution_cursors"
       WHERE tenant_id=$1::UUID AND workspace_id=$2::UUID`,
      [tenantId, workspaceId],
    );
    assert(
      caughtUpCursor >= "2026-07-31" &&
        caughtUpState.rows[0]?.caughtUp === true,
      "C1 successor cursor did not prove the database CAUGHT_UP relation",
    );
    await adminPool.query(
      `DELETE FROM public."reader_summary_daily_execution_cursors"`,
    );
    await expectRejected(
      () => advanceCursor(systemLogin, cursorGucs(), tenantId, workspaceId),
      "wrong cursor login",
    );
    await expectRejected(
      () =>
        advanceCursor(
          terminalRole,
          { ...cursorGucs(), c1Mode: undefined },
          tenantId,
          workspaceId,
        ),
      "missing C1 mode GUC",
    );
    await expectRejected(
      () =>
        advanceCursor(
          terminalRole,
          {
            ...cursorGucs(),
            workspaceId: "00000000-0000-7000-8000-000000000999",
          },
          tenantId,
          workspaceId,
        ),
      "wrong cursor workspace GUC",
    );
    await expectRejected(
      () =>
        advanceCursor(
          terminalRole,
          cursorGucs(),
          tenantId,
          "00000000-0000-7000-8000-000000000999",
        ),
      "wrong cursor target scope",
    );

    await adminPool.query(`UPDATE public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries"
      SET state='PUBLICATION_PENDING' WHERE requested_utc_date=DATE '2026-07-30'`);
    await expectRejected(
      () => readEvidence(systemLogin, exactGucs(), tenantId, workspaceId),
      "incomplete finalized set",
    );
    await adminPool.query(
      `INSERT INTO public."reader_summary_daily_execution_cursors" (
        tenant_id, workspace_id, next_unresolved_utc_date
      ) VALUES ($1::UUID,$2::UUID,DATE '2026-07-25')`,
      [tenantId, workspaceId],
    );
    await expectRejected(
      () => advanceCursor(terminalRole, cursorGucs(), tenantId, workspaceId),
      "incomplete C0 cursor adoption",
    );
    const unchanged = await adminPool.query<{ next: string }>(`SELECT
      next_unresolved_utc_date::TEXT AS next
      FROM public."reader_summary_daily_execution_cursors"`);
    assert(
      unchanged.rows[0]?.next === "2026-07-25",
      "failed C1 adoption changed the cursor",
    );
  } finally {
    await adminPool.end();
  }
  console.log("Reader summary daily delivery C1 PostgreSQL 18 gate OK");
};

const claimLegacy = async (
  role: string,
  gucs: ReturnType<typeof cursorGucs>,
  expectedUtcDate: string,
): Promise<Readonly<{ outcome: string; requestedUtcDate: string | null }>> => {
  const pool = new Pool({ connectionString: targetUrl, min: 0, max: 1 });
  const client = await pool.connect();
  try {
    await client.query(`SET SESSION AUTHORIZATION ${quoteIdentifier(role)}`);
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    await setGuc(client, "social_monitor.tenant_id", gucs.tenantId);
    await setGuc(client, "social_monitor.workspace_id", gucs.workspaceId);
    await setGuc(client, "social_monitor.system_access", gucs.systemAccess);
    await setGuc(client, "social_monitor.daily_delivery_c1_mode", gucs.c1Mode);
    const result = await client.query<{
      outcome: string;
      requestedUtcDate: string | null;
    }>(
      `SELECT outcome, requested_utc_date::TEXT AS "requestedUtcDate"
       FROM public."claim_reader_summary_daily_execution_c1_legacy"(
         $1::UUID,$2::UUID,'c1-contract', $3::DATE, statement_timestamp()
       )`,
      [tenantId, workspaceId, expectedUtcDate],
    );
    await client.query("COMMIT");
    assert(result.rows.length === 1, "C1 legacy claim returned no exact row");
    return result.rows[0]!;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

const insertC0Evidence = async (pool: Pool): Promise<void> => {
  for (const date of c0Dates) {
    await pool.query(
      `INSERT INTO public."reader_summary_artifacts" VALUES ($1::UUID,'COMPLETED')`,
      [fixtureId("2", date)],
    );
    await pool.query(
      `INSERT INTO public."reader_summary_jobs" VALUES ($1::UUID,'COMPLETED')`,
      [fixtureId("1", date)],
    );
    await pool.query(
      `INSERT INTO public."reader_summary_daily_model_jobs" (
        tenant_id, workspace_id, requested_utc_date, identity,
        source_authority_sha256, provider, model, reasoning_effort,
        runtime_engine, state, reserved_at, reader_summary_job_id,
        public_evidence_sha256, public_frontend_sha256
      ) VALUES ($1::UUID,$2::UUID,$3::DATE,$4,$5::CHAR(64),'codex','gpt-5.6-sol',
        'xhigh','subscription-runtime-cli','COMPLETED',statement_timestamp(),
        $6::UUID,$7::CHAR(64),$8::CHAR(64))`,
      [tenantId, workspaceId, date, `model-${date}`, "f".repeat(64),
        fixtureId("1", date), "d".repeat(64), "e".repeat(64)],
    );
    await pool.query(
      `INSERT INTO public."reader_summary_publications" VALUES (
        $1::UUID,$2::UUID,$3::UUID,$4::DATE,'daily','COMPLETED',
        $5::UUID,$6::UUID,$7::CHAR(64),$8::CHAR(64)
      )`,
      [
        fixtureId("3", date),
        tenantId,
        workspaceId,
        date,
        fixtureId("1", date),
        fixtureId("2", date),
        "a".repeat(64),
        "b".repeat(64),
      ],
    );
    await pool.query(
      `INSERT INTO public."reader_summary_publication_slots" VALUES (
        $1::UUID,$2::UUID
      )`,
      [fixtureId("4", date), fixtureId("3", date)],
    );
    await pool.query(
      `INSERT INTO public."reader_summary_weekly_publication_evidence" VALUES (
        $1::UUID,$2::CHAR(64)
      )`,
      [fixtureId("3", date), "c".repeat(64)],
    );
    if (!dates.includes(date as (typeof dates)[number])) continue;
    const receipt = Buffer.from(`c1-receipt:${date}`, "utf8");
    await pool.query(
      `INSERT INTO public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" (
      tenant_id, workspace_id, requested_utc_date, attempt_ordinal, state,
      receipt_bytes, receipt_sha256, reader_summary_job_id,
      reader_summary_artifact_id, publication_id, publication_report_sha256,
      publication_proof_sha256, weekly_evidence_sha256, public_evidence_sha256,
      public_frontend_sha256
    ) VALUES ($1::UUID,$2::UUID,$3::DATE,2,'FINALIZED',$4::BYTEA,$5::CHAR(64),
      $6::UUID,$7::UUID,$8::UUID,$9::CHAR(64),$10::CHAR(64),$11::CHAR(64),
      $12::CHAR(64),$13::CHAR(64))`,
      [
        tenantId,
        workspaceId,
        date,
        receipt,
        receiptSha(date),
        fixtureId("1", date),
        fixtureId("2", date),
        fixtureId("3", date),
        "a".repeat(64),
        "b".repeat(64),
        "c".repeat(64),
        "d".repeat(64),
        "e".repeat(64),
      ],
    );
  }
};

const readEvidence = async (
  role: string,
  gucs: Readonly<{
    tenantId?: string;
    workspaceId?: string;
    systemAccess?: string;
  }>,
  targetTenantId: string,
  targetWorkspaceId: string,
): Promise<readonly EvidenceRow[]> => {
  const pool = new Pool({ connectionString: targetUrl, min: 0, max: 1 });
  const client = await pool.connect();
  try {
    await client.query(`SET SESSION AUTHORIZATION ${quoteIdentifier(role)}`);
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY");
    await setGuc(client, "social_monitor.tenant_id", gucs.tenantId);
    await setGuc(client, "social_monitor.workspace_id", gucs.workspaceId);
    await setGuc(client, "social_monitor.system_access", gucs.systemAccess);
    const result = await client.query<EvidenceRow>(
      `SELECT
      requested_utc_date::TEXT AS "requestedUtcDate",
      attempt_ordinal AS "attemptOrdinal", receipt_sha256 AS "receiptSha256",
      reader_summary_job_id::TEXT AS "readerSummaryJobId",
      reader_summary_artifact_id::TEXT AS "readerSummaryArtifactId",
      publication_id::TEXT AS "publicationId",
      publication_report_sha256 AS "publicationReportSha256",
      publication_proof_sha256 AS "publicationProofSha256",
      weekly_evidence_sha256 AS "weeklyEvidenceSha256",
      public_evidence_sha256 AS "publicEvidenceSha256",
      public_frontend_sha256 AS "publicFrontendSha256"
    FROM public."read_reader_summary_daily_delivery_c1_retry_evidence"($1::UUID,$2::UUID)`,
      [targetTenantId, targetWorkspaceId],
    );
    await client.query("COMMIT");
    return result.rows;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

const advanceCursor = async (
  role: string,
  gucs: Readonly<{
    tenantId?: string;
    workspaceId?: string;
    systemAccess?: string;
    c1Mode?: string;
  }>,
  targetTenantId: string,
  targetWorkspaceId: string,
): Promise<string> => {
  const pool = new Pool({ connectionString: targetUrl, min: 0, max: 1 });
  const client = await pool.connect();
  try {
    await client.query(`SET SESSION AUTHORIZATION ${quoteIdentifier(role)}`);
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    await setGuc(client, "social_monitor.tenant_id", gucs.tenantId);
    await setGuc(client, "social_monitor.workspace_id", gucs.workspaceId);
    await setGuc(client, "social_monitor.system_access", gucs.systemAccess);
    await setGuc(client, "social_monitor.daily_delivery_c1_mode", gucs.c1Mode);
    const result = await client.query<{ next: string }>(
      `SELECT
      next_unresolved_utc_date::TEXT AS next
      FROM public."advance_reader_summary_daily_delivery_c1_cursor"(
        $1::UUID,$2::UUID,DATE '2026-07-23',statement_timestamp()
      )`,
      [targetTenantId, targetWorkspaceId],
    );
    await client.query("COMMIT");
    assert(
      result.rows.length === 1 && result.rows[0] !== undefined,
      "C1 cursor transition returned no exact row",
    );
    return result.rows[0].next;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

const assertCatalog = async (pool: Pool): Promise<void> => {
  const result = await pool.query<{ safe: boolean }>(`SELECT
    NOT has_table_privilege('${systemLogin}',
      'public.reader_summary_daily_canonical_recovery_v4_ambiguity_retries', 'SELECT')
    AND NOT has_table_privilege('${capabilityRole}',
      'public.reader_summary_daily_canonical_recovery_v4_ambiguity_retries', 'SELECT')
    AND has_function_privilege('${capabilityRole}',
      'public.read_reader_summary_daily_delivery_c1_retry_evidence(UUID,UUID)', 'EXECUTE')
    AND NOT has_function_privilege('public',
      'public.read_reader_summary_daily_delivery_c1_retry_evidence(UUID,UUID)', 'EXECUTE')
    AND owner.rolname = '${ownerRole}' AND NOT owner.rolcanlogin
    AND procedure.prosecdef AND procedure.proconfig = ARRAY['search_path=pg_catalog']::TEXT[]
    AS safe
    FROM pg_proc procedure
    JOIN pg_namespace namespace ON namespace.oid=procedure.pronamespace
    JOIN pg_roles owner ON owner.oid=procedure.proowner
    WHERE namespace.nspname='public'
      AND procedure.proname='read_reader_summary_daily_delivery_c1_retry_evidence'`);
  assert(
    result.rows[0]?.safe === true,
    "C1 evidence function owner, ACL, search_path, or table isolation is unsafe",
  );
  const cursor = await pool.query<{ safe: boolean }>(`SELECT
    has_function_privilege('${terminalRole}',
      'public.advance_reader_summary_daily_delivery_c1_cursor(UUID,UUID,DATE,TIMESTAMPTZ)',
      'EXECUTE')
    AND NOT has_function_privilege('public',
      'public.advance_reader_summary_daily_delivery_c1_cursor(UUID,UUID,DATE,TIMESTAMPTZ)',
      'EXECUTE')
    AND NOT has_function_privilege('${capabilityRole}',
      'public.advance_reader_summary_daily_delivery_c1_cursor(UUID,UUID,DATE,TIMESTAMPTZ)',
      'EXECUTE')
    AND NOT has_table_privilege('${terminalRole}',
      'public.reader_summary_daily_execution_cursors', 'SELECT,INSERT,UPDATE,DELETE')
    AND NOT has_table_privilege('${ownerRole}',
      'public.reader_summary_daily_execution_cursors', 'SELECT,INSERT,UPDATE,DELETE')
    AND owner.rolname='${schemaOwnerRole}' AND NOT owner.rolcanlogin
    AND procedure.prosecdef
    AND procedure.proconfig=ARRAY['search_path=pg_catalog']::TEXT[] AS safe
    FROM pg_proc procedure
    JOIN pg_namespace namespace ON namespace.oid=procedure.pronamespace
    JOIN pg_roles owner ON owner.oid=procedure.proowner
    WHERE namespace.nspname='public'
      AND procedure.proname='advance_reader_summary_daily_delivery_c1_cursor'`);
  assert(
    cursor.rows[0]?.safe === true,
    "C1 cursor function owner, ACL, or search_path is unsafe",
  );
  const privateFunctions = await pool.query<{ safe: boolean }>(`SELECT
    bool_and(owner.rolname='${ownerRole}' AND NOT owner.rolcanlogin
      AND procedure.prosecdef
      AND procedure.proconfig=ARRAY['search_path=pg_catalog']::TEXT[]
      AND has_function_privilege('${schemaOwnerRole}', procedure.oid, 'EXECUTE')
      AND NOT has_function_privilege('${terminalRole}', procedure.oid, 'EXECUTE')
      AND NOT has_function_privilege('public', procedure.oid, 'EXECUTE')) AS safe
    FROM pg_proc procedure
    JOIN pg_namespace namespace ON namespace.oid=procedure.pronamespace
    JOIN pg_roles owner ON owner.oid=procedure.proowner
    WHERE namespace.nspname='public' AND procedure.proname IN (
      'assert_reader_summary_daily_delivery_c1_c0_adoption',
      'is_reader_summary_daily_delivery_c1_jul24_adoptable'
    )`);
  assert(
    privateFunctions.rows[0]?.safe === true,
    "C1 private publication proofs have unsafe owner or ACL",
  );
  const legacyClaim = await pool.query<{ safe: boolean }>(`SELECT
    owner.rolname='${schemaOwnerRole}' AND NOT owner.rolcanlogin
    AND procedure.prosecdef
    AND procedure.proconfig=ARRAY['search_path=pg_catalog']::TEXT[]
    AND has_function_privilege('${terminalRole}', procedure.oid, 'EXECUTE')
    AND NOT has_function_privilege('public', procedure.oid, 'EXECUTE') AS safe
    FROM pg_proc procedure
    JOIN pg_namespace namespace ON namespace.oid=procedure.pronamespace
    JOIN pg_roles owner ON owner.oid=procedure.proowner
    WHERE namespace.nspname='public'
      AND procedure.proname='claim_reader_summary_daily_execution_c1_legacy'`);
  assert(
    legacyClaim.rows[0]?.safe === true,
    "C1 legacy claim owner, ACL, or search_path is unsafe",
  );
};

const ensureRole = async (role: string, login: boolean): Promise<void> => {
  const existing = await server.query<{ present: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=$1) AS present",
    [role],
  );
  if (existing.rows[0]?.present === true) return;
  await server.query(`CREATE ROLE ${quoteIdentifier(role)} ${login ? "LOGIN" : "NOLOGIN"}
    NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION NOBYPASSRLS`);
  createdRoles.push(role);
};
const ensureMembership = async (
  role: string,
  member: string,
): Promise<boolean> => {
  const existing = await server.query<{ present: boolean }>(
    `SELECT EXISTS (
    SELECT 1 FROM pg_auth_members membership
    JOIN pg_roles granted ON granted.oid=membership.roleid
    JOIN pg_roles grantee ON grantee.oid=membership.member
    WHERE granted.rolname=$1 AND grantee.rolname=$2) AS present`,
    [role, member],
  );
  if (existing.rows[0]?.present === true) return false;
  await server.query(
    `GRANT ${quoteIdentifier(role)} TO ${quoteIdentifier(member)}`,
  );
  return true;
};
const setGuc = async (
  client: PoolClient,
  name: string,
  value?: string,
): Promise<void> => {
  if (value !== undefined)
    await client.query("SELECT set_config($1,$2,true)", [name, value]);
};
const exactGucs = () => ({ tenantId, workspaceId, systemAccess: "false" });
const cursorGucs = () => ({
  tenantId,
  workspaceId,
  systemAccess: "false",
  c1Mode: "exact",
});
const receiptSha = (date: string): string =>
  createHash("sha256").update(`c1-receipt:${date}`, "utf8").digest("hex");
const fixtureId = (prefix: string, date: string): string =>
  `${prefix}0000000-0000-4000-8000-0000000000${date.slice(-2)}`;
const expectRejected = async (
  operation: () => Promise<unknown>,
  label: string,
): Promise<void> => {
  try {
    await operation();
  } catch {
    return;
  }
  throw new Error(`${label} did not fail closed`);
};
function requiredAdminUrl(env: NodeJS.ProcessEnv): string {
  const value = env.READER_SUMMARY_PUBLICATION_TEST_ADMIN_DATABASE_URL?.trim();
  if (!value)
    throw new Error(
      "READER_SUMMARY_PUBLICATION_TEST_ADMIN_DATABASE_URL is required",
    );
  return value;
}
function databaseUrl(input: string, database: string): string {
  const value = new URL(input);
  value.pathname = `/${database}`;
  return value.toString();
}
const quoteIdentifier = (value: string): string =>
  `"${value.replaceAll('"', '""')}"`;
const assert: (condition: unknown, message: string) => asserts condition = (
  condition,
  message,
) => {
  if (!condition) throw new Error(message);
};

const cleanup = async (): Promise<void> => {
  if (databaseCreated) {
    await server
      .query(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()",
        [databaseName],
      )
      .catch(() => undefined);
    await server
      .query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`)
      .catch(() => undefined);
  }
  if (systemMembershipCreated && !createdRoles.includes(systemLogin)) {
    await server
      .query(
        `REVOKE ${quoteIdentifier(capabilityRole)} FROM ${quoteIdentifier(systemLogin)}`,
      )
      .catch(() => undefined);
  }
  for (const role of [...createdRoles].reverse()) {
    await server
      .query(`DROP ROLE IF EXISTS ${quoteIdentifier(role)}`)
      .catch(() => undefined);
  }
  await server.end();
};

void main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(cleanup);
