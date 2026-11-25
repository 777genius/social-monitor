import { normalizeJsonObject } from "@social-monitor/shared-kernel";
import { providerMetricFacts } from "./reader-summary-provider-evidence";

describe("archived GitHub reader metric labels", () => {
  it("labels the original archive day instead of claiming today's live capture", () => {
    const providerMetadata = normalizeJsonObject({ kind: "github_trending_page_repository",
      repository: { fullName: "owner/repo", url: "https://github.com/owner/repo", totalStars: 10000, forksCount: 10 },
      trending: { observationKind: "archived", window: "daily", source: "github_trending_archive", rank: 1,
        originalArchiveRank: 2, starsGained: 1001, snapshotContentHash: "a".repeat(64),
        scanJobId: null, fetchStartedAt: null, checkedAt: null },
      archive: { repository: "example/trending-archive", commit: "a".repeat(40), gitBlobSha1: "b".repeat(40),
        filePath: "api/daily/all.json", fileSha256: "c".repeat(64), originalSourceUrl: "https://github.com/trending?since=daily",
        serializedAt: "2026-10-01T12:00:00.000Z", committedAt: "2026-10-01T12:01:00.000Z",
        acquiredAt: "2026-10-13T00:00:00.000Z" } });
    const result = providerMetricFacts({ providerKey: "github-trending-page", providerMetadata });
    expect(result.providerMetricLabels).toEqual([{ label: "GitHub Trending archive 2026-10-01",
      value: "#1, +1,001 stars on 2026-10-01" }]);
    expect(JSON.stringify(result)).not.toContain("today");
  });
});
