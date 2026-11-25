import assert from "node:assert/strict";
import type { PrismaSummaryConnection } from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-connection";
import type { RefreshManifest } from "./reader-summary-new-input-refresh-manifest";

const tables = ["reader_summary_jobs", "reader_summary_artifacts", "reader_summary_publications",
  "reader_summary_publication_slots", "reader_summary_weekly_publication_evidence", "outbox_events", "reader_summary_new_input_refresh_reconciliations",
  "reader_summary_new_input_refresh_reconciliation_counters"] as const;
type Row = Record<string, unknown>;
export type PublicationState = Record<typeof tables[number], Row[]>;
export async function publicationState(subject: Pick<PrismaSummaryConnection, "$queryRaw">, m: RefreshManifest): Promise<PublicationState> {
  // One subject snapshot under the existing tenant context. The observer has lock
  // instrumentation rights, not SELECT on all publication/evidence relations.
  const rows = await subject.$queryRaw<readonly { name: typeof tables[number]; row: Row }[]>`
    select name, row from (
      select 'reader_summary_jobs' as name, to_jsonb(r) as row from reader_summary_jobs r
      union all select 'reader_summary_artifacts', to_jsonb(r) from reader_summary_artifacts r
      union all select 'reader_summary_publications', to_jsonb(r) from reader_summary_publications r
      union all select 'reader_summary_publication_slots', to_jsonb(r) from reader_summary_publication_slots r
      union all select 'reader_summary_weekly_publication_evidence', to_jsonb(r) from reader_summary_weekly_publication_evidence r
      union all select 'outbox_events', to_jsonb(r) from outbox_events r
      union all select 'reader_summary_new_input_refresh_reconciliations', to_jsonb(r) from reader_summary_new_input_refresh_reconciliations r
      union all select 'reader_summary_new_input_refresh_reconciliation_counters', to_jsonb(r) from reader_summary_new_input_refresh_reconciliation_counters r
    ) captured where row->>'tenant_id' = ${m.tenantId} and row->>'workspace_id' = ${m.workspaceId}
    order by name, row::text
  `;
  const result: PublicationState = { reader_summary_jobs: [], reader_summary_artifacts: [],
    reader_summary_publications: [], reader_summary_publication_slots: [], reader_summary_weekly_publication_evidence: [],
    outbox_events: [], reader_summary_new_input_refresh_reconciliations: [], reader_summary_new_input_refresh_reconciliation_counters: [] };
  for (const { name, row } of rows) result[name].push(row);
  return result;
}
export function assertPublicationEffects(before: PublicationState, after: PublicationState,
  m: RefreshManifest, ids: { job: string; artifact: string }, requestedAt: string): string {
  for (const table of tables) {
    const old = before[table], current = after[table];
    const adds = ["reader_summary_jobs", "reader_summary_artifacts", "reader_summary_publications", "reader_summary_weekly_publication_evidence", "outbox_events"].includes(table) ? 1 : 0;
    assert.equal(current.length, old.length + adds, `${table} exact delta`);
    for (const row of old) {
      const observed = current.find(r => rowKey(table, r) === rowKey(table, row));
      assert(observed, `${table} original row missing`);
      if (table === "reader_summary_artifacts" && row.id === m.prior.artifactId) {
        assert.equal(observed.status, "SUPERSEDED");
        assert.deepEqual({ ...observed, status: row.status, updated_at: row.updated_at }, row);
      } else if (table === "reader_summary_publication_slots" && row.current_publication_id === m.prior.publicationId) {
        assert.equal(observed.current_publication_id, ids.artifact);
        assert.deepEqual({ ...observed, current_publication_id: row.current_publication_id, updated_at: row.updated_at }, row);
      } else assert.deepEqual(observed, row, `${table} full original row`);
    }
  }
  const job = after.reader_summary_jobs.find(r => r.id === ids.job)!;
  assert.equal(job.idempotency_key, m.operation); assert.equal(job.status, "COMPLETED");
  assert.equal(job.reader_summary_artifact_id, ids.artifact);
  assert.equal(new Date(String(job.requested_at)).toISOString(), requestedAt);
  const artifact = after.reader_summary_artifacts.find(r => r.id === ids.artifact)!;
  assert.equal(artifact.status, "COMPLETED");
  const publication = after.reader_summary_publications.find(r => r.id === ids.artifact)!;
  assert.equal(publication.reader_summary_job_id, ids.job);
  assert.equal(publication.reader_summary_artifact_id, ids.artifact);
  // V2 owns event identity; bind the one new outbox row to its committed ledger ID.
  const ready = publication.outbox_event_id;
  assert.equal(typeof ready, "string");
  assert(!before.outbox_events.some(row => row.id === ready));
  assert.equal(publication.requested_utc_date, m.date);
  assert.equal(new Date(String(publication.requested_at)).toISOString(), requestedAt);
  assert.equal(publication.publication_kind, "EXACT"); assert.equal(publication.semantic_status, "COMPLETED");
  const proof = publication.exact_proof as Row;
  assert.equal(proof.readerSummaryJobId, ids.job); assert.equal(proof.readerSummaryArtifactId, ids.artifact);
  assert.equal(proof.requestedAt, requestedAt); assert.equal(proof.requestedUtcDate, m.date);
  const evidence = after.reader_summary_weekly_publication_evidence.find(r => r.publication_id === ids.artifact)!;
  assert(evidence, "DB-owned V2 evidence must be recorded");
  assert.equal(evidence.reader_summary_job_id, ids.job); assert.equal(evidence.reader_summary_artifact_id, ids.artifact);
  assert.equal(evidence.requested_utc_date, m.date); assert.deepEqual(evidence.exact_proof, proof);
  assert.equal(evidence.report_sha256, publication.report_sha256); assert.equal(evidence.proof_sha256, publication.proof_sha256);
  const github = evidence.github_evidence as Row;
  assert.equal(github.mode, "verified"); assert.equal(github.evidenceCount, 10);
  assert.equal((evidence.provider_evidence as Row[]).length, 11);
  const report = evidence.report as Row;
  assert.equal(((report.qualitySignals as Row).publicationGeneration as Row).requestedAt, requestedAt);
  const event = after.outbox_events.find(r => r.id === ready)!;
  assert.equal(event.event_type, "reader_summary.ready");
  assert.equal(event.schema_version, 1); assert.equal(event.status, "PENDING");
  assert.equal(event.correlation_id, ids.job); assert.equal(event.causation_id, ids.job);
  const payload = event.payload as Row;
  assert.equal(payload.readerSummaryJobId, ids.job); assert.equal(payload.readerSummaryId, ids.artifact);
  assert.equal(payload.status, "completed");
  assert.deepEqual(payload.publicationProof, proof);
  assert.equal(payload.reportSha256, String(publication.report_sha256).trim());
  assert.equal(payload.proofSha256, String(publication.proof_sha256).trim());
  return String(ready);
}

const rowKey = (table: string, row: Row): string => table === "reader_summary_publication_slots"
  ? JSON.stringify([row.tenant_id, row.workspace_id, row.scope_type, row.scope_key, row.cadence, row.period_started_at, row.period_ended_at, row.period_timezone])
  : String(table === "reader_summary_weekly_publication_evidence" ? row.publication_id : row.id);
