import { readerSummaryWorkspaceManifestSha256 } from "../../libs/summary/domain/value-objects/reader-summary-preparation";
import { randomUUID } from "node:crypto";
import { tenantId, workspaceId, type JsonObject } from "@social-monitor/shared-kernel";
import type { ReaderValueSourceSnapshot } from "../../libs/relevance/domain/reader-value/reader-value-source";
import { ReaderSummaryArtifact, type ReaderSummaryPreparationManifest, type ReaderSummaryWorkspacePreparationConfig } from "../../libs/summary/domain";
import type { ReaderSummaryV3PreparationSourcePort } from "../../libs/summary/ports";
import { READER_PROMOTION_POLICY_STAMP } from "../../libs/summary/domain/policies/reader-promotion-policy-version";
import { buildReaderSummaryCoveragePlan } from "../../libs/summary/domain/services/reader-summary-coverage-plan";
import { dailyReaderSummaryGenerationEvidence } from "../../libs/summary/adapters/evidence/reader-summary-daily-generation-evidence";
import { readerPostPromotionEngagementFact } from "../../libs/summary/adapters/evidence/reader-post-promotion-engagement-facts";
import { buildAdaptiveReaderSummaryEvidence } from "../../libs/summary/adapters/model/openai-responses-reader-summary-adaptive-evidence";
import { serializeReaderSummaryArtifact } from "../../libs/summary/adapters/persistence/prisma/prisma-reader-summary-json";
import { buildApplicationV3FixturePayload } from "./reader-summary-v3-application-publication-fixture";
import { readPersistedV3FixtureArtifact } from "./reader-summary-v3-artifact-readback";
import { assertPostgres as assert, assertPostgresRejects as assertRejects } from "./reader-summary-publication-postgres-assertions";
import type { ReaderSummaryPublicationPostgresClient } from "./reader-summary-publication-postgres-fixture-scope";
import type { ReaderSummaryPublicationRunningFixture } from "./reader-summary-publication-postgres-running-fixture";
import { readerSummaryPublicationUtc } from "./reader-summary-publication-postgres-running-fixture";
import type { V3ArtifactPayload, V3FixturePayload } from "./reader-summary-v3-publication-fixture-types";
import { sha256, stableJson } from "./reader-summary-weekly-publication-evidence-postgres-contract";

type Built = { readonly payload: Readonly<Record<string, unknown>>; readonly applicationArtifact: ReaderSummaryArtifact };
type Params = {
  readonly client: ReaderSummaryPublicationPostgresClient;
  readonly createFixture: (status: "COMPLETED", day: number, overrides: {
    readonly requestedAt?: string; readonly providerEvidence: "reddit";
    readonly providerPublishedAt: string; readonly providerObservedAt: string;
    readonly payloadTransform: (payload: Readonly<Record<string, unknown>>) => Promise<Built>;
  }) => Promise<ReaderSummaryPublicationRunningFixture>;
  readonly advance: (fixture: ReaderSummaryPublicationRunningFixture, source: ReaderSummaryV3PreparationSourcePort) => Promise<unknown>;
  readonly publish: (fixture: ReaderSummaryPublicationRunningFixture, artifact?: ReaderSummaryArtifact) => Promise<string>;
};

