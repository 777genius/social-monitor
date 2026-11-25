import type { PoolClient } from "pg";
import { performance } from "node:perf_hooks";
import { largeDailyPublicationFixture } from "./reader-summary-large-daily-publication-fixture";
import { assertCanonical, assertLinearUtf16PostgresContract, assertPublicationDeadline } from "./reader-summary-linear-utf16-postgres-contract";
import { createReaderSummaryPublicationRunningFixture } from "./reader-summary-publication-postgres-running-fixture";
import {
  createReaderSummaryPublicationFixtureAuthority, readerSummaryPublicationDbOwnedRequest,
  sha256, stableJson,
} from "./reader-summary-weekly-publication-evidence-postgres-contract";
import { assertPostgres as assert } from "./reader-summary-publication-postgres-assertions";

export const assertLargeDailyPublicationPostgresContract = async (
  runtime: PoolClient, auditor: PoolClient,
): Promise<void> => {
  await assertLinearUtf16PostgresContract(auditor);
  await assertPublicationDeadline(runtime);
  const day = "2026-09-03";
  const fixture = await createReaderSummaryPublicationRunningFixture(runtime, "COMPLETED", day, {
    modelVersion: "codex:gpt-5.6-sol:high", providerEvidence: "reddit",
  });
  const citations = [];
  for (let index = 0; index < 16; index += 1) {
    const authority = await createReaderSummaryPublicationFixtureAuthority({
      client: runtime, tenantId: String(fixture.payload.tenantId),
      workspaceId: String(fixture.payload.workspaceId), status: "COMPLETED",
      startedAt: `${day}T00:00:00.000Z`, endedAt: "2026-09-04T00:00:00.000Z",
      requestedAt: `${day}T10:00:00.000Z`, overrides: { providerEvidence: "reddit" },
    });
    citations.push(authority.citations[0]!);
  }
  const large = largeDailyPublicationFixture({
    artifactId: fixture.artifactId, tenant: String(fixture.payload.tenantId),
    workspace: String(fixture.payload.workspaceId), day,
    citations: citations as unknown as NonNullable<Parameters<typeof largeDailyPublicationFixture>[0]>["citations"],
  });
  // Match the synthetic persisted evidence to the exact source text and
  // timestamps used by the production slate/attestation builders.
  for (const item of large.evidence) {
    const values = [item.sourceItemId, fixture.payload.tenantId, fixture.payload.workspaceId,
      item.title, item.bodyPreview, item.publishedAt, item.observedAt];
    const source = await runtime.query(`UPDATE source_items
      SET title=$4, body=$5, published_at=$6, observed_at=$7
      WHERE id=$1::uuid AND tenant_id=$2::uuid AND workspace_id=$3::uuid RETURNING id`, values);
    const feed = await runtime.query(`UPDATE feed_items
      SET title=$4, body_preview=$5, published_at=$6, observed_at=$7
      WHERE source_item_id=$1::uuid AND tenant_id=$2::uuid AND workspace_id=$3::uuid RETURNING id`, values);
    assert(source.rows.length === 1 && feed.rows.length === 1,
      "Large daily fixture lost its exact persisted evidence");
  }
  await runtime.query(`UPDATE reader_summary_artifacts SET artifact_payload=$2::jsonb, citations=$3::jsonb
    WHERE id=$1::uuid AND status='RUNNING'`,
  [fixture.artifactId, JSON.stringify(large.payload), JSON.stringify(large.citations)]);
  await assertCanonical(auditor, "reader_summary_daily_artifact_canonical_json", large.payload);
  const request = readerSummaryPublicationDbOwnedRequest(fixture);
  const publish = async (payload = request) => (await runtime.query(
    "SELECT * FROM public.publish_reader_summary($1::jsonb)", [JSON.stringify(payload)])).rows[0];
  await rejectsAuthority(() => publish({ ...request, workspaceId: "00000000-0000-4000-8000-000000000000" }));
  const started = performance.now();
  await runtime.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  let first;
  try {
    await runtime.query("SET LOCAL statement_timeout = '30s'");
    first = await publish();
    assert(first?.outcome === "published" && first.publication_id === fixture.artifactId,
      "Large V2 daily artifact did not publish");
    await runtime.query("COMMIT");
  } catch (error) { await runtime.query("ROLLBACK"); throw error; }
  // The existing published-artifact immutability contract rejects digest
  // mutation. Recovery-input digest validation is covered by reconciliation.
  await rejectsAuthority(() => runtime.query(`UPDATE reader_summary_artifacts
    SET artifact_payload = jsonb_set(artifact_payload,
      '{promotionAttestations,0,digest}', to_jsonb(repeat('0',64)))
    WHERE id=$1::uuid`, [fixture.artifactId]));
  const replay = await publish();
  assert(replay.outcome === "replayed" && replay.publication_id === first.publication_id &&
    replay.report_sha256 === first.report_sha256 && replay.proof_sha256 === first.proof_sha256,
  "Large V2 replay changed publication identity or proof");
  const evidence = await runtime.query(`SELECT report, report_sha256, artifact_payload_sha256,
    exact_proof, proof_sha256
    FROM reader_summary_weekly_publication_evidence WHERE reader_summary_artifact_id=$1`, [fixture.artifactId]);
  const stored = evidence.rows[0];
  assert(stored !== undefined && stored.report_sha256 === sha256(stableJson(stored.report)) &&
    first.report_sha256 === stored.report_sha256 &&
    first.proof_sha256 === stored.proof_sha256 &&
    stored.proof_sha256 === sha256(stableJson(stored.exact_proof)) &&
    stored.artifact_payload_sha256 === sha256(stableJson(large.payload)) &&
    stableJson(stored.report.artifactPayload) === stableJson(large.payload),
  "Daily evidence canonical bytes/SHA or attestation bytes changed");
  await assertCanonical(auditor, "reader_summary_daily_canonical_recovery_v4_report_canonical_json", stored.report);
  const counts = await runtime.query(`SELECT
    (SELECT count(*) FROM reader_summary_publications WHERE reader_summary_job_id=$1) AS publications,
    (SELECT count(*) FROM outbox_events WHERE correlation_id=$1::text) AS events,
    (SELECT count(*) FROM reader_summary_weekly_publication_evidence WHERE reader_summary_job_id=$1) AS evidence`,
  [fixture.jobId]);
  assert(Object.values(counts.rows[0]).every((count) => count === "1"), "Replay duplicated durable publication state");
  console.log(JSON.stringify({ largeDailyPublicationBytes: Buffer.byteLength(stableJson(stored.report)),
    reportSha256: stored.report_sha256, publicationAndReplayMs: performance.now() - started }));
};

const rejectsAuthority = async (operation: () => Promise<unknown>): Promise<void> => {
  try { await operation(); } catch (error) {
    assert(["P0001", "23514"].includes((error as { code: string }).code), "Unexpected publication rejection");
    return;
  }
  throw new Error("Publication authority accepted wrong scope or a published digest mutation");
};
