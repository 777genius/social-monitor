import { createHash, randomUUID } from "node:crypto";

import type { PoolClient } from "pg";

import {
  readerSummaryPublicationFixtureScope,
  setReaderSummaryPublicationSessionScope,
} from "./reader-summary-publication-postgres-fixture-scope";
import {
  assertPostgres as assert,
  assertPostgresRejectsContaining as assertRejectsContaining,
} from "./reader-summary-publication-postgres-assertions";

type ContractInput = Readonly<{
  adminClient: PoolClient;
  auditorClient: PoolClient;
  runtimeClient: PoolClient;
  runtimeRole: string;
}>;

const sha256Json = (value: unknown): string => createHash("sha256")
  .update(JSON.stringify(value), "utf8").digest("hex");

const day = "2026-06-20";
const startedAt = `${day}T00:00:00.000Z`;
const endedAt = "2026-06-21T00:00:00.000Z";
const reportV1 = "1".repeat(64);
const proofV1 = sha256Json({ schemaVersion: "reader_summary.publication_proof.v1" });
const reportV2 = "3".repeat(64);
const proofV2 = sha256Json({ schemaVersion: "reader_summary.publication_proof.v1" });
const migrationReceipt = "5".repeat(64);
const fenceToken = `reader-summary-date:${day}:1`;

export const assertReaderSummaryPromotionV2RollbackPostgresContract = async (
  input: ContractInput,
): Promise<void> => {
  const fixture = await seedRollbackFixture(input.auditorClient);
  const call = () => input.runtimeClient.query<{ receipt: unknown }>(`
    SELECT public."rollback_reader_summary_promotion_v2"(
      $1::uuid,$2::uuid,$3::date,$4::text,$5::uuid,$6::uuid,$7::text,
      $8::text,$9::uuid,$10::uuid,$11::text,$12::text,$13::text,
      $14::timestamptz
    ) AS receipt
  `, [
    readerSummaryPublicationFixtureScope.tenantId,
    readerSummaryPublicationFixtureScope.workspaceId,
    day,
    migrationReceipt,
    fixture.v2PublicationId,
    fixture.v2ArtifactId,
    reportV2,
    proofV2,
    fixture.v1PublicationId,
    fixture.v1ArtifactId,
    reportV1,
    proofV1,
    fenceToken,
    `${day}T12:00:00.000Z`,
  ]);

  await input.runtimeClient.query(
    "SELECT set_config('social_monitor.system_access', 'true', false)",
  );
  const result = await call();
  assert(result.rows.length === 1, "rollback must return its durable receipt");
  await assertRejectsContaining(
    call,
    "stale or replayed",
    "the same migration receipt must not be replayable",
  );

  const authority = await input.auditorClient.query<{
    active_publication_id: string;
    artifact_count: string;
    publication_count: string;
    receipt_count: string;
    terminal_count: string;
  }>(`SELECT
      slot.current_publication_id::text AS active_publication_id,
      (SELECT count(*) FROM reader_summary_artifacts
        WHERE id = ANY($3::uuid[]))::text AS artifact_count,
      (SELECT count(*) FROM reader_summary_publications
        WHERE id = ANY($4::uuid[]))::text AS publication_count,
      (SELECT count(*) FROM reader_summary_promotion_v2_rollback_receipts
        WHERE migration_receipt_sha256 = $5)::text AS receipt_count,
      (SELECT count(*) FROM reader_summary_jobs
        WHERE id = ANY($6::uuid[]) AND status = 'COMPLETED'
          AND reader_summary_artifact_id = ANY($3::uuid[]))::text AS terminal_count
    FROM reader_summary_publication_slots slot
    WHERE slot.tenant_id = $1::uuid AND slot.workspace_id = $2::uuid
      AND slot.scope_type = 'workspace' AND slot.scope_key = 'workspace'
      AND slot.cadence = 'daily' AND slot.period_started_at = $7::timestamptz
      AND slot.period_ended_at = $8::timestamptz
      AND slot.period_timezone = 'UTC'`, [
    readerSummaryPublicationFixtureScope.tenantId,
    readerSummaryPublicationFixtureScope.workspaceId,
    [fixture.v1ArtifactId, fixture.v2ArtifactId],
    [fixture.v1PublicationId, fixture.v2PublicationId],
    migrationReceipt,
    [fixture.v1JobId, fixture.v2JobId],
    startedAt,
    endedAt,
  ]);
  const row = authority.rows[0];
  assert(row?.active_publication_id === fixture.v1PublicationId &&
    row.artifact_count === "2" && row.publication_count === "2" &&
    row.receipt_count === "1" && row.terminal_count === "2",
  "rollback must restore V1 while preserving both terminal histories");

  await grantFixtureReceiptRead(input.adminClient, input.runtimeRole);
  await setReaderSummaryPublicationSessionScope(input.runtimeClient);
  const visible = await receiptCount(input.runtimeClient);
  await setReaderSummaryPublicationSessionScope(input.runtimeClient, {
    tenantId: readerSummaryPublicationFixtureScope.tenantId,
    workspaceId: "00000000-0000-7000-8000-000000000099",
  });
  const hidden = await receiptCount(input.runtimeClient);
  assert(visible === "1" && hidden === "0",
    "rollback receipts must be isolated by the active tenant/workspace scope");

  await assertRejectsContaining(
    () => input.auditorClient.query(`UPDATE
      reader_summary_promotion_v2_rollback_receipts
      SET rolled_back_at = rolled_back_at WHERE migration_receipt_sha256 = $1`,
    [migrationReceipt]),
    "rollback receipts are immutable",
    "rollback receipt updates must be rejected",
  );
};