export const assertV3DailyInputPostgresContract = async (params: Params): Promise<void> => {
  const create = async (day: number, requestedAt?: string) => {
    let source: ReaderSummaryV3PreparationSourcePort | undefined;
    const fixture = await params.createFixture("COMPLETED", day, { providerEvidence: "reddit", requestedAt,
      providerPublishedAt: readerSummaryPublicationUtc(day, 9),
      providerObservedAt: readerSummaryPublicationUtc(day, 9),
      payloadTransform: async raw => {
        const built = await buildDailyFixture(params.client, raw);
        source = built.source;
        return built;
      } });
    if (source === undefined) throw new Error("Daily native fixture preparation missing");
    await params.advance(fixture, source);
    return fixture;
  };
  const first = await create(37);
  const firstPayload = await params.client.query<{ artifact_payload: unknown }>(
    "SELECT artifact_payload FROM reader_summary_artifacts WHERE id=$1::uuid", [first.artifactId]);
  const firstHash = sha256(stableJson(firstPayload.rows[0]!.artifact_payload));
  assert(await params.publish(first) === "published", "daily input first native publication must succeed");
  const read = await readPersistedV3FixtureArtifact(params.client, first.artifactId);
  assert(stableJson(read.toSnapshot().dailyGenerationInput) ===
    stableJson(first.applicationArtifact!.toSnapshot().dailyGenerationInput),
  "native private root daily input proof and sent projection must roundtrip exactly");
  assert(await params.publish(first) === "replayed", "daily input exact native replay must be idempotent");

  const successor = await create(37, `${first.applicationArtifact!.toSnapshot().period.startedAt.toISOString().slice(0, 10)}T10:30:00.000Z`);
  assert(await params.publish(successor) === "published", "later ordinary daily input request must replace its period slot");
  const lifecycle = (await params.client.query<{ status: string; artifact_payload: unknown; job_status: string; current_id: string }>(
    `SELECT a.status::text,a.artifact_payload,j.status::text job_status,s.current_publication_id::text current_id
      FROM reader_summary_artifacts a JOIN reader_summary_jobs j ON j.id=$2::uuid
      JOIN reader_summary_publication_slots s ON s.tenant_id=a.tenant_id AND s.workspace_id=a.workspace_id
      AND s.scope_key=a.scope_key AND s.cadence=a.cadence AND s.period_started_at=a.period_started_at
      AND s.period_ended_at=a.period_ended_at AND s.period_timezone=a.period_timezone WHERE a.id=$1::uuid`,
    [first.artifactId, first.jobId])).rows[0];
  assert(lifecycle?.status === "SUPERSEDED" && lifecycle.job_status === "COMPLETED" &&
    lifecycle.current_id === successor.artifactId && sha256(stableJson(lifecycle.artifact_payload)) === firstHash,
  "native successor must preserve predecessor payload/job while changing only its lifecycle and current slot");

  const tamper = await create(38);
  const snapshot = tamper.applicationArtifact!.toSnapshot();
  const proof = snapshot.dailyGenerationInput!;
  const altered = ReaderSummaryArtifact.create({ ...snapshot, dailyGenerationInput: { ...proof,
    selected: proof.selected.map(entry => ({ ...entry, nativeCount: (entry.nativeCount ?? 0) + 1 })) } });
  await assertRejects(() => params.publish(tamper, altered), "native TS transaction guard must reject a forged daily input native metric");
  const counts = (await params.client.query<{ n: string }>(
    "SELECT count(*)::text n FROM reader_summary_publications WHERE reader_summary_job_id=$1::uuid", [tamper.jobId])).rows[0];
  assert(counts?.n === "0", "daily proof tamper must leave no native publication");
  console.log("Daily input native first/readback/replay/supersession/tamper contract OK");
};

