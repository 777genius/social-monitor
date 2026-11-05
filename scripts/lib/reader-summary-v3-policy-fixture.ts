import { randomUUID } from "node:crypto";
import type { JsonObject } from "@social-monitor/shared-kernel";
import type { ReaderPostPromotionV3Candidate } from "../../libs/summary/domain";
import type { ReaderPromotionRankingContext } from "../../libs/summary/domain/policies/reader-promotion-policy-version";
import type { ReaderSummaryV3PreparationSourcePort } from "../../libs/summary/ports";
import { readerPostPromotionEngagementFact } from "../../libs/summary/adapters/evidence/reader-post-promotion-engagement-facts";
import { buildApplicationV3FixturePayload } from "./reader-summary-v3-application-publication-fixture";
import { persistV3FixtureAssessment } from "./reader-summary-v3-fixture-assessment";
import { fixtureReaderValueAnswers } from "./reader-summary-v3-postgres-assessment-lifecycle";
import { sha256 } from "./reader-summary-weekly-publication-evidence-postgres-contract";
import type { ReaderSummaryPublicationPostgresClient } from "./reader-summary-publication-postgres-fixture-scope";
import type { V3FixturePayload } from "./reader-summary-v3-publication-fixture-types";

/** Synthetic native fixture: one young popular card and four mature peers whose
 * headlines are unavailable. The full five-source cohort must still bind the card. */
