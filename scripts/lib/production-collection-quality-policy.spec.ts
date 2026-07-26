import {
  durableSnapshotReuseProviderCollectionObservation,
  type ProviderCollectionObservation,
} from "./provider-collection-observability";
import {
  githubTrendingDurableSnapshotBindingFingerprint,
  InMemoryGitHubTrendingDurableSnapshotReader,
  reuseGitHubTrendingDurableSnapshot,
  type GitHubTrendingDurableSnapshotCandidate,
} from "./github-trending-durable-snapshot-reuse";
import {
  productionCollectionThresholds,
  providerMeetsProductionBlockingPolicy,
  recalculateProductionBlockingPolicyGates,
} from "./production-collection-quality-policy";

describe("production collection quality policy", () => {
  it("accepts at least ten GitHub repositories inside the requested day", () => {
    expect(
      providerMeetsProductionBlockingPolicy({
        providerKey: "github-trending-page",
        status: "succeeded",
        observability: observation({
          target: 25,
          collected: 10,
          evaluated: 10,
          coverageRatio: 0.4,
          reasons: ["target_shortfall"],
        }),
      }),
    ).toBe(true);
  });

  it("blocks GitHub snapshots outside the requested day or below top ten", () => {
    for (const observability of [
      observation({
        target: 25,
        collected: 25,
        evaluated: 0,
        outsideWindow: 25,
        coverageRatio: 0,
        reasons: ["target_shortfall", "freshness_lag_exceeded"],
      }),
      observation({
        target: 25,
        collected: 9,
        evaluated: 9,
        coverageRatio: 0.36,
        reasons: ["target_shortfall"],
      }),
    ]) {
      expect(
        providerMeetsProductionBlockingPolicy({
          providerKey: "github-trending-page",
          status: "succeeded",
          observability,
        }),
      ).toBe(false);
    }
  });

  it("accepts mixed live and reuse quality only with a certified GitHub proof", async () => {
    const proof = await certifiedDurableProof();
    const github = {
      providerKey: "github-trending-page" as const,
      bindingFingerprint:
        githubTrendingDurableSnapshotBindingFingerprint("binding-a"),
      status: "succeeded" as const,
      acquisitionMode: "durable_snapshot_reuse" as const,
      observability: durableSnapshotReuseProviderCollectionObservation({
        itemCount: 10,
        newestPublishedAt: new Date("2026-07-23T23:59:00.000Z"),
        targetWindowEndedAt: new Date("2026-07-24T00:00:00.000Z"),
      }),
      durableSnapshotProof: proof,
    };
    const hackerNews = {
      providerKey: "hacker-news" as const,
      status: "succeeded" as const,
      observability: observation({
        target: 100,
        collected: 71,
        evaluated: 71,
        coverageRatio: 0.71,
        reasons: ["target_shortfall"],
      }),
    };

    expect(
      [github, hackerNews].every(providerMeetsProductionBlockingPolicy),
    ).toBe(true);
    expect(
      providerMeetsProductionBlockingPolicy({
        ...github,
        durableSnapshotProof: {
          ...proof,
          rows: proof.rows.slice(0, 9),
        },
      }),
    ).toBe(false);
    expect(
      providerMeetsProductionBlockingPolicy({
        ...github,
        durableSnapshotProof: undefined,
      }),
    ).toBe(false);
  });

  it("accepts bounded HN and X inventories without treating desired depth as an exact minimum", () => {
    expect(
      providerMeetsProductionBlockingPolicy({
        providerKey: "hacker-news",
        status: "succeeded",
        observability: observation({
          target: 100,
          collected: 71,
          evaluated: 71,
          coverageRatio: 0.71,
          reasons: ["target_shortfall"],
        }),
      }),
    ).toBe(true);
    expect(
      providerMeetsProductionBlockingPolicy({
        providerKey: "x-twitter",
        status: "succeeded",
        observability: observation({
          target: 25,
          collected: 22,
          evaluated: 22,
          coverageRatio: 0.88,
          reasons: ["target_shortfall"],
        }),
      }),
    ).toBe(true);
  });

  it("still blocks unavailable, stale, rate-limited or insufficient inventories", () => {
    expect(
      providerMeetsProductionBlockingPolicy({
        providerKey: "x-twitter",
        status: "succeeded",
        observability: observation({
          target: 25,
          collected: 19,
          evaluated: 19,
          coverageRatio: 0.76,
          reasons: ["target_shortfall"],
        }),
      }),
    ).toBe(false);
    expect(
      providerMeetsProductionBlockingPolicy({
        providerKey: "hacker-news",
        status: "succeeded",
        observability: observation({
          target: 100,
          collected: 80,
          evaluated: 80,
          coverageRatio: 0.8,
          reasons: ["target_shortfall", "freshness_lag_exceeded"],
        }),
      }),
    ).toBe(false);
    expect(
      providerMeetsProductionBlockingPolicy({
        providerKey: "reddit",
        status: "failed",
        observability: observation({
          target: 100,
          collected: 100,
          evaluated: 100,
          coverageRatio: 1,
          reasons: [],
        }),
      }),
    ).toBe(false);
  });

  it("keeps provider minimums aligned with accepted scan policies", () => {
    expect(productionCollectionThresholds).toMatchObject({
      githubTrendingFeedItems: 10,
      xTwitterVisibleFeedItems: 20,
      xTwitterCollectedFeedItems: 20,
      xCollectorCompletedRunRatePercent: 80,
      xCollectorUsableRunRatePercent: 80,
    });
  });

  it("replaces the legacy exact-target gate when recalculating persisted proof", () => {
    const scans = [
      {
        providerKey: "hacker-news" as const,
        status: "succeeded" as const,
        observability: observation({
          target: 100,
          collected: 71,
          evaluated: 71,
          coverageRatio: 0.71,
          reasons: ["target_shortfall"],
        }),
      },
    ];

    expect(
      recalculateProductionBlockingPolicyGates(
        {
          everyRequestedProviderMeetsCollectionSlo: false,
          providerRetriesAreBounded: true,
        },
        scans,
      ),
    ).toEqual({
      everyRequestedProviderMeetsBlockingCoveragePolicy: true,
      providerRetriesAreBounded: true,
    });
  });
});

