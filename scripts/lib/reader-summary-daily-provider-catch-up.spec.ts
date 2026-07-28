import {
  defaultCleanRealDayCollectionProviderKeys,
  type CleanRealDayCollectionProviderKey,
  type CleanRealDayCollectionReport,
} from "./clean-real-day-collection-report";
import {
  catchUpCanSpendXReadinessBudget,
  mergeDailyProviderCatchUpEvidence,
  planDailyProviderCatchUp,
} from "./reader-summary-daily-provider-catch-up";

const evaluatedAt = new Date("2026-07-27T12:00:00.000Z");

describe("daily reader-summary provider catch-up", () => {
  it("collects every provider for a new day", () => {
    expect(
      planDailyProviderCatchUp({
        collectionDate: "2026-07-27",
        evaluatedAt,
        existingReport: null,
      }).providerKeysToCollect,
    ).toEqual(defaultCleanRealDayCollectionProviderKeys);
  });

  it("retries only providers that are missing, failed, or not ready", () => {
    const existingReport = report([
      readyScan("github-trending-page"),
      readyScan("hacker-news"),
      readyScan("reddit"),
      readyScan("rss"),
      failedScan("x-twitter"),
    ]);
    const plan = planDailyProviderCatchUp({
      collectionDate: "2026-07-27",
      evaluatedAt,
      existingReport,
    });

    expect(plan.completedProviderKeys).toEqual([
      "github-trending-page",
      "hacker-news",
      "reddit",
      "rss",
    ]);
    expect(plan.providerKeysToCollect).toEqual(["x-twitter"]);
  });

  it("does not reuse completed providers from another day", () => {
    const existingReport = report(
      defaultCleanRealDayCollectionProviderKeys.map(readyScan),
      "2026-07-26",
    );

    expect(
      planDailyProviderCatchUp({
        collectionDate: "2026-07-27",
        evaluatedAt,
        existingReport,
      }).providerKeysToCollect,
    ).toEqual(defaultCleanRealDayCollectionProviderKeys);
  });

  it("fails closed instead of reusing a report with a mismatched day window", () => {
    const baseReport = report(
      defaultCleanRealDayCollectionProviderKeys.map(readyScan),
    );
    const existingReport = {
      ...baseReport,
      inputs: {
        ...baseReport.inputs,
        targetPublishedWindow: {
          ...baseReport.inputs.targetPublishedWindow,
          endExclusive: "2026-07-29T00:00:00.000Z",
        },
      },
    };

    expect(() =>
      planDailyProviderCatchUp({
        collectionDate: "2026-07-27",
        evaluatedAt,
        existingReport,
      }),
    ).toThrow("unsupported format or day window");
  });

  it("merges retried provider evidence without replacing completed providers", () => {
    const previous = report([
      readyScan("github-trending-page"),
      readyScan("hacker-news"),
      readyScan("reddit"),
      readyScan("rss"),
      failedScan("x-twitter"),
    ]);
    const plan = planDailyProviderCatchUp({
      collectionDate: "2026-07-27",
      evaluatedAt,
      existingReport: previous,
    });
    const replacement = readyScan("x-twitter");
    const merged = mergeDailyProviderCatchUpEvidence({
      plan,
      collectedTargets: [target("x-twitter")],
      collectedScans: [replacement],
    });

    expect(merged.scans).toHaveLength(5);
    expect(merged.scans[0]).toBe(previous.scans[0]);
    expect(merged.scans[4]).toBe(replacement);
  });

  it("fails closed if acquisition returns providers outside the retry plan", () => {
    const previous = report([
      readyScan("github-trending-page"),
      readyScan("hacker-news"),
      readyScan("reddit"),
      readyScan("rss"),
      failedScan("x-twitter"),
    ]);
    const plan = planDailyProviderCatchUp({
      collectionDate: "2026-07-27",
      evaluatedAt,
      existingReport: previous,
    });

    expect(() =>
      mergeDailyProviderCatchUpEvidence({
        plan,
        collectedTargets: [target("reddit")],
        collectedScans: [readyScan("reddit")],
      }),
    ).toThrow("exactly match planned providers");
  });

  it("spends the X readiness wait only when X is the sole remaining provider", () => {
    const xOnly = planDailyProviderCatchUp({
      collectionDate: "2026-07-27",
      evaluatedAt,
      existingReport: report([
        readyScan("github-trending-page"),
        readyScan("hacker-news"),
        readyScan("reddit"),
        readyScan("rss"),
        failedScan("x-twitter"),
      ]),
    });
    const blockingProviders = planDailyProviderCatchUp({
      collectionDate: "2026-07-27",
      evaluatedAt,
      existingReport: report([
        readyScan("github-trending-page"),
        failedScan("hacker-news"),
        failedScan("reddit"),
        readyScan("rss"),
        failedScan("x-twitter"),
      ]),
    });

    expect(catchUpCanSpendXReadinessBudget(xOnly)).toBe(true);
    expect(catchUpCanSpendXReadinessBudget(blockingProviders)).toBe(false);
  });

  it("keeps strict explicit GitHub unavailability terminal for a closed day", () => {
    const existingReport = report([
      explicitUnavailableGitHubScan(),
      readyScan("hacker-news"),
      readyScan("reddit"),
      readyScan("rss"),
      readyScan("x-twitter"),
    ]);
    existingReport.targetWindow.providerCounts["github-trending-page"] = 0;
    const plan = planDailyProviderCatchUp({
      collectionDate: "2026-07-27",
      evaluatedAt: new Date("2026-07-28T01:00:00.000Z"),
      existingReport,
    });

    expect(plan.providerKeysToCollect).toEqual([]);
    expect(plan.providerStates[0]).toMatchObject({
      providerKey: "github-trending-page",
      state: "unavailable",
      evidence: "explicit_unavailable",
      policy: "accepted",
    });
  });
});

