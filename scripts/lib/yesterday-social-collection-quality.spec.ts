import {
  defaultCleanRealDayCollectionProviderKeys,
  type CleanRealDayCollectionProviderKey,
  type CleanRealDayCollectionReport,
} from "./clean-real-day-collection-report";
import { evaluateYesterdaySocialProviderReadiness } from "./yesterday-social-collection-quality";

const collectionDate = "2026-07-27";
const evaluatedAt = new Date("2026-07-27T12:00:00.000Z");

describe("yesterday social required-provider readiness", () => {
  it("passes only when quality rows and explicit collection evidence agree", () => {
    const readiness = evaluateYesterdaySocialProviderReadiness({
      expectedCollectionDate: collectionDate,
      evaluatedAt,
      report: qualityReport(),
      collectionReport: collectionReport(),
    });

    expect(readiness.ready).toBe(true);
    expect(readiness.policy).toBe("complete");
    expect(readiness.readyProviderKeys).toEqual(
      defaultCleanRealDayCollectionProviderKeys,
    );
    expect(readiness.barrierMessage).toBeNull();
    expect(readiness.retrySchedule).toBeNull();
  });

  it.each(defaultCleanRealDayCollectionProviderKeys)(
    "fails closed and names missing provider %s",
    (providerKey) => {
      const providers = defaultCleanRealDayCollectionProviderKeys.filter(
        (candidate) => candidate !== providerKey,
      );
      const readiness = evaluateYesterdaySocialProviderReadiness({
        expectedCollectionDate: collectionDate,
        evaluatedAt,
        report: qualityReport(providers),
        collectionReport: collectionReport(providers),
      });

      expect(readiness.ready).toBe(false);
      expect(readiness.missingProviderKeys).toContain(providerKey);
      expect(readiness.blockingProviderKeys).toContain(providerKey);
      expect(readiness.barrierMessage).toContain(`${providerKey}=missing`);
    },
  );

  it("blocks the Jul 27 incomplete row set with a durable retry schedule", () => {
    const providers = [
      "github-trending-page",
      "rss",
      "x-twitter",
    ] as const;
    const quality = qualityReport(providers, {
      "github-trending-page": 10,
      rss: 44,
      "x-twitter": 58,
    });
    const collection = collectionReport(providers, {
      "github-trending-page": 10,
      rss: 44,
      "x-twitter": 58,
    });
    const readiness = evaluateYesterdaySocialProviderReadiness({
      expectedCollectionDate: collectionDate,
      evaluatedAt: new Date("2026-07-28T01:00:00.000Z"),
      report: quality,
      collectionReport: collection,
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.policy).toBe("blocked");
    expect(readiness.blockingProviderKeys).toEqual([
      "github-trending-page",
      "hacker-news",
      "reddit",
    ]);
    expect(readiness.readyProviderKeys).toEqual(["rss", "x-twitter"]);
    expect(readiness.providerStates[0]?.reasonCodes).toContain(
      "github_exact_day_durable_evidence_missing",
    );
    expect(readiness.retrySchedule).toEqual({
      disposition: "scheduled",
      notBefore: "2026-07-28T01:15:00.000Z",
      providerKeys: [
        "github-trending-page",
        "hacker-news",
        "reddit",
      ],
      reason: "blocking_provider_retry",
    });
  });

  it("accepts a bounded partial provider only with matching scan evidence", () => {
    const baseCollection = collectionReport();
    const collection = {
      ...baseCollection,
      scans: baseCollection.scans.map((scan) =>
        scan.providerKey === "hacker-news"
          ? partialHackerNewsScan()
          : scan,
      ),
      targetWindow: {
        ...baseCollection.targetWindow,
        providerCounts: {
          ...baseCollection.targetWindow.providerCounts,
          "hacker-news": 71,
        },
      },
    };
    const quality = qualityReport(undefined, { "hacker-news": 71 });
    const readiness = evaluateYesterdaySocialProviderReadiness({
      expectedCollectionDate: collectionDate,
      evaluatedAt,
      report: quality,
      collectionReport: collection,
    });

    expect(readiness.ready).toBe(true);
    expect(readiness.policy).toBe("explicit_partial");
    expect(readiness.partialProviderKeys).toEqual(["hacker-news"]);
    expect(readiness.providerStates[1]).toMatchObject({
      evidence: "live_collection",
      policy: "accepted",
    });
  });

  it("accepts strict explicit GitHub unavailability as partial policy", () => {
    const baseCollection = collectionReport();
    const collection = {
      ...baseCollection,
      scans: baseCollection.scans.map((scan) =>
        scan.providerKey === "github-trending-page"
          ? explicitUnavailableGitHubScan()
          : scan,
      ),
      targetWindow: {
        ...baseCollection.targetWindow,
        providerCounts: {
          ...baseCollection.targetWindow.providerCounts,
          "github-trending-page": 0,
        },
      },
    };
    const quality = qualityReport(
      defaultCleanRealDayCollectionProviderKeys.filter(
        (providerKey) => providerKey !== "github-trending-page",
      ),
    );
    const readiness = evaluateYesterdaySocialProviderReadiness({
      expectedCollectionDate: collectionDate,
      evaluatedAt: new Date("2026-07-28T01:00:00.000Z"),
      report: quality,
      collectionReport: collection,
    });

    expect(readiness.ready).toBe(true);
    expect(readiness.policy).toBe("explicit_partial");
    expect(readiness.unavailableProviderKeys).toEqual([
      "github-trending-page",
    ]);
    expect(readiness.providerStates[0]).toMatchObject({
      evidence: "explicit_unavailable",
      policy: "accepted",
    });
  });

  it("fails closed for count mismatch, duplicate, stale, and absent evidence", () => {
    const mismatch = qualityReport();
    mismatch.providerReports[1] = {
      ...mismatch.providerReports[1]!,
      feedItemCount: 9,
    };
    const duplicate = qualityReport();
    duplicate.providerReports.push({ ...duplicate.providerReports[0]! });

    expect(
      readiness(mismatch, collectionReport()).providerStates[1]?.reasonCodes,
    ).toContain("quality_provider_count_mismatch");
    expect(readiness(duplicate, collectionReport()).duplicateProviderKeys).toEqual([
      "github-trending-page",
    ]);
    expect(
      evaluateYesterdaySocialProviderReadiness({
        expectedCollectionDate: "2026-07-28",
        evaluatedAt,
        report: qualityReport(),
        collectionReport: collectionReport(),
      }).ready,
    ).toBe(false);
    expect(
      evaluateYesterdaySocialProviderReadiness({
        expectedCollectionDate: collectionDate,
        evaluatedAt,
        report: null,
        collectionReport: null,
      }).ready,
    ).toBe(false);
  });

  it("accepts only monotonic quality-count growth after successful scan evidence", () => {
    const grown = qualityReport(undefined, { reddit: 245, rss: 128 });
    const baseCollection = collectionReport();
    expect(readiness(grown, baseCollection).ready).toBe(true);

    const decreased = qualityReport(undefined, { reddit: 99 });
    expect(
      readiness(decreased, baseCollection).providerStates[2]?.reasonCodes,
    ).toContain("quality_provider_count_mismatch");

    const failedCollection = collectionReport();
    const reddit = failedCollection.scans.find(
      (scan) => scan.providerKey === "reddit",
    )!;
    replaceScan(failedCollection, { ...reddit, status: "failed" });
    expect(
      readiness(grown, failedCollection).providerStates[2]?.reasonCodes,
    ).toContain("quality_provider_count_mismatch");
  });
});

function readiness(
  report: ReturnType<typeof qualityReport>,
  collection: CleanRealDayCollectionReport,
) {
  return evaluateYesterdaySocialProviderReadiness({
    expectedCollectionDate: collectionDate,
    evaluatedAt,
    report,
    collectionReport: collection,
  });
}

function qualityReport(
  providerKeys: readonly CleanRealDayCollectionProviderKey[] =
    defaultCleanRealDayCollectionProviderKeys,
  counts: Readonly<Record<string, number>> = {},
): {
  collectionDate: string;
  providerReports: {
    providerKey: CleanRealDayCollectionProviderKey;
    feedItemCount: number;
  }[];
} {
  return {
    collectionDate,
    providerReports: providerKeys.map((providerKey) => ({
      providerKey,
      feedItemCount: counts[providerKey] ?? targetCount(providerKey),
    })),
  };
}

function collectionReport(
  providerKeys: readonly CleanRealDayCollectionProviderKey[] =
    defaultCleanRealDayCollectionProviderKeys,
  counts: Readonly<Record<string, number>> = {},
): CleanRealDayCollectionReport {
  const providerCounts = Object.fromEntries(
    providerKeys.map((providerKey) => [
      providerKey,
      counts[providerKey] ?? targetCount(providerKey),
    ]),
  );
  return {
    schemaVersion: 1,
    artifactFormat: "reader-summary-clean-real-day-collection-v1",
    generatedBy: "test",
    model: {
      mode: "targeted_real_binding_collection",
      liveNetwork: true,
      liveNetworkProviderKeys: providerKeys,
      durableSnapshotReuseProviderKeys: [],
      rawProviderPayloadPersistedInReport: false,
      rawPostTextPersistedInReport: false,
      rawProviderConfigPersistedInReport: false,
    },
    inputs: {
      database: "local-postgres",
      providerKeys,
      xCollectorConfigured: true,
      targetPublishedWindow: {
        startInclusive: `${collectionDate}T00:00:00.000Z`,
        endExclusive: "2026-07-28T00:00:00.000Z",
      },
    },
    run: {
      startedAt: `${collectionDate}T01:00:00.000Z`,
      completedAt: `${collectionDate}T02:00:00.000Z`,
      collectionDate,
    },
    targets: providerKeys.map(target),
    scans: providerKeys.map(readyScan),
    freshWindow: windowProof(providerCounts),
    targetWindow: windowProof(providerCounts),
    qualityGates: {},
    blockingPassed: false,
  };
}

function replaceScan(
  report: CleanRealDayCollectionReport,
  replacement: CleanRealDayCollectionReport["scans"][number],
): void {
  const scans = report.scans as CleanRealDayCollectionReport["scans"][number][];
  const index = scans.findIndex(
    (scan) => scan.providerKey === replacement.providerKey,
  );
  scans[index] = replacement;
}

function target(
  providerKey: CleanRealDayCollectionProviderKey,
): CleanRealDayCollectionReport["targets"][number] {
  return {
    providerKey,
    bindingFingerprint: `binding-${providerKey}`,
    interestFingerprint: `interest-${providerKey}`,
    workspaceFingerprint: "workspace",
    plannerEnabled: false,
    canaryRollout: false,
  };
}

function readyScan(
  providerKey: CleanRealDayCollectionProviderKey,
): CleanRealDayCollectionReport["scans"][number] {
  const count = targetCount(providerKey);
  return {
    providerKey,
    bindingFingerprint: `binding-${providerKey}`,
    acquisitionMode: "live_collection",
    attemptCount: 1,
    status: "succeeded",
    fetched: count,
    inserted: count,
    projected: count,
    skippedDuplicates: 0,
    warningCount: 0,
    observability: {
      acquisitionMode: "live_collection",
      targetItemCount: count,
      collectedItemCount: count,
      acceptedItemCount: count,
      insertedItemCount: count,
      outsideWindowItemCount: 0,
      paginationDuplicateItemCount: 0,
      storageDuplicateItemCount: 0,
      totalDuplicateItemCount: 0,
      pageCount: 1,
      paginationStopReason: "target_reached",
      rateLimitEventCount: 0,
      coverageState: "complete",
      slo: {
        met: true,
        targetItemCount: count,
        evaluatedItemCount: count,
        coverageRatio: 1,
        maxFreshnessLagSeconds: 21_600,
        reasons: [],
        retryDisposition: "none",
      },
      freshness: {},
    },
  };
}

function partialHackerNewsScan(): CleanRealDayCollectionReport["scans"][number] {
  const scan = readyScan("hacker-news");
  return {
    ...scan,
    fetched: 71,
    inserted: 71,
    projected: 71,
    observability: {
      ...scan.observability,
      collectedItemCount: 71,
      acceptedItemCount: 71,
      insertedItemCount: 71,
      coverageState: "partial",
      slo: {
        ...scan.observability.slo,
        met: false,
        evaluatedItemCount: 71,
        coverageRatio: 0.71,
        reasons: ["target_shortfall"],
        retryDisposition: "immediate",
      },
    },
  };
}

function explicitUnavailableGitHubScan(): CleanRealDayCollectionReport["scans"][number] {
  const scan = readyScan("github-trending-page");
  return {
    ...scan,
    acquisitionMode: "durable_snapshot_reuse",
    status: "failed",
    fetched: 0,
    inserted: 0,
    projected: 0,
    failureFingerprint: "github-unavailable",
    observability: {
      ...scan.observability,
      acquisitionMode: "durable_snapshot_reuse",
      collectedItemCount: 0,
      acceptedItemCount: 0,
      insertedItemCount: 0,
      pageCount: 0,
      paginationStopReason: "failed",
      coverageState: "unavailable",
      slo: {
        ...scan.observability.slo,
        met: false,
        evaluatedItemCount: 0,
        coverageRatio: 0,
        reasons: ["target_shortfall", "provider_unavailable"],
        retryDisposition: "immediate",
      },
      freshness: {},
    },
  };
}

function targetCount(
  providerKey: CleanRealDayCollectionProviderKey,
): number {
  return providerKey === "github-trending-page" ? 10 : 100;
}

function windowProof(
  providerCounts: Record<string, number>,
): CleanRealDayCollectionReport["freshWindow"] {
  return {
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
  };
}
