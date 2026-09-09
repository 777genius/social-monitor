/** Local negative controls for the native effect assertions; no database. */
import assert from "node:assert/strict";
import { assertPublicationEffects, type PublicationState } from "./reader-summary-successor-publication-state";
import type { RefreshManifest } from "./reader-summary-new-input-refresh-manifest";
import { fixtureDate, fixtureNow } from "./reader-summary-successor-fixture-seed";

const m = { date: fixtureDate, operation: "synthetic:successor", prior: { artifactId: "prior", publicationId: "prior" } } as RefreshManifest;
const ids = { job: "successor", artifact: "candidate" }, at = fixtureNow.toISOString();
const before: PublicationState = {
  reader_summary_jobs: [{ id: "failed", status: "FAILED", requested_at: at, usage: "unknown" }, { id: "prior-job", status: "NO_SIGNAL" }],
  reader_summary_artifacts: [{ id: "prior", status: "NO_SIGNAL", updated_at: "old", artifact_payload: { historical: true } }],
  reader_summary_publications: [{ id: "prior", exact_proof: { unchanged: true } }],
  reader_summary_publication_slots: [{ current_publication_id: "prior", updated_at: "old" }],
  reader_summary_weekly_publication_evidence: [{ publication_id: "prior", canonical_bytes: "original-bytes" }],
  outbox_events: [{ id: "old-event", status: "PENDING" }],
  reader_summary_new_input_refresh_reconciliations: [{ id: "receipt", accounting: { usage: "unknown" } }],
  reader_summary_new_input_refresh_reconciliation_counters: [{ id: "counter", counters: { tokens: 13 } }],
};
const after = structuredClone(before);
after.reader_summary_jobs.push({ id: ids.job, idempotency_key: m.operation, status: "COMPLETED",
  reader_summary_artifact_id: ids.artifact, requested_at: at });
after.reader_summary_artifacts[0]!.status = "SUPERSEDED";
after.reader_summary_artifacts[0]!.updated_at = at;
after.reader_summary_artifacts.push({ id: ids.artifact, status: "COMPLETED" });
after.reader_summary_publication_slots[0]!.current_publication_id = ids.artifact;
after.reader_summary_publication_slots[0]!.updated_at = at;
const proof = { readerSummaryJobId: ids.job, readerSummaryArtifactId: ids.artifact, requestedAt: at, requestedUtcDate: m.date };
after.reader_summary_publications.push({ id: ids.artifact, reader_summary_job_id: ids.job,
  reader_summary_artifact_id: ids.artifact, outbox_event_id: "database-generated-event", requested_utc_date: m.date,
  requested_at: at, publication_kind: "EXACT", semantic_status: "COMPLETED", exact_proof: proof,
  report_sha256: "report-hash", proof_sha256: "proof-hash" });
after.reader_summary_weekly_publication_evidence.push({ publication_id: ids.artifact, reader_summary_job_id: ids.job,
  reader_summary_artifact_id: ids.artifact, requested_utc_date: m.date, exact_proof: proof,
  report_sha256: "report-hash", proof_sha256: "proof-hash", github_evidence: { mode: "verified", evidenceCount: 10 },
  provider_evidence: Array.from({ length: 11 }, () => ({})),
  report: { qualitySignals: { publicationGeneration: { requestedAt: at } } } });
after.outbox_events.push({ id: "database-generated-event", event_type: "reader_summary.ready", schema_version: 1,
  status: "PENDING", correlation_id: ids.job, causation_id: ids.job, payload: {
    readerSummaryJobId: ids.job, readerSummaryId: ids.artifact, status: "completed", publicationProof: proof,
    reportSha256: "report-hash", proofSha256: "proof-hash" } });
assert.equal(assertPublicationEffects(before, after, m, ids, at), "database-generated-event");
const mutations: ((state: PublicationState) => void)[] = [
  state => { state.reader_summary_jobs[0]!.usage = "zero"; },
  state => { state.reader_summary_jobs[1]!.status = "FAILED"; },
  state => { state.reader_summary_new_input_refresh_reconciliations[0]!.accounting = {}; },
  state => { state.reader_summary_new_input_refresh_reconciliation_counters[0]!.counters = {}; },
  state => { state.reader_summary_artifacts[0]!.artifact_payload = {}; },
  state => { state.reader_summary_publications[0]!.exact_proof = {}; },
  state => { state.reader_summary_weekly_publication_evidence[0]!.canonical_bytes = "changed"; },
  state => { state.reader_summary_jobs[2]!.idempotency_key = "another-operation"; },
  state => { state.reader_summary_publications[1]!.requested_at = `${fixtureDate}T00:00:00Z`; },
  state => { state.reader_summary_publications[1]!.requested_utc_date = at.slice(0, 10); },
  state => { state.reader_summary_publications[1]!.outbox_event_id = "old-event"; },
  state => { state.reader_summary_publication_slots[0]!.current_publication_id = "prior"; },
  state => { state.outbox_events.push({ id: "extra" }); },
  state => { state.reader_summary_weekly_publication_evidence.pop(); },
];
for (const mutate of mutations) {
  const changed = structuredClone(after); mutate(changed);
  assert.throws(() => assertPublicationEffects(before, changed, m, ids, at));
}
console.log(JSON.stringify({ status: "local-effects-contract-verified", negativeControls: mutations.length, nativePublication: "not-executed" }));
