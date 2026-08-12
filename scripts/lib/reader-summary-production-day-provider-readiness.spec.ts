import {
  type CleanRealDayCollectionProviderKey,
  type CleanRealDayCollectionReport,
  defaultCleanRealDayCollectionProviderKeys,
} from "./clean-real-day-collection-report";
import {
  githubTrendingDurableSnapshotBindingFingerprint,
  InMemoryGitHubTrendingDurableSnapshotReader,
  reuseGitHubTrendingDurableSnapshot,
  type GitHubTrendingDurableSnapshotCandidate,
  type GitHubTrendingDurableSnapshotProof,
} from "./github-trending-durable-snapshot-reuse";
import {
  type ProductionDayDatabaseQualityReport,
  resolveProductionDayProviderReadiness,
} from "./reader-summary-production-day-provider-readiness";
import { durableSnapshotReuseProviderCollectionObservation } from "./provider-collection-observability";

const collectionDate = "2026-07-27";
const evaluatedAt = new Date("2026-07-28T01:00:00.000Z");
const partialCounts = {
  "github-trending-page": 10,
  "hacker-news": 87,
  reddit: 99,
  rss: 47,
  "x-twitter": 58,
} as const;

describe("production-day provider readiness admission", () => {
  let githubProof: GitHubTrendingDurableSnapshotProof;

  beforeAll(async () => {
    githubProof = await certifiedGitHubProof();
  });

  it("admits a complete summary only with complete DB counts and exact-day GitHub proof", () => {
    const report = collectionReport(githubProof);
    const result = resolveProductionDayProviderReadiness({
      collectionDate,
      evaluatedAt,
      qualityReport: qualityReport(report.targetWindow.providerCounts),
      collectionReport: report,
    });

    expect(result.status).toBe("complete");
    expect(result.summaryPolicy).toBe("allowed");
    expect(result.diagnosticsOwner).toBe(
      "postgres_feed_items_published_window",
    );
    expect(result.providers).toHaveLength(5);
    expect(result.providers[0]).toMatchObject({
      providerKey: "github-trending-page",
      state: "complete",
      evidence: "exact_day_durable_snapshot",
      databaseFeedItemCount: 10,
    });
  });

  it("terminalizes the Jul 27 bounded shortfalls without admitting a summary", () => {
    const report = collectionReport(githubProof, partialCounts);
    const result = resolveProductionDayProviderReadiness({
      collectionDate,
      evaluatedAt,
      qualityReport: qualityReport(partialCounts),
      collectionReport: report,
    });

    expect(result.status).toBe("partial");
    expect(result.summaryPolicy).toBe("blocked");
    expect(result.readiness.policy).toBe("blocked");
    expect(result.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          providerKey: "hacker-news",
          databaseFeedItemCount: 87,
          minimumFeedItemCount: 70,
          state: "partial",
        }),
        expect.objectContaining({
          providerKey: "reddit",
          databaseFeedItemCount: 99,
          minimumFeedItemCount: 50,
          state: "partial",
        }),
        expect.objectContaining({
          providerKey: "rss",
          databaseFeedItemCount: 47,
          minimumFeedItemCount: 25,
          state: "partial",
        }),
        expect.objectContaining({
          providerKey: "x-twitter",
          databaseFeedItemCount: 58,
          minimumFeedItemCount: 20,
          state: "partial",
        }),
      ]),
    );
  });

  it("terminalizes strict exhausted non-GitHub unavailability with a DB zero", () => {
    const report = collectionReport(githubProof);
    replaceProviderScan(report, unavailableScan("reddit"));
    report.targetWindow.providerCounts.reddit = 0;
    const counts = { ...report.targetWindow.providerCounts };
    const result = resolveProductionDayProviderReadiness({
      collectionDate,
      evaluatedAt,
      qualityReport: qualityReport(counts),
      collectionReport: report,
    });

    expect(result.status).toBe("unavailable");
    expect(result.summaryPolicy).toBe("blocked");
    expect(result.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          providerKey: "reddit",
          state: "unavailable",
          evidence: "explicit_unavailable",
          databaseFeedItemCount: 0,
        }),
      ]),
    );
  });

  it("normalizes an omitted collection count to zero for explicit GitHub unavailability", () => {
    const report = collectionReport(githubProof);
    replaceProviderScan(report, unavailableGitHubScan());
    delete report.targetWindow.providerCounts["github-trending-page"];
    const result = resolveProductionDayProviderReadiness({
      collectionDate,
      evaluatedAt,
      qualityReport: qualityReport(report.targetWindow.providerCounts),
      collectionReport: report,
    });

    expect(result.status).toBe("unavailable");
    expect(result.summaryPolicy).toBe("blocked");
    expect(result.readiness.ready).toBe(true);
    expect(result.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          providerKey: "github-trending-page",
          state: "unavailable",
          evidence: "explicit_unavailable",
          databaseFeedItemCount: 0,
          collectionFeedItemCount: 0,
        }),
      ]),
    );
  });

  it("fails closed when a positive DB count has no collection count", () => {
    const report = collectionReport(githubProof);
    delete report.targetWindow.providerCounts["github-trending-page"];
    const result = resolveProductionDayProviderReadiness({
      collectionDate,
      evaluatedAt,
      qualityReport: qualityReport({
        ...report.targetWindow.providerCounts,
        "github-trending-page": 10,
      }),
      collectionReport: report,
    });

    expect(result.status).toBe("blocked");
    expect(result.summaryPolicy).toBe("blocked");
    expect(result.providers).toEqual([]);
  });

  it("fails closed for stale DB provenance, count mismatch, weak inventory, or unverified GitHub", () => {
    const partial = collectionReport(githubProof, partialCounts);
    const stale = {
      ...qualityReport(partialCounts),
      collectionDate: "2026-07-26",
    };
    const mismatched = qualityReport({
      ...partialCounts,
      reddit: 98,
    });
    const weak = collectionReport(githubProof, {
      ...partialCounts,
      rss: 24,
    });
    const noGitHubProof = collectionReport(githubProof, partialCounts);
    replaceProviderScan(
      noGitHubProof,
      partialScan("github-trending-page", 10, 10),
    );

    for (const candidate of [
      {
        qualityReport: stale,
        collectionReport: partial,
      },
      {
        qualityReport: mismatched,
        collectionReport: partial,
      },
      {
        qualityReport: qualityReport(weak.targetWindow.providerCounts),
        collectionReport: weak,
      },
      {
        qualityReport: qualityReport(partialCounts),
        collectionReport: noGitHubProof,
      },
    ]) {
      expect(
        resolveProductionDayProviderReadiness({
          collectionDate,
          evaluatedAt,
          ...candidate,
        }).status,
      ).toBe("blocked");
    }
  });
});