export const buildV3PolicyFixture = async (
  client: ReaderSummaryPublicationPostgresClient,
  source: Readonly<Record<string, unknown>>,
  context: ReaderPromotionRankingContext,
  quote = false,
) => {
  const payload = source as V3FixturePayload;
  const citation = payload.report.artifactPayload.citationMap[0]!;
  const targetId = citation.feedItemId!;
  const authority = (await client.query<{
    source_item_id: string; source_binding_id: string; title: string; body: string;
    query: string; published_at: string; observed_at: string;
  }>(`SELECT f.source_item_id::text,f.source_binding_id::text,f.title,s.body,i.query,
    to_char(f.published_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') published_at,
    to_char(f.observed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') observed_at
    FROM feed_items f JOIN source_items s ON s.id=f.source_item_id
    JOIN interests i ON i.id=f.interest_id WHERE f.id=$1::uuid`, [targetId])).rows[0];
  if (authority === undefined) throw new Error("Policy fixture authority is missing");
  if (quote) {
    const catalog = (await client.query<{ id: string }>(`INSERT INTO source_catalog_entries
      (id,provider_key,display_name,acquisition_mode,readiness,updated_at)
      VALUES($1::uuid,'x-twitter','Synthetic quote publication','pull','ready',clock_timestamp())
      ON CONFLICT(provider_key) DO UPDATE SET provider_key=EXCLUDED.provider_key RETURNING id::text`, [randomUUID()])).rows[0]!;
    await client.query("UPDATE source_bindings SET source_catalog_entry_id=$2::uuid WHERE id=$1::uuid",
      [authority.source_binding_id, catalog.id]);
    await client.query("UPDATE source_items SET provider_key='x-twitter' WHERE id=$1::uuid", [authority.source_item_id]);
    await client.query("UPDATE feed_items SET provider_key='x-twitter' WHERE id=$1::uuid", [targetId]);
  }
  const providerKey = quote ? "x-twitter" : "reddit";
  const metadata = (score: number): JsonObject => quote
    ? { kind: "x_post", contentKind: "quote", likes: score, reposts: 0 }
    : { kind: "reddit_post", score };
  const targetMetadata = metadata(1000);
  await client.query("UPDATE feed_items SET provider_metadata=$2::jsonb WHERE id=$1::uuid",
    [targetId, JSON.stringify(targetMetadata)]);
  const peerPublishedAt = `${authority.published_at.slice(0, 10)}T02:00:00.123456Z`;
  const peerObservedAt = `${authority.published_at.slice(0, 10)}T09:00:00.123456Z`;
  const peers: ReaderPostPromotionV3Candidate[] = [];
  for (let index = 0; index < (quote ? 0 : 4); index++) {
    const sourceItemId = randomUUID(), candidateId = randomUUID();
    const canonicalIdentity = `https://example.test/policy-peer/${sourceItemId}`;
    await client.query(`INSERT INTO source_items(id,tenant_id,workspace_id,source_binding_id,
      provider_key,provider_item_id,canonical_url,title,body,published_at,content_hash,observed_at,metadata)
      SELECT $2::uuid,tenant_id,workspace_id,source_binding_id,provider_key,$3,$4,title,body,
        $5::timestamptz,content_hash,$6::timestamptz,metadata FROM source_items WHERE id=$1::uuid`,
    [authority.source_item_id, sourceItemId, `policy-peer:${sourceItemId}`, canonicalIdentity,
      peerPublishedAt, peerObservedAt]);
    await client.query(`INSERT INTO feed_items(id,tenant_id,workspace_id,interest_id,source_item_id,
      source_binding_id,provider_key,dedupe_key,canonical_url,title,body_preview,published_at,
      observed_at,updated_at,provider_metadata)
      SELECT $2::uuid,tenant_id,workspace_id,interest_id,$3::uuid,source_binding_id,provider_key,
        $4,$5,title,body_preview,$6::timestamptz,$7::timestamptz,$7::timestamptz,$8::jsonb
      FROM feed_items WHERE id=$1::uuid`, [targetId, candidateId, sourceItemId,
      `policy-peer:${candidateId}`, canonicalIdentity, peerPublishedAt, peerObservedAt,
      JSON.stringify(metadata(index + 1))]);
    const candidate: ReaderPostPromotionV3Candidate = {
      candidateId, sourceItemId, sourceSnapshotSha256: sha256(`policy-peer-source:${index}`),
      inputSha256: sha256(`policy-peer-input:${index}`), assessmentId: randomUUID(),
      providerKey: "reddit", providerFamily: "reddit", canonicalIdentity,
      storyId: `policy-peer-${index}`, publishedAt: peerPublishedAt, assessedAt: peerObservedAt,
      rubricVersion: "reader-value.v1", rubricSha256: "b".repeat(64), modelConfigVersion: "jev.v1",
      answers: fixtureReaderValueAnswers(), usefulness: "useful", relevance: "central",
      engagement: readerPostPromotionEngagementFact({ providerKey: "reddit",
        providerMetadata: metadata(index + 1), engagementObservedAt: peerObservedAt }),
      title: authority.title, presentation: { status: "unavailable", reason: "invalid_presentation",
        validation: { stage: "headline_seal", code: "source_reference" } },
      scopeValid: true, sourceIdentityValid: true, freshnessValid: true,
      safetyValid: true, citationValid: true, blocked: false,
    };
    await persistV3FixtureAssessment(client, candidate, { tenantId: payload.tenantId,
      workspaceId: payload.workspaceId, interestId: payload.interestId,
      trustedIntent: authority.query, title: authority.title, body: authority.body });
    peers.push(candidate);
  }
  const built = await buildApplicationV3FixturePayload(client, source, { context, peers, quote, diagnostics: true,
    engagement: readerPostPromotionEngagementFact({ providerKey,
      providerMetadata: targetMetadata, engagementObservedAt: authority.observed_at }) });
  const candidates = [built.candidate, ...peers].map(candidate => ({
    candidateId: candidate.candidateId, sourceBindingId: authority.source_binding_id,
    providerKey: candidate.providerKey, sourceItemId: candidate.sourceItemId,
    sourceRevisionKey: "publication-fixture", sourceSnapshotSha256: candidate.sourceSnapshotSha256,
    assessmentId: candidate.assessmentId, inputSha256: candidate.inputSha256,
    publishedAt: candidate.publishedAt,
    observedAt: candidate.candidateId === targetId ? authority.observed_at : peerObservedAt,
    sourceKind: quote ? "quote_post" : "original_post", canonicalIdentity: candidate.canonicalIdentity,
    storyId: candidate.storyId, engagementObservedAt: candidate.engagement?.observedAt ?? null,
    providerMetadata: candidate.candidateId === targetId ? targetMetadata
      : metadata(peers.findIndex(peer => peer.candidateId === candidate.candidateId) + 1),
  }));
  const config = { schemaVersion: "reader_summary_preparation_config.v1" as const,
    interestId: payload.interestId, interestSha256: sha256(authority.query),
    rubricVersion: built.candidate.rubricVersion, rubricSha256: built.candidate.rubricSha256,
    inputBuilderVersion: built.prepared?.inputBuilderVersion ?? "input.v1", modelConfigVersion: built.candidate.modelConfigVersion };
  const manifest = { schemaVersion: "reader_summary_preparation_manifest.v1" as const,
    cutoffAt: built.applicationArtifact.toSnapshot().sourceWindow.exactIngestionCutoff!,
    interestSha256: config.interestSha256, rubricSha256: config.rubricSha256,
    inputBuilderVersion: config.inputBuilderVersion, modelConfigVersion: config.modelConfigVersion,
    candidates };
  const preparationSource: ReaderSummaryV3PreparationSourcePort = {
    configuration: async () => ({ ok: true, config }),
    prepare: async job => {
      await client.query(`UPDATE reader_value_assessments SET pinned_job_ids=array_append(pinned_job_ids,$1::uuid)
        WHERE id=ANY($2::uuid[]) AND NOT $1::uuid=ANY(pinned_job_ids)`,
      [job.toSnapshot().id, candidates.map(candidate => candidate.assessmentId)]);
      return { ok: true, config, manifest, manifestSha256: sha256(JSON.stringify(manifest)) };
    },
    coverage: async () => ({ status: "ready" }),
  };
  return { ...built, preparationSource };
};
