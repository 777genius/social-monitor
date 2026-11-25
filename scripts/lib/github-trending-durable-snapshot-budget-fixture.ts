import type { GitHubTrendingDurableSnapshotCandidate } from "./github-trending-durable-snapshot-reuse";

const uuid = (value: number): string =>
  `00000000-0000-7000-8000-${String(value).padStart(12, "0")}`;
export const scope = {
  tenantId: uuid(6101), workspaceId: uuid(6102), sourceBindingId: uuid(6111),
};

// Synthetic content only. Match the incident's measured normalized array size,
// not any production payload. All 15 generations are independently valid.
export const richCandidates = (count = 15): GitHubTrendingDurableSnapshotCandidate[] => {
  const rows = Array.from({ length: count }, (_, hour) => generation(hour)).flat();
  let remaining = Math.floor(342_536 * count / 15) - Buffer.byteLength(JSON.stringify(rows), "utf8");
  if (remaining < 0) throw new Error("synthetic baseline exceeds incident size");
  return rows.map((row, index) => {
    // Updating the byte-count number can add decimal digits; settle afterwards.
    const padding = Math.floor(remaining / (rows.length - index));
    const bodyPreview = row.bodyPreview + " synthetic".repeat(Math.ceil(padding / 10)).slice(0, padding);
    const next = { ...row, bodyPreview, bodyPreviewBytes: Buffer.byteLength(bodyPreview, "utf8") };
    remaining -= Buffer.byteLength(JSON.stringify(next), "utf8") - Buffer.byteLength(JSON.stringify(row), "utf8");
    if (index === rows.length - 1 && remaining !== 0) {
      const adjusted = bodyPreview.slice(0, bodyPreview.length + remaining);
      return { ...next, bodyPreview: adjusted, bodyPreviewBytes: Buffer.byteLength(adjusted, "utf8") };
    }
    return next;
  });
};

const generation = (hour: number): GitHubTrendingDurableSnapshotCandidate[] =>
  Array.from({ length: 10 }, (_, index) => {
    const rank = index + 1;
    const scanJobId = uuid(100 + hour);
    const fetchStartedAt = `2026-09-07T${String(hour).padStart(2, "0")}:00:00.000Z`;
    const checkedAt = `2026-09-07T${String(hour).padStart(2, "0")}:01:00.000Z`;
    const repository = `owner/repository-${rank}`;
    const title = `${repository} is #${rank} on GitHub Trending`;
    const bodyPreview = `Visible summary for ${repository}.`;
    return {
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      sourceTenantId: scope.tenantId,
      sourceWorkspaceId: scope.workspaceId,
      feedItemId: uuid(1000 + hour * 10 + rank),
      sourceItemId: uuid(2000 + hour * 10 + rank),
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
      scanJobId: scanJobId,
      feedScanJobId: scanJobId,
      fetchStartedAt: fetchStartedAt,
      feedFetchStartedAt: fetchStartedAt,
      checkedAt: checkedAt,
      feedCheckedAt: checkedAt,
      publishedAt: checkedAt,
      sourcePublishedAt: checkedAt,
      feedObservedAt: checkedAt,
      sourceObservedAt: checkedAt,
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
  });