const qualityReport = (
  counts: Readonly<Record<string, number>>,
): ProductionDayDatabaseQualityReport => ({
  schemaVersion: 1,
  artifactFormat: "yesterday-social-collection-quality-report-v1",
  generatedBy: "npm run check:yesterday-social-collection-quality",
  collectionDate,
  model: { liveNetwork: false },
  inputs: {
    postgresFeedWindow: {
      startInclusive: `${collectionDate}T00:00:00.000Z`,
      endExclusive: "2026-07-28T00:00:00.000Z",
    },
  },
  providerReports: defaultCleanRealDayCollectionProviderKeys.flatMap(
    (providerKey) => {
      const count = counts[providerKey] ?? 0;
      return count === 0 ? [] : [{ providerKey, feedItemCount: count }];
    },
  ),
});

const collectionReport = (
  githubProof: GitHubTrendingDurableSnapshotProof,
  counts: Readonly<Record<string, number>> = {
    "github-trending-page": 10,
    "hacker-news": 100,
    reddit: 100,
    rss: 50,
    "x-twitter": 100,
  },
): CleanRealDayCollectionReport => {
  const providerCounts = { ...counts };
  const scans = defaultCleanRealDayCollectionProviderKeys.map((providerKey) =>
    providerKey === "github-trending-page"
      ? githubScan(githubProof)
      : counts[providerKey] === targetCount(providerKey)
        ? completeScan(providerKey)
        : partialScan(
            providerKey,
            targetCount(providerKey),
            counts[providerKey] ?? 0,
          ),
  );
  return {
    schemaVersion: 1,
    artifactFormat: "reader-summary-clean-real-day-collection-v1",
    generatedBy: "npm run run:reader-summary-clean-real-day-collection",
    model: {
      mode: "targeted_real_binding_collection",
      liveNetwork: true,
      liveNetworkProviderKeys: defaultCleanRealDayCollectionProviderKeys.filter(
        (providerKey) => providerKey !== "github-trending-page",
      ),
      durableSnapshotReuseProviderKeys: ["github-trending-page"],
      rawProviderPayloadPersistedInReport: false,
      rawPostTextPersistedInReport: false,
      rawProviderConfigPersistedInReport: false,
    },
    inputs: {
      database: "local-postgres",
      providerKeys: defaultCleanRealDayCollectionProviderKeys,
      xCollectorConfigured: true,
      targetPublishedWindow: {
        startInclusive: `${collectionDate}T00:00:00.000Z`,
        endExclusive: "2026-07-28T00:00:00.000Z",
      },
    },
    run: {
      startedAt: "2026-07-28T00:05:00.000Z",
      completedAt: "2026-07-28T00:10:00.000Z",
      collectionDate,
    },
    targets: defaultCleanRealDayCollectionProviderKeys.map((providerKey) => ({
      providerKey,
      bindingFingerprint: `binding-${providerKey}`,
      interestFingerprint: `interest-${providerKey}`,
      workspaceFingerprint: "workspace",
      plannerEnabled: false,
      canaryRollout: false,
    })),
    scans,
    freshWindow: windowProof(providerCounts),
    targetWindow: windowProof(providerCounts),
    qualityGates: collectionQualityGates(),
    blockingPassed: false,
  };
};