function report(
  scans: CleanRealDayCollectionReport["scans"],
  collectionDate = "2026-07-27",
): CleanRealDayCollectionReport {
  const providerCounts = Object.fromEntries(
    scans.map((scan) => [scan.providerKey, 10]),
  );
  return {
    schemaVersion: 1,
    artifactFormat: "reader-summary-clean-real-day-collection-v1",
    generatedBy: "test",
    model: {
      mode: "targeted_real_binding_collection",
      liveNetwork: true,
      liveNetworkProviderKeys: defaultCleanRealDayCollectionProviderKeys,
      durableSnapshotReuseProviderKeys: [],
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
      startedAt: `${collectionDate}T01:00:00.000Z`,
      completedAt: `${collectionDate}T02:00:00.000Z`,
      collectionDate,
    },
    targets: defaultCleanRealDayCollectionProviderKeys.map(target),
    scans,
    freshWindow: windowProof(providerCounts),
    targetWindow: windowProof(providerCounts),
    qualityGates: {},
    blockingPassed: false,
  };
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
  const targetItemCount =
    providerKey === "github-trending-page" ? 10 : 100;
  return {
    providerKey,
    bindingFingerprint: `binding-${providerKey}`,
    acquisitionMode: "live_collection",
    attemptCount: 1,
    status: "succeeded",
    fetched: targetItemCount,
    inserted: targetItemCount,
    projected: targetItemCount,
    skippedDuplicates: 0,
    warningCount: 0,
    observability: {
      acquisitionMode: "live_collection",
      targetItemCount,
      collectedItemCount: targetItemCount,
      acceptedItemCount: targetItemCount,
      insertedItemCount: targetItemCount,
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
        targetItemCount,
        evaluatedItemCount: targetItemCount,
        coverageRatio: 1,
        reasons: [],
        retryDisposition: "none",
      },
      freshness: {},
    },
  };
}

function failedScan(
  providerKey: CleanRealDayCollectionProviderKey,
): CleanRealDayCollectionReport["scans"][number] {
  return {
    ...readyScan(providerKey),
    status: "failed",
    observability: {
      ...readyScan(providerKey).observability,
      coverageState: "degraded",
      slo: {
        ...readyScan(providerKey).observability.slo,
        met: false,
        reasons: ["provider_unavailable"],
        retryDisposition: "delayed",
      },
    },
  };
}

function explicitUnavailableGitHubScan(): CleanRealDayCollectionReport["scans"][number] {
  const scan = failedScan("github-trending-page");
  return {
    ...scan,
    acquisitionMode: "durable_snapshot_reuse",
    failureFingerprint: "github-unavailable",
    observability: {
      ...scan.observability,
      acquisitionMode: "durable_snapshot_reuse",
      targetItemCount: 10,
      collectedItemCount: 0,
      acceptedItemCount: 0,
      insertedItemCount: 0,
      totalDuplicateItemCount: 0,
      pageCount: 0,
      paginationStopReason: "failed",
      coverageState: "unavailable",
      slo: {
        met: false,
        targetItemCount: 10,
        evaluatedItemCount: 0,
        coverageRatio: 0,
        maxFreshnessLagSeconds: 21_600,
        reasons: ["target_shortfall", "provider_unavailable"],
        retryDisposition: "immediate",
      },
      freshness: {},
    },
  };
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
