import { randomBytes, randomUUID } from "node:crypto";

import { Pool } from "pg";

import type { GitHubTrendingDurableSnapshotCandidate } from "./github-trending-durable-snapshot-reuse";

export type GitHubTrendingPostgresFixtureScope = {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly sourceBindingId: string;
};

export const githubTrendingPostgresFixtureScope: GitHubTrendingPostgresFixtureScope =
  {
    tenantId: "10000000-0000-4000-8000-000000000001",
    workspaceId: "20000000-0000-4000-8000-000000000002",
    sourceBindingId: "30000000-0000-4000-8000-000000000003",
  };

export const withDisposableGitHubTrendingPostgres = async <Result>(
  serverAdminDatabaseUrl: string,
  run: (pool: Pool) => Promise<Result>,
): Promise<Result> => {
  const suffix = randomBytes(10).toString("hex");
  const databaseName = `github_trending_reuse_test_${suffix}`;
  assert(
    /^github_trending_reuse_test_[a-f0-9]{20}$/u.test(databaseName),
    "temporary GitHub reuse database name must be bounded",
  );
  const targetDatabaseUrl = databaseUrl(serverAdminDatabaseUrl, databaseName);
  const serverAdmin = new Pool({
    connectionString: serverAdminDatabaseUrl,
    min: 0,
    max: 1,
  });
  let databaseCreated = false;
  try {
    await serverAdmin.query(
      `CREATE DATABASE ${quoteIdentifier(databaseName)}`,
    );
    databaseCreated = true;
    const fixture = new Pool({
      connectionString: targetDatabaseUrl,
      min: 0,
      max: 2,
    });
    try {
      await installGitHubTrendingPostgresFixtureSchema(fixture);
      return await run(fixture);
    } finally {
      await fixture.end();
    }
  } finally {
    try {
      if (databaseCreated) {
        await serverAdmin.query(
          `DROP DATABASE ${quoteIdentifier(databaseName)} WITH (FORCE)`,
        );
      }
    } finally {
      await serverAdmin.end();
    }
  }
};

export const installGitHubTrendingPostgresFixtureSchema = async (
  pool: Pool,
): Promise<void> => {
  await pool.query(`
    create table scan_jobs (
      id uuid primary key,
      tenant_id uuid not null,
      workspace_id uuid not null,
      source_binding_id uuid not null,
      status text not null
    );

    create table source_items (
      id uuid primary key,
      tenant_id uuid not null,
      workspace_id uuid not null,
      source_binding_id uuid not null,
      provider_key text not null,
      provider_item_id text not null,
      canonical_url text not null,
      title text not null,
      published_at timestamptz not null,
      content_hash text not null,
      provider_content_hash text,
      observed_at timestamptz not null,
      metadata jsonb not null
    );

    create table feed_items (
      id uuid primary key,
      tenant_id uuid not null,
      workspace_id uuid not null,
      source_item_id uuid not null references source_items(id),
      source_binding_id uuid not null,
      provider_key text not null,
      canonical_url text not null,
      title text not null,
      body_preview text not null,
      published_at timestamptz not null,
      observed_at timestamptz not null,
      provider_metadata jsonb,
      status text not null
    );
  `);
};

export const resetGitHubTrendingPostgresFixture = async (
  pool: Pool,
): Promise<void> => {
  await pool.query("truncate table feed_items, source_items, scan_jobs");
};

