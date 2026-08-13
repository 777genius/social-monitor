import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

import { buildReaderSummaryGitHubProjectionCollectionTelemetry } from "../../libs/summary/domain/policies/reader-summary-github-projection-audit";

type FixtureParams = {
  readonly client: PoolClient;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly startedAt: string;
  readonly endedAt: string;
};

type FixtureAuthority = {
  readonly citations: readonly Readonly<Record<string, unknown>>[];
  readonly content: Readonly<Record<string, unknown>>;
  readonly githubProjectionAudit: Readonly<Record<string, unknown>>;
  readonly githubSourceBindingId: string;
};

export const createVerifiedReaderSummaryGitHubFixtureAuthority = async (
  params: FixtureParams,
): Promise<FixtureAuthority> => {
  const sourceBindingId = randomUUID();
  const scanJobId = randomUUID();
  const interestId = randomUUID();
  const checkedAt = new Date(
    Date.parse(params.startedAt) + 12 * 60 * 60 * 1_000,
  ).toISOString();
  const fetchStartedAt = new Date(Date.parse(checkedAt) - 60_000).toISOString();
  const observedAt = new Date(Date.parse(checkedAt) + 300_000).toISOString();
  const providerContentHash = "b".repeat(64);
  const catalog = await params.client.query<{ readonly id: string }>(
    `SELECT id::text FROM source_catalog_entries
      WHERE provider_key = 'github-trending-page'`,
  );
  const sourceCatalogEntryId = catalog.rows[0]?.id ?? randomUUID();
  if (catalog.rows[0] === undefined) {
    await params.client.query(
      `INSERT INTO source_catalog_entries (
         id, provider_key, display_name, acquisition_mode, readiness,
         created_at, updated_at
       ) VALUES (
         $1, 'github-trending-page', 'GitHub Trending', 'pull', 'ready',
         $2, $2
       )`,
      [sourceCatalogEntryId, params.startedAt],
    );
  }
  await params.client.query(
    `INSERT INTO interests (
       id, tenant_id, workspace_id, name, query, status, created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, 'github trending daily', 'ENABLED', $5, $5
     )`,
    [interestId, params.tenantId, params.workspaceId,
      `Publication evidence ${sourceBindingId}`, params.startedAt],
  );
  await params.client.query(
    `INSERT INTO source_bindings (
       id, tenant_id, workspace_id, interest_id, source_catalog_entry_id,
       capability_profile_version, status, config, created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, 1, 'ENABLED',
       '{"window":"daily"}'::jsonb, $6, $6
     )`,
    [sourceBindingId, params.tenantId, params.workspaceId, interestId,
      sourceCatalogEntryId, params.startedAt],
  );
  await params.client.query(
    `INSERT INTO scan_jobs (
       id, tenant_id, workspace_id, source_binding_id, scan_policy_id,
       status, idempotency_key, requested_at, completed_at, execution_metadata,
       created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, 'SUCCEEDED', $6, $7, $8, $9::jsonb, $7, $8
     )`,
    [scanJobId, params.tenantId, params.workspaceId, sourceBindingId,
      randomUUID(), `publication-github-scan:${scanJobId}`, fetchStartedAt,
      observedAt, JSON.stringify({
        providerKey: "github-trending-page",
        status: "succeeded",
        acceptedItemCount: 10,
        targetPublishedWindowStartedAt: params.startedAt,
        targetPublishedWindowEndedAt: params.endedAt,
      })],
  );
  const bindings: Readonly<Record<string, unknown>>[] = [];
  const citations: Readonly<Record<string, unknown>>[] = [];
  const selectedPosts: Readonly<Record<string, unknown>>[] = [];
  for (let index = 0; index < 10; index += 1) {
    const rank = index + 1;
    const sourceItemId = randomUUID();
    const feedItemId = randomUUID();
    const citationId = randomUUID();
    const repositoryIdentity = `owner/repository-${rank}`;
    const canonicalUrl = `https://github.com/${repositoryIdentity}`;
    const sourceContentHash = createHash("sha256")
      .update(`github-source-${rank}`)
      .digest("hex");
    const metadata = {
      kind: "github_trending_page_repository",
      repository: { fullName: repositoryIdentity },
      trending: {
        scanJobId,
        rank,
        starsGained: 200 + rank,
        window: "daily",
        fetchStartedAt,
        checkedAt,
      },
    };
    await params.client.query(
      `INSERT INTO source_items (
         id, tenant_id, workspace_id, source_binding_id, provider_key,
         provider_item_id, canonical_url, title, body, published_at,
         content_hash, provider_content_hash, observed_at, metadata
       ) VALUES (
         $1, $2, $3, $4, 'github-trending-page', $5, $6, $7, $8,
         $9, $10, $11, $12, $13::jsonb
       )`,
      [sourceItemId, params.tenantId, params.workspaceId, sourceBindingId,
        `github-trending:${scanJobId}:${rank}`, canonicalUrl,
        repositoryIdentity, `Repository ${rank} on the exact board.`,
        checkedAt, sourceContentHash, providerContentHash, observedAt,
        JSON.stringify(metadata)],
    );
    await params.client.query(
      `INSERT INTO feed_items (
         id, tenant_id, workspace_id, interest_id, source_item_id,
         source_binding_id, provider_key, dedupe_key, canonical_url, title,
         body_preview, published_at, observed_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, 'github-trending-page', $7, $8,
         $9, $10, $11, $12, $12
       )`,
      [feedItemId, params.tenantId, params.workspaceId, interestId,
        sourceItemId, sourceBindingId,
        `github-publication-feed:${feedItemId}`, canonicalUrl,
        repositoryIdentity, `Repository ${rank} on the exact board.`,
        checkedAt, observedAt],
    );
    citations.push({
      citationId,
      field: "canonicalUrl",
      feedItemId,
      sourceItemId,
      providerKey: "github-trending-page",
      canonicalUrl,
    });
    selectedPosts.push({
      providerKey: "github-trending-page",
      canonicalUrl,
      citationIds: [citationId],
    });
    bindings.push({
      selectedPostIndex: index,
      rank,
      citationId,
      feedItemId,
      sourceItemId,
      sourceBindingId,
      providerKey: "github-trending-page",
      metadataKind: "github_trending_page_repository",
      scanJobId,
      repositoryIdentity,
      canonicalUrl,
      starsGained: 200 + rank,
      fetchStartedAt,
      publishedAt: checkedAt,
      checkedAt,
      observedAt,
      sourceContentHash,
      sourceProviderContentHash: providerContentHash,
    });
  }
  return {
    citations,
    content: { selectedPosts },
    githubSourceBindingId: sourceBindingId,
    githubProjectionAudit: {
      schemaVersion: "reader_summary.github_projection.v1",
      status: "verified",
      requestedUtcDay: params.startedAt.slice(0, 10),
      pageCount: 1,
      scannedItemCount: 10,
      eligibleBindingIds: [sourceBindingId],
      observedThrough: observedAt,
      projectionCheckedAt: checkedAt,
      telemetry: buildReaderSummaryGitHubProjectionCollectionTelemetry({
        dayEndedAt: new Date(params.endedAt),
        observedAt: bindings.map(() => new Date(observedAt)),
      }),
      bindings,
      violationCodes: [],
      reasons: [],
    },
  };
};
