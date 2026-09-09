import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { tenantId, workspaceId, eventId, correlationId, causationId } from "@social-monitor/shared-kernel";
import { ReaderSummaryJob, ReaderSummaryPublicationPolicy, type SummaryEvidenceSelection } from "@social-monitor/summary/domain";
import { buildPromotionNoSignalArtifact } from "@social-monitor/summary/features/execute-reader-summary-job/reader-summary-promotion-no-signal";
import { buildReaderSummaryPublicationPayload } from "@social-monitor/summary/adapters/persistence/reader-summary-publication-proof";
import { readerSummaryJobStatusToPrisma } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-records";
import { refreshPeriod } from "./reader-summary-new-input-refresh-capture";
import { refreshScope, refreshHash } from "./reader-summary-new-input-refresh-manifest";
import { provisionReaderSummaryPublicationFixtureScope, setReaderSummaryPublicationSessionScope } from "./reader-summary-publication-postgres-fixture-scope";

export const fixtureMetadata = { kind: "hacker_news_story", points: 123, comments: 7, synthetic: true } as const;
export const fixtureDate = "2026-09-03";
export const fixtureNow = new Date("2026-09-05T22:00:00.000Z");
export const fixturePriorTime = new Date("2026-09-04T00:00:00.000Z");
export const fixtureId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function fixtureJob(id: string, operation: string, at: Date): ReaderSummaryJob {
  return ReaderSummaryJob.request({ id, tenantId: tenantId(refreshScope.tenantId),
    workspaceId: workspaceId(refreshScope.workspaceId), scope: { type: "workspace" },
    period: refreshPeriod(fixtureDate), idempotencyKey: operation, requestedAt: at });
}
export function fixturePriorPayload() {
  const running = fixtureJob(fixtureId(1), "fabricated:canonical-prior", fixturePriorTime)
    .start({ startedAt: fixturePriorTime });
  const period = refreshPeriod(fixtureDate);
  const evidence: SummaryEvidenceSelection = {
    rankingPolicyVersion: "reader_promotion_policy.v2", selectedEvidence: [], clusters: [],
    sourceWindow: { windowId: "fabricated:empty-prior", startedAt: period.startedAt,
      endedAt: period.endedAt, periodStartedAt: period.startedAt, periodEndedAt: period.endedAt,
      ingestionCutoff: fixturePriorTime, selectedFeedItemIds: [], storyClusterIds: [] },
  };
  const artifact = buildPromotionNoSignalArtifact({ snapshot: running.toSnapshot(),
    readerSummaryId: fixtureId(2), generatedAt: fixturePriorTime, evidence,
    promotionAttestations: [], contextArtifacts: [] });
  const finalJob = running.markNoSignal({ completedAt: fixturePriorTime, readerSummaryId: fixtureId(2) });
  const decision = new ReaderSummaryPublicationPolicy().evaluate({ artifact, evidence });
  assert.equal(decision.status, "published");
  if (decision.status !== "published") throw new Error("synthetic no-signal prior rejected");
  const snapshot = finalJob.toSnapshot();
  const payload = buildReaderSummaryPublicationPayload({ artifact, finalJob, publicationDecision: decision,
    githubProjectionAudit: { schemaVersion: "reader_summary.github_projection.v1", status: "not_required",
      requestedUtcDay: fixtureDate, pageCount: 1, scannedItemCount: 0, eligibleBindingIds: [],
      bindings: [], violationCodes: [], reasons: [] },
    readyEvent: { eventId: eventId(fixtureId(3)), eventType: "reader_summary.ready", schemaVersion: 1,
      occurredAt: fixturePriorTime, tenantId: snapshot.tenantId, workspaceId: snapshot.workspaceId,
      correlationId: correlationId(snapshot.id), causationId: causationId(snapshot.id),
      payload: { readerSummaryJobId: snapshot.id, readerSummaryId: fixtureId(2),
        tenantId: snapshot.tenantId, workspaceId: snapshot.workspaceId, scope: snapshot.scope,
        period: snapshot.period, status: "no_signal" } },
  });
  return { running, payload };
}
/** SQL persistence keeps fixture timestamps exact; domain builders own states.
 * The real publisher creates artifact, publication, slot and outbox atomically. */
export async function insertFixtureJob(client: PoolClient, job: ReaderSummaryJob): Promise<void> {
  const j = job.toSnapshot();
  await client.query(`insert into reader_summary_jobs (id, tenant_id, workspace_id,
    scope_type, scope_key, cadence, period_started_at, period_ended_at, period_timezone,
    period_key, status, idempotency_key, requested_at, started_at, failed_at,
    failure_reason, created_at, updated_at) values
    ($1,$2,$3,'workspace','workspace','daily',$4,$5,'UTC',$6,$7,$8,$9,$10,$11,$12,$9,$9)`,
  [j.id, j.tenantId, j.workspaceId, j.period.startedAt, j.period.endedAt, j.period.periodKey,
    readerSummaryJobStatusToPrisma(j.status), j.idempotencyKey, j.requestedAt, j.startedAt,
    j.failedAt, j.failureReason]);
}
export async function seedSuccessorPrior(admin: PoolClient, runtime: PoolClient): Promise<void> {
  await provisionReaderSummaryPublicationFixtureScope(admin, refreshScope);
  await setReaderSummaryPublicationSessionScope(runtime, refreshScope);
  const { running, payload } = fixturePriorPayload();
  await runtime.query("begin isolation level serializable");
  try {
    await insertFixtureJob(runtime, running);
    const published = await runtime.query("select * from publish_reader_summary($1::jsonb)", [JSON.stringify(payload)]);
    assert.equal(published.rows[0]?.outcome, "published");
    await runtime.query("commit");
  } catch (error) { await runtime.query("rollback"); throw error; }
}
/** Adapted from the recovery fixture's canonical source/catalog/feed seed.
 * Deliberately one new fabricated HN story, observed after the empty prior. */