const completeScan = (
  providerKey: CleanRealDayCollectionProviderKey,
): CleanRealDayCollectionReport["scans"][number] =>
  partialScan(providerKey, targetCount(providerKey), targetCount(providerKey));

const partialScan = (
  providerKey: CleanRealDayCollectionProviderKey,
  target: number,
  count: number,
): CleanRealDayCollectionReport["scans"][number] => ({
  providerKey,
  bindingFingerprint: `binding-${providerKey}`,
  acquisitionMode: "live_collection",
  attemptCount: count === target ? 1 : 3,
  status: "succeeded",
  fetched: count,
  inserted: count,
  projected: count,
  skippedDuplicates: 0,
  warningCount: 0,
  observability: {
    acquisitionMode: "live_collection",
    targetItemCount: target,
    collectedItemCount: count,
    acceptedItemCount: count,
    insertedItemCount: count,
    outsideWindowItemCount: 0,
    paginationDuplicateItemCount: 0,
    storageDuplicateItemCount: 0,
    totalDuplicateItemCount: 0,
    pageCount: 1,
    paginationStopReason:
      count === target ? "target_reached" : "no_next_cursor",
    rateLimitEventCount: 0,
    coverageState: count === target ? "complete" : "partial",
    slo: {
      met: count === target,
      targetItemCount: target,
      evaluatedItemCount: count,
      coverageRatio: count / target,
      reasons: count === target ? [] : ["target_shortfall"],
      retryDisposition: count === target ? "none" : "immediate",
    },
    freshness: {},
  },
});

const githubScan = (
  proof: GitHubTrendingDurableSnapshotProof,
): CleanRealDayCollectionReport["scans"][number] => ({
  providerKey: "github-trending-page",
  bindingFingerprint: githubTrendingDurableSnapshotBindingFingerprint(
    proof.group.sourceBindingId,
  ),
  acquisitionMode: "durable_snapshot_reuse",
  attemptCount: 1,
  status: "succeeded",
  fetched: 0,
  inserted: 0,
  projected: 0,
  skippedDuplicates: 0,
  warningCount: 0,
  observability: durableSnapshotReuseProviderCollectionObservation({
    itemCount: 10,
    newestPublishedAt: new Date(proof.group.publishedAt),
    targetWindowEndedAt: new Date("2026-07-28T00:00:00.000Z"),
  }),
  durableSnapshotProof: proof,
});

const unavailableScan = (
  providerKey: Exclude<
    CleanRealDayCollectionProviderKey,
    "github-trending-page"
  >,
): CleanRealDayCollectionReport["scans"][number] => {
  const scan = partialScan(providerKey, targetCount(providerKey), 0);
  return {
    ...scan,
    attemptCount: 3,
    status: "failed",
    failureFingerprint: `${providerKey}-unavailable`,
    observability: {
      ...scan.observability,
      pageCount: 0,
      paginationStopReason: "failed",
      coverageState: "unavailable",
      slo: {
        ...scan.observability.slo,
        reasons: ["target_shortfall", "provider_unavailable"],
      },
    },
  };
};

