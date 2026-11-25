/** Synthetic durable board. No provider, model, signatures or omission authority. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { githubTrendingPageRepositoryMetadata, assertGitHubTrendingSnapshotBatchIntegrity, sourceItemContentHash, sourceItemProviderContentHash, type SourceItemProps } from "@social-monitor/ingestion/domain";
import type { ReaderSummaryGitHubProjectionItem, SummaryEvidenceItem } from "@social-monitor/summary/domain";
import type { ReadReaderSummaryGitHubProjectionResult } from "@social-monitor/summary/ports";
import { buildReaderSummarySupplementalTrendSelectedPosts } from "@social-monitor/summary/domain/services/reader-summary-supplemental-selected-posts";
import { buildGitHubTrendingNarrativeAppendix } from "@social-monitor/summary/domain/policies/reader-summary-github-trending-policy";
import { refreshScope } from "./reader-summary-new-input-refresh-manifest";
import { fixtureDate, fixtureId } from "./reader-summary-successor-fixture-seed";

const checkedAt = new Date(`${fixtureDate}T12:00:00.000Z`);
const observedAt = new Date(`${fixtureDate}T12:05:00.000Z`);
const fetchStartedAt = new Date(`${fixtureDate}T11:59:00.000Z`);
export const successorGitHubBoardSource = "<!doctype html><title>Synthetic daily board</title>" +
  Array.from({ length: 10 }, (_, index) => `<article><h2><a href="/synthetic-successor/widget-${index + 1}">synthetic-successor/widget-${index + 1}</a></h2><span>${1201 + index} stars today</span></article>`).join("");
const snapshotContentHash = createHash("sha256").update(successorGitHubBoardSource).digest("hex");
export function successorGitHubRows() {
  const rows = Array.from({ length: 10 }, (_, index) => {
    const rank = index + 1, identity = `synthetic-successor/widget-${rank}`;
    const metadata = githubTrendingPageRepositoryMetadata({
      repository: { fullName: identity, url: `https://github.com/${identity}`, totalStars: 5000 + rank },
      trending: { scanJobId: fixtureId(103), rank, starsGained: 1200 + rank, window: "daily",
        fetchStartedAt, checkedAt, snapshotContentHash, source: "fixture_github_trending_html" } });
    const source: SourceItemProps = { id: fixtureId(200 + rank), tenantId: tenantId(refreshScope.tenantId),
      workspaceId: workspaceId(refreshScope.workspaceId), sourceBindingId: fixtureId(102),
      externalId: `github-trending-page:daily:${fixtureId(103)}:${identity}`, canonicalUrl: `https://github.com/${identity}`,
      title: identity, body: `Fabricated repository ${rank}; no external provider queried.`,
      publishedAt: checkedAt, ingestedAt: observedAt, metadata };
    const item: ReaderSummaryGitHubProjectionItem = { feedItemId: fixtureId(300 + rank), sourceItemId: source.id,
      sourceBindingId: source.sourceBindingId, providerKey: "github-trending-page", metadataKind: "github_trending_page_repository",
      scanJobId: fixtureId(103), canonicalUrl: source.canonicalUrl, repositoryFullName: identity, rank,
      starsGained: 1200 + rank, window: "daily", fetchStartedAt, checkedAt,
      publishedAt: checkedAt, observedAt, sourceContentHash: sourceItemContentHash(source),
      sourceProviderContentHash: sourceItemProviderContentHash({ providerKey: "github-trending-page", snapshot: source }) };
    return { source, item };
  });
  assertGitHubTrendingSnapshotBatchIntegrity({ providerKey: "github-trending-page", items: rows.map(row => row.source) });
  return rows;
}
export function successorGitHubProjection(): ReadReaderSummaryGitHubProjectionResult {
  return { eligibleBindingIds: [fixtureId(102)], items: successorGitHubRows().map(r => r.item), pageCount: 2 };
}
export function successorGitHubSupplement(projection: ReadReaderSummaryGitHubProjectionResult) {
  // Compare actual reader output to the exact synthetic seed before consumption.
  const ordered = [...projection.items].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  assert.deepEqual({ ...projection, items: ordered }, successorGitHubProjection());
  const evidence: SummaryEvidenceItem[] = ordered.map(item => ({ ...item, interestId: fixtureId(101),
    title: item.repositoryFullName!, bodyPreview: `Fabricated repository ${item.rank}; no external provider queried.`,
    providerName: "GitHub Trending", score: 1, readerActionKind: "watch_repository",
    whyImportant: ["Synthetic repository on the exact daily board."],
    providerMetricLabels: [{ label: "GitHub Trending today", value: `#${item.rank}, +${item.starsGained} stars today` }] }));
  const citations = ordered.map(item => ({ citationId: fixtureId(400 + item.rank!), feedItemId: item.feedItemId,
    sourceItemId: item.sourceItemId, providerKey: item.providerKey, canonicalUrl: item.canonicalUrl, field: "canonicalUrl" as const }));
  return { evidence, citations,
    posts: buildReaderSummarySupplementalTrendSelectedPosts({ selectedEvidence: evidence, citations }),
    appendix: buildGitHubTrendingNarrativeAppendix({ evidence, citations }) };
}
/** Call within the preparation admin transaction after HN seeding, before capture. */
export async function seedSuccessorPublicationGitHub(client: PoolClient): Promise<void> {
  const scope = [refreshScope.tenantId, refreshScope.workspaceId];
  const created = `${fixtureDate}T00:00:00.000Z`;
  await client.query(`insert into source_catalog_entries
    (id,provider_key,display_name,acquisition_mode,readiness,created_at,updated_at)
    values ($1,'github-trending-page','Synthetic daily board','fixture','READY',$2,$2)`, [fixtureId(100), created]);
  await client.query(`insert into interests (id,tenant_id,workspace_id,name,query,status,created_at,updated_at)
    values ($1,$2,$3,'Synthetic repositories','github trending daily','ENABLED',$4,$4)`, [fixtureId(101), ...scope, created]);
  await client.query(`insert into source_bindings (id,tenant_id,workspace_id,interest_id,source_catalog_entry_id,
    capability_profile_version,status,config,created_at,updated_at)
    values ($1,$2,$3,$4,$5,1,'ENABLED','{"window":"daily"}',$6,$6)`,
  [fixtureId(102), ...scope, fixtureId(101), fixtureId(100), created]);
  await client.query(`insert into scan_jobs (id,tenant_id,workspace_id,source_binding_id,scan_policy_id,status,
    idempotency_key,requested_at,completed_at,execution_metadata,created_at,updated_at)
    values ($1,$2,$3,$4,$5,'SUCCEEDED','synthetic-successor:github-board',$6,$7,$8::jsonb,$6,$7)`,
  [fixtureId(103), ...scope, fixtureId(102), fixtureId(104), fetchStartedAt, observedAt,
    JSON.stringify({ providerKey: "github-trending-page", status: "succeeded", acceptedItemCount: 10,
      targetPublishedWindowStartedAt: created, targetPublishedWindowEndedAt: "2026-09-04T00:00:00.000Z", synthetic: true })]);
  for (const { source: s, item: i } of successorGitHubRows()) {
    await client.query(`insert into source_items (id,tenant_id,workspace_id,source_binding_id,provider_key,
      provider_item_id,canonical_url,title,body,published_at,content_hash,provider_content_hash,
      observed_at,last_observed_at,metadata,created_at)
      values ($1,$2,$3,$4,'github-trending-page',$5,$6,$7,$8,$9,$10,$11,$12,$12,$13::jsonb,$12)`,
    [s.id, ...scope, s.sourceBindingId, s.externalId, s.canonicalUrl, s.title, s.body, s.publishedAt,
      i.sourceContentHash, i.sourceProviderContentHash, s.ingestedAt, JSON.stringify(s.metadata)]);
    await client.query(`insert into feed_items (id,tenant_id,workspace_id,interest_id,source_item_id,source_binding_id,
      provider_key,dedupe_key,canonical_url,title,body_preview,published_at,observed_at,provider_metadata,status,created_at,updated_at)
      values ($1,$2,$3,$4,$5,$6,'github-trending-page',$7,$8,$9,$10,$11,$12,$13::jsonb,'VISIBLE',$12,$12)`,
    [i.feedItemId, ...scope, fixtureId(101), s.id, s.sourceBindingId, s.externalId, s.canonicalUrl,
      s.title, s.body, s.publishedAt, s.ingestedAt, JSON.stringify(s.metadata)]);
  }
}