export async function seedSuccessorInput(client: PoolClient): Promise<void> {
  const scope = [refreshScope.tenantId, refreshScope.workspaceId];
  const created = fixturePriorTime.toISOString(), observed = "2026-09-05T21:59:00.000Z";
  await client.query(`insert into source_catalog_entries
    (id,provider_key,display_name,acquisition_mode,readiness,created_at,updated_at)
    values ($1,'hacker-news','Fabricated fixture source','fixture','READY',$2,$2)`, [fixtureId(10), created]);
  await client.query(`insert into interests (id,tenant_id,workspace_id,name,query,status,created_at,updated_at)
    values ($1,$2,$3,'Fabricated widgets','fabricated widgets','ENABLED',$4,$4)`, [fixtureId(11), ...scope, created]);
  await client.query(`insert into source_bindings (id,tenant_id,workspace_id,interest_id,
    source_catalog_entry_id,capability_profile_version,status,config,created_at,updated_at)
    values ($1,$2,$3,$4,$5,1,'ENABLED','{}',$6,$6)`, [fixtureId(12), ...scope, fixtureId(11), fixtureId(10), created]);
  const title = "Fabricated widget compiler adds a violet queue";
  const body = "Synthetic source text: the imaginary violet queue batches seven imaginary widgets. No real product or provider was queried.";
  const url = "https://fixture.example.test/story/violet-queue";
  const published = "2026-09-03T12:00:00.000Z";
  const metadata = JSON.stringify(fixtureMetadata);
  await client.query(`insert into source_items (id,tenant_id,workspace_id,source_binding_id,provider_key,
    provider_item_id,canonical_url,title,body,published_at,content_hash,provider_content_hash,
    observed_at,last_observed_at,metadata,created_at)
    values ($1,$2,$3,$4,'hacker-news','fabricated-violet-queue',$5,$6,$7,$8,$9,$9,$10,$10,$11::jsonb,$10)`,
  [fixtureId(13), ...scope, fixtureId(12), url, title, body, published, refreshHash({ title, body }), observed, metadata]);
  await client.query(`insert into feed_items (id,tenant_id,workspace_id,interest_id,source_item_id,
    source_binding_id,provider_key,dedupe_key,canonical_url,title,body_preview,published_at,
    observed_at,provider_metadata,status,created_at,updated_at)
    values ($1,$2,$3,$4,$5,$6,'hacker-news','fabricated-violet-queue',$7,$8,$9,$10,$11,$12::jsonb,'VISIBLE',$11,$11)`,
  [fixtureId(14), ...scope, fixtureId(11), fixtureId(13), fixtureId(12), url, title, body, published, observed, metadata]);
  await client.query(`insert into source_item_engagement_snapshots
    (tenant_id,workspace_id,source_item_id,provider_key,points,comments,metrics_hash,
    first_observed_at,last_observed_at,last_changed_at,last_observation_at,next_observation_due_at,created_at,updated_at)
    values ($1,$2,$3,'hacker-news',123,7,$4,$5,$5,$5,$5,$6,$5,$5)`,
  [...scope, fixtureId(13), refreshHash({ points: 123, comments: 7 }), observed, fixtureNow]);
  await client.query(`insert into source_item_engagement_observations
    (id,tenant_id,workspace_id,source_item_id,source_binding_id,provider_key,points,comments,
    metrics_hash,observed_at,bucket_started_at,reason,metrics_changed,has_regression,created_at)
    values ($1,$2,$3,$4,$5,'hacker-news',123,7,$6,$7,$7,'INITIAL',true,false,$7)`,
  [fixtureId(16), ...scope, fixtureId(13), fixtureId(12), refreshHash({ points: 123, comments: 7 }), observed]);
  await client.query(`insert into reader_summary_policies (id,tenant_id,workspace_id,scope_type,scope_key,
    language,format,tone,max_stories,include_risks,include_interest_highlights,include_repeated_signals,
    dedupe_strategy,rules_version,schedule_enabled,schedule_timezone,schedule_cadences,created_at,updated_at)
    values ($1,$2,$3,'workspace','workspace','en','brief','neutral',8,true,true,true,
      'canonical_url','reader_promotion_policy.v2',false,'UTC',ARRAY['daily'],$4,$4)`, [fixtureId(15), ...scope, created]);
}