const unavailableGitHubScan =
  (): CleanRealDayCollectionReport["scans"][number] => {
    const scan = partialScan("github-trending-page", 10, 0);
    return {
      ...scan,
      acquisitionMode: "durable_snapshot_reuse",
      attemptCount: 1,
      status: "failed",
      failureFingerprint: "github-trending-page-unavailable",
      observability: {
        ...scan.observability,
        acquisitionMode: "durable_snapshot_reuse",
        pageCount: 0,
        paginationStopReason: "failed",
        coverageState: "unavailable",
        slo: {
          ...scan.observability.slo,
          coverageRatio: 0,
          reasons: ["target_shortfall", "provider_unavailable"],
        },
      },
    };
  };

const replaceProviderScan = (
  report: CleanRealDayCollectionReport,
  replacement: CleanRealDayCollectionReport["scans"][number],
): void => {
  const scans = report.scans as CleanRealDayCollectionReport["scans"][number][];
  const index = scans.findIndex(
    (scan) => scan.providerKey === replacement.providerKey,
  );
  scans[index] = replacement;
};

const targetCount = (
  providerKey: CleanRealDayCollectionProviderKey,
): number =>
  providerKey === "github-trending-page"
    ? 10
    : providerKey === "rss"
      ? 50
      : 100;

const windowProof = (
  providerCounts: Record<string, number>,
): CleanRealDayCollectionReport["freshWindow"] => ({
  feedItemCount: Object.values(providerCounts).reduce(
    (total, count) => total + count,
    0,
  ),
  providerCounts,
  newestItemAtByProvider: {},
  sourceQueryLaneCoverageByProvider: {},
  distinctSourceQueryLaneCountByProvider: {},
  orphanInterestCount: 0,
  orphanSourceBindingCount: 0,
  interestSnapshotCoverage: 1,
  sourceBindingSnapshotCoverage: 1,
  sourceQueryLaneCoverage: 1,
  distinctSourceQueryLaneCount: 0,
});

const collectionQualityGates = (): Readonly<Record<string, boolean>> => ({
  targetBindingsPresent: true,
  everyRequestedProviderSucceeded: false,
  targetWindowFeedItemsAvailable: true,
  everyRequestedProviderHasTargetItems: false,
  noFreshOrphanInterestReferences: true,
  noFreshOrphanSourceBindingReferences: true,
  targetInterestSnapshotsPersisted: true,
  targetSourceBindingSnapshotsPersisted: true,
  freshSourceQueryLaneCoverageComplete: true,
  freshMultipleQueryLanesObserved: true,
  targetSourceQueryLaneCoverageComplete: true,
  targetMultipleQueryLanesObserved: true,
  providerCollectionObservabilityComplete: true,
  providerAcquisitionModesAreConsistent: true,
  everyRequestedProviderMeetsBlockingCoveragePolicy: false,
  providerRetriesAreBounded: true,
  durableSnapshotReuseIsSingleAttempt: true,
  durableSnapshotProofMatchesRequestedDay: true,
  partialProviderCoverageIsExplicit: true,
  noRawSecretFragments: true,
});

const certifiedGitHubProof = (): Promise<GitHubTrendingDurableSnapshotProof> =>
  reuseGitHubTrendingDurableSnapshot({
    reader: new InMemoryGitHubTrendingDurableSnapshotReader(
      durableCandidates(),
    ),
    tenantId: "tenant-a",
    workspaceId: "workspace-a",
    sourceBindingId: "binding-a",
    requestedUtcDay: collectionDate,
    observedThrough: evaluatedAt,
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
      fetchStartedAt: "2026-07-27T23:50:00.000Z",
      feedFetchStartedAt: "2026-07-27T23:50:00.000Z",
      checkedAt: "2026-07-27T23:59:00.000Z",
      feedCheckedAt: "2026-07-27T23:59:00.000Z",
      publishedAt: "2026-07-27T23:59:00.000Z",
      sourcePublishedAt: "2026-07-27T23:59:00.000Z",
      feedObservedAt: "2026-07-28T00:00:01.000Z",
      sourceObservedAt: "2026-07-28T00:00:01.000Z",
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