const buildDailyFixture = async (client: ReaderSummaryPublicationPostgresClient,
  raw: Readonly<Record<string, unknown>>) => {
  const input = raw as V3FixturePayload;
  const citation = input.report.artifactPayload.citationMap[0]!;
  // The baseline fixture supplies Reddit content but no observed metric.
  // Add an explicit synthetic native count before freezing its authority.
  await client.query("UPDATE feed_items SET provider_metadata=$2::jsonb WHERE id=$1::uuid",
    [citation.feedItemId, JSON.stringify({ kind: "reddit_post", score: 100 })]);
  // Workspace publication fixtures do not create the interest/binding rows
  // needed by real V2 preparation. Supply their actual stored identities.
  await client.query(`INSERT INTO interests(id,tenant_id,workspace_id,name,query,status,created_at,updated_at)
    SELECT interest_id,tenant_id,workspace_id,'Daily input fixture '||interest_id::text,'publication evidence','ENABLED',observed_at,observed_at
    FROM feed_items WHERE id=$1::uuid ON CONFLICT(id) DO NOTHING`, [citation.feedItemId]);
  const catalog = (await client.query<{ id: string }>(`INSERT INTO source_catalog_entries
    (id,provider_key,display_name,acquisition_mode,readiness,created_at,updated_at)
    VALUES($1::uuid,'reddit','Daily input fixture','pull','ready',clock_timestamp(),clock_timestamp())
    ON CONFLICT(provider_key) DO UPDATE SET provider_key=EXCLUDED.provider_key RETURNING id::text`, [randomUUID()])).rows[0]!;
  await client.query(`INSERT INTO source_bindings(id,tenant_id,workspace_id,interest_id,source_catalog_entry_id,
    capability_profile_version,status,config,created_at,updated_at)
    SELECT source_binding_id,tenant_id,workspace_id,interest_id,$2::uuid,1,'ENABLED','{}'::jsonb,observed_at,observed_at
    FROM feed_items WHERE id=$1::uuid ON CONFLICT(id) DO NOTHING`, [citation.feedItemId, catalog.id]);
  const authority = (await client.query<{ source_binding_id: string; interest_id: string; provider_key: string;
    provider_metadata: JsonObject; published_at: string; observed_at: string; canonical_url: string }>(
    `SELECT f.source_binding_id::text,f.interest_id::text,f.provider_key,f.provider_metadata,
      to_char(f.published_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') published_at,
      to_char(f.observed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') observed_at,
      f.canonical_url FROM feed_items f WHERE f.id=$1::uuid`, [citation.feedItemId])).rows[0]!;
  const cutoff = `${input.periodStartedAt.slice(0, 10)}T10:00:00.123456Z`;
  const built = await buildApplicationV3FixturePayload(client, raw, {
    context: { policyVersion: READER_PROMOTION_POLICY_STAMP, ingestionCutoff: cutoff },
    engagement: readerPostPromotionEngagementFact({ providerKey: authority.provider_key,
      providerMetadata: authority.provider_metadata, engagementObservedAt: authority.observed_at }) });
  const interests = (await client.query<{ id: string; query: string }>(
    "SELECT id::text,query FROM interests WHERE tenant_id=$1::uuid AND workspace_id=$2::uuid AND status='ENABLED' AND deleted_at IS NULL ORDER BY id",
    [input.tenantId, input.workspaceId])).rows;
  const config: ReaderSummaryWorkspacePreparationConfig = { schemaVersion: "reader_summary_preparation_config.v2",
    interests: interests.map(interest => ({ schemaVersion: "reader_summary_preparation_config.v1", interestId: interest.id,
      interestSha256: sha256(interest.query), rubricVersion: built.candidate.rubricVersion,
      rubricSha256: built.candidate.rubricSha256, inputBuilderVersion: "input.v1", modelConfigVersion: built.candidate.modelConfigVersion })) };
  const candidate = built.candidate;
  const manifest: ReaderSummaryPreparationManifest = { schemaVersion: "reader_summary_preparation_manifest.v2",
    cutoffAt: cutoff, periodKey: input.periodKey, interests: config.interests,
    candidates: [{ candidateId: candidate.candidateId, sourceItemId: candidate.sourceItemId,
      sourceBindingId: authority.source_binding_id, interestId: authority.interest_id, providerKey: authority.provider_key,
      sourceRevisionKey: "publication-fixture", sourceSnapshotSha256: candidate.sourceSnapshotSha256,
      assessmentId: candidate.assessmentId, inputSha256: candidate.inputSha256,
      publishedAt: authority.published_at, observedAt: authority.observed_at,
      sourceKind: "original_post", canonicalIdentity: authority.canonical_url,
      storyId: candidate.storyId, providerMetadata: authority.provider_metadata, engagementObservedAt: authority.observed_at }] };
  const manifestSha256 = readerSummaryWorkspaceManifestSha256(manifest);
  const stored = (await client.query<{ input_snapshot: ReaderValueSourceSnapshot }>(
    "SELECT input_snapshot FROM reader_value_assessments WHERE id=$1::uuid", [candidate.assessmentId])).rows[0]!;
  const evidence = dailyReaderSummaryGenerationEvidence({ manifest, manifestSha256, periodKey: input.periodKey,
    identity: { tenantId: tenantId(input.tenantId), workspaceId: workspaceId(input.workspaceId), scope: { type: "workspace" } },
    snapshots: new Map([[candidate.assessmentId, stored.input_snapshot]]) });
  assert(evidence.proof.selected.length === 1, "one genuine fixture input must be retained without padding to thirty");
  const base = built.applicationArtifact.toSnapshot();
  const selection = { rankingPolicyVersion: "daily-input", sourceWindow: base.sourceWindow,
    clusters: evidence.clusters, selectedEvidence: evidence.selectedEvidence, dailyGenerationInput: evidence.proof };
  const sent = buildAdaptiveReaderSummaryEvidence(selection, buildReaderSummaryCoveragePlan(selection));
  const proof = { ...evidence.proof, sent: { payloadSha256: sha256(JSON.stringify(sent)), evidence:
    sent.map(item => ({ feedItemId: String(item.feedItemId), sha256: sha256(JSON.stringify(item)) })) } };
  const storyId = proof.selected[0]!.storyId;
  const artifact = ReaderSummaryArtifact.create({ ...base, dailyGenerationInput: proof,
    topStories: base.topStories.map(story => ({ ...story, storyClusterId: storyId })),
    content: { ...base.content!, narrativeSections: base.content!.narrativeSections!.map(section =>
      section.storyClusterId === undefined ? section : { ...section, storyClusterId: storyId }) } });
  const payload = built.payload;
  payload.report.artifactPayload = serializeReaderSummaryArtifact(artifact) as V3ArtifactPayload;
  payload.reportCanonical = stableJson(payload.report); payload.reportSha256 = sha256(String(payload.reportCanonical));
  payload.exactProof.reportSha256 = payload.reportSha256;
  payload.proofCanonical = stableJson(payload.exactProof); payload.proofSha256 = sha256(String(payload.proofCanonical));
  const source: ReaderSummaryV3PreparationSourcePort = { configuration: async () => ({ ok: true, config }),
    prepare: async job => { await client.query("UPDATE reader_value_assessments SET pinned_job_ids=array_append(pinned_job_ids,$1::uuid) WHERE id=$2::uuid", [job.toSnapshot().id, candidate.assessmentId]);
      return { ok: true, config, manifest, manifestSha256 }; }, coverage: async () => ({ status: "ready" }) };
  return { payload, applicationArtifact: artifact, source };
};