const seedRollbackFixture = async (client: PoolClient) => {
  const v1JobId = randomUUID();
  const v1ArtifactId = randomUUID();
  const v1PublicationId = randomUUID();
  const v2JobId = randomUUID();
  const v2ArtifactId = randomUUID();
  const v2PublicationId = randomUUID();
  const { tenantId, workspaceId } = readerSummaryPublicationFixtureScope;
  const rows = [
    [v1JobId, v1ArtifactId, v1PublicationId, reportV1, proofV1, "v1", randomUUID()],
    [v2JobId, v2ArtifactId, v2PublicationId, reportV2, proofV2, "v2", randomUUID()],
  ] as const;
  await client.query("BEGIN");
  try {
    await client.query('SET LOCAL ROLE "social_monitor_reader_summary_publication_owner"');
    for (const [jobId, artifactId, publicationId, report, proof, version, eventId] of rows) {
      const payload = promotionPayload(version);
      await client.query(`INSERT INTO reader_summary_artifacts (
      id,tenant_id,workspace_id,scope_type,scope_key,cadence,
      period_started_at,period_ended_at,period_timezone,period_key,status,
      schema_version,model_version,prompt_version,headline,summary_text,
      artifact_payload,citations,quality_signals,created_at,updated_at
    ) VALUES ($1,$2,$3,'workspace','workspace','daily',$4,$5,'UTC',$6,
      'COMPLETED',1,$7,$8,'Rollback fixture','Rollback fixture',$9::jsonb,
      '[]'::jsonb,'{}'::jsonb,$10,$10)`, [
      artifactId, tenantId, workspaceId, startedAt, endedAt,
      `daily:${startedAt}:${endedAt}:UTC`, `fixture-${version}`,
      `fixture-${version}`, JSON.stringify(payload), `${day}T10:00:00.000Z`,
      ]);
      await client.query(`INSERT INTO reader_summary_jobs (
      id,tenant_id,workspace_id,scope_type,scope_key,cadence,
      period_started_at,period_ended_at,period_timezone,period_key,status,
      idempotency_key,requested_at,started_at,completed_at,
      reader_summary_artifact_id,created_at,updated_at
    ) VALUES ($1,$2,$3,'workspace','workspace','daily',$4,$5,'UTC',$6,
      'COMPLETED',$7,$8,$8,$9,$10,$8,$9)`, [
      jobId, tenantId, workspaceId, startedAt, endedAt,
      `daily:${startedAt}:${endedAt}:UTC`, `rollback-fixture:${jobId}`,
      `${day}T09:00:00.000Z`, `${day}T10:00:00.000Z`, artifactId,
      ]);
      await client.query(`INSERT INTO outbox_events (
        id,tenant_id,workspace_id,event_type,schema_version,payload,status,
        correlation_id
      ) VALUES ($1,$2,$3,'reader_summary.ready',1,'{}'::jsonb,'PENDING',$4)`, [
        eventId, tenantId, workspaceId, jobId,
      ]);
      await client.query(`INSERT INTO reader_summary_publications (
      id,tenant_id,workspace_id,scope_type,scope_key,cadence,
      period_started_at,period_ended_at,period_timezone,period_key,
      requested_utc_date,publication_kind,reader_summary_job_id,
      reader_summary_artifact_id,semantic_status,requested_at,model_version,
      model_authority,report_sha256,proof_sha256,exact_proof,outbox_event_id,
      published_at
    ) VALUES ($1,$2,$3,'workspace','workspace','daily',$4,$5,'UTC',$6,$7,
      'EXACT',$8,$9,'COMPLETED',$10,$11,3,$12,$13,$14::jsonb,$15,$16)`, [
      publicationId, tenantId, workspaceId, startedAt, endedAt,
      `daily:${startedAt}:${endedAt}:UTC`, day, jobId, artifactId,
      `${day}T09:00:00.000Z`, "codex:gpt-5.5:xhigh", report, proof,
      JSON.stringify({ schemaVersion: "reader_summary.publication_proof.v1" }),
      eventId, `${day}T11:00:00.000Z`,
      ]);
    }
    await client.query(`INSERT INTO reader_summary_publication_slots (
      tenant_id,workspace_id,scope_type,scope_key,cadence,period_started_at,
      period_ended_at,period_timezone,current_publication_id,updated_at
    ) VALUES ($1,$2,'workspace','workspace','daily',$3,$4,'UTC',$5,$6)`, [
      tenantId, workspaceId, startedAt, endedAt, v2PublicationId,
      `${day}T11:00:00.000Z`,
    ]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
  return {
    v1JobId, v1ArtifactId, v1PublicationId,
    v2JobId, v2ArtifactId, v2PublicationId,
  };
};

const promotionPayload = (version: "v1" | "v2") => ({
  promotionAttestations: [{
    schemaVersion: `reader_post_promotion_attestation.${version}`,
    policyVersion: `reader_post_promotion.${version}`,
    digestVersion: `reader_post_promotion_digest.sha256.${version}`,
  }],
});

const grantFixtureReceiptRead = async (
  client: PoolClient,
  runtimeRole: string,
): Promise<void> => {
  assert(/^[a-z0-9_]+$/u.test(runtimeRole), "fixture runtime role is unsafe");
  await client.query("BEGIN");
  try {
    await client.query('SET LOCAL ROLE "social_monitor_public_schema_owner"');
    await client.query(`GRANT SELECT ON
      reader_summary_promotion_v2_rollback_receipts TO "${runtimeRole}"`);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
};

const receiptCount = async (client: PoolClient): Promise<string> => {
  const result = await client.query<{ count: string }>(`SELECT count(*)::text
    AS count FROM reader_summary_promotion_v2_rollback_receipts`);
  return result.rows[0]?.count ?? "missing";
};