export const buildGitHubTrendingPostgresCandidates = (params?: {
  readonly scope?: GitHubTrendingPostgresFixtureScope;
  readonly groupKey?: string;
  readonly scanJobId?: string;
  readonly fetchStartedAt?: string;
  readonly checkedAt?: string;
  readonly publishedAt?: string;
  readonly observedAt?: string;
  readonly rowCount?: number;
  readonly mutate?: (
    row: GitHubTrendingDurableSnapshotCandidate,
    index: number,
  ) => GitHubTrendingDurableSnapshotCandidate;
}): GitHubTrendingDurableSnapshotCandidate[] => {
  const scope = params?.scope ?? githubTrendingPostgresFixtureScope;
  const groupKey = params?.groupKey ?? "coherent";
  const scanJobId = params?.scanJobId ?? randomUUID();
  const fetchStartedAt =
    params?.fetchStartedAt ?? "2026-07-23T23:50:00.000Z";
  const checkedAt = params?.checkedAt ?? "2026-07-23T23:59:00.000Z";
  const publishedAt = params?.publishedAt ?? checkedAt;
  const observedAt = params?.observedAt ?? "2026-07-24T00:00:01.000Z";
  return Array.from({ length: params?.rowCount ?? 10 }, (_, index) => {
    const rank = index + 1;
    const repository = `${groupKey}/repository-${rank}`;
    const title = `${repository} is #${rank} on GitHub Trending`;
    const bodyPreview = `Visible fixture summary for ${repository}.`;
    const row: GitHubTrendingDurableSnapshotCandidate = {
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      sourceTenantId: scope.tenantId,
      sourceWorkspaceId: scope.workspaceId,
      feedItemId: randomUUID(),
      sourceItemId: randomUUID(),
      feedSourceBindingId: scope.sourceBindingId,
      sourceSourceBindingId: scope.sourceBindingId,
      feedProviderKey: "github-trending-page",
      sourceProviderKey: "github-trending-page",
      feedStatus: "VISIBLE",
      providerItemId: `github-trending-page:daily:${scanJobId}:${repository}`,
      canonicalUrl: `https://github.com/${repository}`,
      metadataKind: "github_trending_page_repository",
      repositoryFullName: repository,
      repositoryUrl: `https://github.com/${repository}`,
      rank,
      starsGained: 1_001 + rank,
      totalStars: 10_000 + rank,
      window: "daily",
      scanJobId,
      feedScanJobId: scanJobId,
      fetchStartedAt,
      feedFetchStartedAt: fetchStartedAt,
      checkedAt,
      feedCheckedAt: checkedAt,
      publishedAt,
      sourcePublishedAt: publishedAt,
      feedObservedAt: observedAt,
      sourceObservedAt: observedAt,
      scanJobStatus: "SUCCEEDED",
      scanJobTenantId: scope.tenantId,
      scanJobWorkspaceId: scope.workspaceId,
      scanJobSourceBindingId: scope.sourceBindingId,
      sourceContentHash: "a".repeat(64),
      sourceProviderContentHash: "b".repeat(64),
      sourceTitle: title,
      feedTitle: title,
      bodyPreview,
      sourceTitleBytes: Buffer.byteLength(title, "utf8"),
      feedTitleBytes: Buffer.byteLength(title, "utf8"),
      bodyPreviewBytes: Buffer.byteLength(bodyPreview, "utf8"),
      feedSnapshotSourceBindingId: scope.sourceBindingId,
      feedSnapshotProviderKey: "github-trending-page",
    };
    return params?.mutate?.(row, index) ?? row;
  });
};

