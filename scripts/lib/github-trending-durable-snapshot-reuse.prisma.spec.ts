import type { Pool } from "pg";

import {
  githubTrendingDurableSnapshotRowLimit,
  InMemoryGitHubTrendingDurableSnapshotReader,
  PrismaGitHubTrendingDurableSnapshotReader,
  reuseGitHubTrendingDurableSnapshot,
  type GitHubTrendingDurableSnapshotCandidate,
  type GitHubTrendingDurableSnapshotReader,
} from "./github-trending-durable-snapshot-reuse";

describe("Prisma GitHub Trending durable snapshot reader", () => {
  it("matches in-memory selection, ordering, and proof semantics", async () => {
    const candidates = validCandidates().reverse();
    const query = jest.fn().mockResolvedValue({
      rows: candidates.map(prismaRow),
    });
    const prismaReader = new PrismaGitHubTrendingDurableSnapshotReader({
      query,
    } as unknown as Pick<Pool, "query">);
    const memoryReader = new InMemoryGitHubTrendingDurableSnapshotReader(
      candidates,
    );

    await expect(reuse(prismaReader)).resolves.toEqual(
      await reuse(memoryReader),
    );
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain("from feed_items fi");
    expect(query.mock.calls[0]?.[0]).toContain(
      "si.tenant_id::text as \"sourceTenantId\"",
    );
    expect(query.mock.calls[0]?.[0]).toContain(
      "and si.tenant_id = $1::uuid",
    );
    expect(query.mock.calls[0]?.[0]).toContain(
      "fi.provider_metadata->'trending'->>'fetchStartedAt'",
    );
    expect(query.mock.calls[0]?.[0]).toContain(
      "fi.provider_metadata->'trending'->>'checkedAt'",
    );
    expect(query.mock.calls[0]?.[0]).toContain(
      "si.published_at >= $4::timestamptz",
    );
    expect(query.mock.calls[0]?.[0]).toContain("left join scan_jobs");
    expect(query.mock.calls[0]?.[0]).toContain("order by fi.id asc");
    expect(query.mock.calls[0]?.[0]).not.toContain("nulls first");
    expect(query.mock.calls[0]?.[1]).toEqual([
      "tenant-a",
      "workspace-a",
      "binding-a",
      "2026-07-23T00:00:00.000Z",
      "2026-07-24T00:00:00.000Z",
      githubTrendingDurableSnapshotRowLimit + 1,
    ]);
  });

  it("fails closed on the same duplicate identity in memory and Prisma", async () => {
    const candidates = validCandidates().map((row, index, rows) =>
      index === 9 ? { ...row, sourceItemId: rows[8]!.sourceItemId } : row,
    );
    const prismaReader = readerReturning(candidates);
    const memoryReader = new InMemoryGitHubTrendingDurableSnapshotReader(
      candidates,
    );

    await expect(reuse(prismaReader)).rejects.toThrow("duplicate_identity");
    await expect(reuse(memoryReader)).rejects.toThrow("duplicate_identity");
  });

  it("rejects malformed newest ordering identity before Prisma or in-memory selection", async () => {
    const older = validCandidates().map((row) => ({
      ...row,
      scanJobId: "scan-older",
      feedScanJobId: "scan-older",
      providerItemId: row.providerItemId.replace(
        "scan-valid",
        "scan-older",
      ),
      fetchStartedAt: "2026-07-23T11:50:00.000Z",
      feedFetchStartedAt: "2026-07-23T11:50:00.000Z",
      checkedAt: "2026-07-23T12:00:00.000Z",
      feedCheckedAt: "2026-07-23T12:00:00.000Z",
      publishedAt: "2026-07-23T12:00:00.000Z",
      sourcePublishedAt: "2026-07-23T12:00:00.000Z",
      feedObservedAt: "2026-07-23T12:00:01.000Z",
      sourceObservedAt: "2026-07-23T12:00:01.000Z",
    }));
    const malformedNewest = validCandidates().map((row) => ({
      ...row,
      scanJobId: "scan-malformed-newest",
      feedScanJobId: "scan-malformed-newest",
      providerItemId: row.providerItemId.replace(
        "scan-valid",
        "scan-malformed-newest",
      ),
      fetchStartedAt: "2026-07-23T23:50:00.000",
      feedFetchStartedAt: "2026-07-23T23:50:00.000",
      checkedAt: "2026-07-23T23:59:00.000",
      feedCheckedAt: "2026-07-23T23:59:00.000",
      publishedAt: "2026-07-22T00:01:00.000Z",
      sourcePublishedAt: "2026-07-22T00:01:00.000Z",
    }));
    const candidates = [...older, ...malformedNewest];

    await expect(reuse(readerReturning(candidates))).rejects.toThrow(
      "invalid_ordering_identity",
    );
    await expect(
      reuse(new InMemoryGitHubTrendingDurableSnapshotReader(candidates)),
    ).rejects.toThrow("invalid_ordering_identity");
  });

  it("uses one bounded statement snapshot and rejects overflow", async () => {
    const base = validCandidates()[0]!;
    const overflow = Array.from(
      { length: githubTrendingDurableSnapshotRowLimit + 1 },
      (_, index) => ({
        ...base,
        feedItemId: `feed-overflow-${index}`,
        sourceItemId: `source-overflow-${index}`,
      }),
    );
    const query = jest.fn().mockResolvedValue({
      rows: overflow.map(prismaRow),
    });

    await expect(
      reuse(
        new PrismaGitHubTrendingDurableSnapshotReader({
          query,
        } as unknown as Pick<Pool, "query">),
      ),
    ).rejects.toThrow("candidate_bound_exceeded");
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("does not emit a group when a statement exposes mixed observedAt", async () => {
    const candidates = validCandidates().map((row, index) =>
      index === 9
        ? {
            ...row,
            feedObservedAt: "2026-07-24T00:00:02.000Z",
            sourceObservedAt: "2026-07-24T00:00:02.000Z",
          }
        : row,
    );

    await expect(reuse(readerReturning(candidates))).rejects.toThrow(
      "ambiguous_scan_identity",
    );
  });

  it("validates mapped source-item tenant and workspace scope", async () => {
    const candidates = validCandidates().map((row) => ({
      ...row,
      sourceTenantId: "tenant-other",
      sourceWorkspaceId: "workspace-other",
    }));

    await expect(reuse(readerReturning(candidates))).rejects.toThrow(
      "selected_group_invalid",
    );
  });
});

const reuse = (reader: GitHubTrendingDurableSnapshotReader) =>
  reuseGitHubTrendingDurableSnapshot({
    reader,
    tenantId: "tenant-a",
    workspaceId: "workspace-a",
    sourceBindingId: "binding-a",
    requestedUtcDay: "2026-07-23",
    observedThrough: new Date("2026-07-24T00:05:00.000Z"),
  });

const readerReturning = (
  candidates: readonly GitHubTrendingDurableSnapshotCandidate[],
): PrismaGitHubTrendingDurableSnapshotReader =>
  new PrismaGitHubTrendingDurableSnapshotReader({
    query: jest.fn().mockResolvedValue({
      rows: candidates.map(prismaRow),
    }),
  } as unknown as Pick<Pool, "query">);

const prismaRow = (row: GitHubTrendingDurableSnapshotCandidate) => ({
  ...row,
  rank: String(row.rank),
  starsGained: String(row.starsGained),
  totalStars: String(row.totalStars),
  sourceTitleBytes: String(row.sourceTitleBytes),
  feedTitleBytes: String(row.feedTitleBytes),
  bodyPreviewBytes: String(row.bodyPreviewBytes),
  publishedAt: new Date(row.publishedAt),
  sourcePublishedAt: new Date(row.sourcePublishedAt),
  feedObservedAt: new Date(row.feedObservedAt),
  sourceObservedAt: new Date(row.sourceObservedAt),
});

const validCandidates = (): GitHubTrendingDurableSnapshotCandidate[] =>
  Array.from({ length: 10 }, (_, index) => {
    const rank = index + 1;
    const repository = `owner/repository-${rank}`;
    const title = `${repository} is #${rank} on GitHub Trending`;
    const bodyPreview = `Visible summary for ${repository}.`;
    return {
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      sourceTenantId: "tenant-a",
      sourceWorkspaceId: "workspace-a",
      feedItemId: `feed-${rank}`,
      sourceItemId: `source-${rank}`,
      feedSourceBindingId: "binding-a",
      sourceSourceBindingId: "binding-a",
      feedProviderKey: "github-trending-page",
      sourceProviderKey: "github-trending-page",
      feedStatus: "VISIBLE",
      providerItemId: `github-trending-page:daily:scan-valid:${repository}`,
      canonicalUrl: `https://github.com/${repository}`,
      metadataKind: "github_trending_page_repository",
      repositoryFullName: repository,
      repositoryUrl: `https://github.com/${repository}`,
      rank,
      starsGained: 1_001 + rank,
      totalStars: 10_000 + rank,
      window: "daily",
      scanJobId: "scan-valid",
      feedScanJobId: "scan-valid",
      fetchStartedAt: "2026-07-23T23:50:00.000Z",
      feedFetchStartedAt: "2026-07-23T23:50:00.000Z",
      checkedAt: "2026-07-23T23:59:00.000Z",
      feedCheckedAt: "2026-07-23T23:59:00.000Z",
      publishedAt: "2026-07-23T23:59:00.000Z",
      sourcePublishedAt: "2026-07-23T23:59:00.000Z",
      feedObservedAt: "2026-07-24T00:00:01.000Z",
      sourceObservedAt: "2026-07-24T00:00:01.000Z",
      scanJobStatus: "SUCCEEDED",
      scanJobTenantId: "tenant-a",
      scanJobWorkspaceId: "workspace-a",
      scanJobSourceBindingId: "binding-a",
      sourceContentHash: "a".repeat(64),
      sourceProviderContentHash: "b".repeat(64),
      sourceTitle: title,
      feedTitle: title,
      bodyPreview,
      sourceTitleBytes: Buffer.byteLength(title, "utf8"),
      feedTitleBytes: Buffer.byteLength(title, "utf8"),
      bodyPreviewBytes: Buffer.byteLength(bodyPreview, "utf8"),
      feedSnapshotSourceBindingId: "binding-a",
      feedSnapshotProviderKey: "github-trending-page",
    };
  });