const observation = (params: {
  readonly target: number;
  readonly collected: number;
  readonly evaluated: number;
  readonly outsideWindow?: number;
  readonly coverageRatio: number;
  readonly reasons: ProviderCollectionObservation["slo"]["reasons"];
}): ProviderCollectionObservation => ({
  targetItemCount: params.target,
  collectedItemCount: params.collected,
  acceptedItemCount: params.evaluated,
  insertedItemCount: params.evaluated,
  outsideWindowItemCount: params.outsideWindow ?? 0,
  paginationDuplicateItemCount: 0,
  storageDuplicateItemCount: 0,
  totalDuplicateItemCount: 0,
  pageCount: 1,
  paginationStopReason: "single_page",
  rateLimitEventCount: 0,
  coverageState: params.reasons.length === 0 ? "complete" : "partial",
  slo: {
    met: params.reasons.length === 0,
    targetItemCount: params.target,
    evaluatedItemCount: params.evaluated,
    coverageRatio: params.coverageRatio,
    maxFreshnessLagSeconds: 21_600,
    reasons: params.reasons,
    retryDisposition: params.reasons.length === 0 ? "none" : "immediate",
  },
  freshness: {},
});

const certifiedDurableProof = () =>
  reuseGitHubTrendingDurableSnapshot({
    reader: new InMemoryGitHubTrendingDurableSnapshotReader(
      durableCandidates(),
    ),
    tenantId: "tenant-a",
    workspaceId: "workspace-a",
    sourceBindingId: "binding-a",
    requestedUtcDay: "2026-07-23",
    observedThrough: new Date("2026-07-24T00:05:00.000Z"),
  });

const durableCandidates = (): GitHubTrendingDurableSnapshotCandidate[] =>
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