export const seedGitHubTrendingPostgresCandidates = async (
  pool: Pool,
  rows: readonly GitHubTrendingDurableSnapshotCandidate[],
): Promise<void> => {
  const scanJobs = [
    ...new Map(
      rows.map((row) => [
        row.scanJobId,
        {
          id: row.scanJobId,
          tenantId: row.scanJobTenantId,
          workspaceId: row.scanJobWorkspaceId,
          sourceBindingId: row.scanJobSourceBindingId,
          status: row.scanJobStatus,
        },
      ]),
    ).values(),
  ];
  await pool.query(
    `insert into scan_jobs (
       id, tenant_id, workspace_id, source_binding_id, status
     )
     select fixture.id::uuid,
            fixture."tenantId"::uuid,
            fixture."workspaceId"::uuid,
            fixture."sourceBindingId"::uuid,
            fixture.status
       from jsonb_to_recordset($1::jsonb) as fixture(
         id text,
         "tenantId" text,
         "workspaceId" text,
         "sourceBindingId" text,
         status text
       )`,
    [JSON.stringify(scanJobs)],
  );
  await pool.query(
    `insert into source_items (
       id, tenant_id, workspace_id, source_binding_id, provider_key,
       provider_item_id, canonical_url, title, published_at, content_hash,
       provider_content_hash, observed_at, metadata
     )
     select fixture."sourceItemId"::uuid,
            fixture."sourceTenantId"::uuid,
            fixture."sourceWorkspaceId"::uuid,
            fixture."sourceSourceBindingId"::uuid,
            fixture."sourceProviderKey",
            fixture."providerItemId",
            fixture."canonicalUrl",
            fixture."sourceTitle",
            fixture."sourcePublishedAt"::timestamptz,
            fixture."sourceContentHash",
            fixture."sourceProviderContentHash",
            fixture."sourceObservedAt"::timestamptz,
            fixture.metadata
       from jsonb_to_recordset($1::jsonb) as fixture(
         "sourceItemId" text,
         "sourceTenantId" text,
         "sourceWorkspaceId" text,
         "sourceSourceBindingId" text,
         "sourceProviderKey" text,
         "providerItemId" text,
         "canonicalUrl" text,
         "sourceTitle" text,
         "sourcePublishedAt" text,
         "sourceContentHash" text,
         "sourceProviderContentHash" text,
         "sourceObservedAt" text,
         metadata jsonb
       )`,
    [
      JSON.stringify(
        rows.map((row) => ({
          ...row,
          metadata: {
            kind: row.metadataKind,
            repository: {
              fullName: row.repositoryFullName,
              url: row.repositoryUrl,
              totalStars: row.totalStars,
            },
            trending: {
              rank: row.rank,
              starsGained: row.starsGained,
              window: row.window,
              scanJobId: row.scanJobId,
              fetchStartedAt: row.fetchStartedAt,
              checkedAt: row.checkedAt,
            },
          },
        })),
      ),
    ],
  );
  await pool.query(
    `insert into feed_items (
       id, tenant_id, workspace_id, source_item_id, source_binding_id,
       provider_key, canonical_url, title, body_preview, published_at,
       observed_at, provider_metadata, status
     )
     select fixture."feedItemId"::uuid,
            fixture."tenantId"::uuid,
            fixture."workspaceId"::uuid,
            fixture."sourceItemId"::uuid,
            fixture."feedSourceBindingId"::uuid,
            fixture."feedProviderKey",
            fixture."canonicalUrl",
            fixture."feedTitle",
            fixture."bodyPreview",
            fixture."publishedAt"::timestamptz,
            fixture."feedObservedAt"::timestamptz,
            fixture."providerMetadata",
            fixture."feedStatus"
       from jsonb_to_recordset($1::jsonb) as fixture(
         "feedItemId" text,
         "tenantId" text,
         "workspaceId" text,
         "sourceItemId" text,
         "feedSourceBindingId" text,
         "feedProviderKey" text,
         "canonicalUrl" text,
         "feedTitle" text,
         "bodyPreview" text,
         "publishedAt" text,
         "feedObservedAt" text,
         "providerMetadata" jsonb,
         "feedStatus" text
       )`,
    [
      JSON.stringify(
        rows.map((row) => ({
          ...row,
          providerMetadata: {
            trending: {
              scanJobId: row.feedScanJobId,
              fetchStartedAt: row.feedFetchStartedAt,
              checkedAt: row.feedCheckedAt,
            },
            sourceBindingSnapshot: {
              sourceBindingId: row.feedSnapshotSourceBindingId,
              providerKey: row.feedSnapshotProviderKey,
            },
          },
        })),
      ),
    ],
  );
};

const databaseUrl = (value: string, targetDatabase: string): string => {
  const parsed = new URL(value);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error(
      "READER_SUMMARY_PUBLICATION_TEST_ADMIN_DATABASE_URL must be PostgreSQL",
    );
  }
  parsed.pathname = `/${targetDatabase}`;
  parsed.searchParams.delete("schema");
  return parsed.toString();
};

const quoteIdentifier = (value: string): string =>
  `"${value.replaceAll('"', '""')}"`;

const assert: (condition: boolean, message: string) => asserts condition = (
  condition,
  message,
) => {
  if (!condition) {
    throw new Error(message);
  }
};
