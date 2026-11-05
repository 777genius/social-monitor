import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import type { CleanRealDayCollectionReport } from "./clean-real-day-collection-report";
import {
  collectionArtifactPassesBlockingValidation,
  readerSummaryDailyCollectionArtifactPath,
  readerSummaryDailyCollectionArtifactTemporaryPath,
  readExactDayCollectionArtifact,
  refreshCollectionArtifactTargetWindow,
  writeCollectionArtifactAtomically,
} from "./reader-summary-clean-real-day-collection-artifact";
import { readerSummaryDailyMaintenanceScope } from "./reader-summary-daily-maintenance-scope";

describe("reader summary exact-day collection artifacts", () => {
  it("writes a durable explicit artifact for each collection date", () => {
    const directory = mkdtempSync(join(tmpdir(), "reader-summary-collection-"));
    const jul31Path = readerSummaryDailyCollectionArtifactPath({
      directory,
      collectionDate: "2026-07-31",
    });
    const aug1Path = readerSummaryDailyCollectionArtifactPath({
      directory,
      collectionDate: "2026-08-01",
    });
    try {
      writeCollectionArtifactAtomically({
        path: jul31Path,
        report: report("2026-07-31"),
        expectedScope: readerSummaryDailyMaintenanceScope,
      });
      writeCollectionArtifactAtomically({
        path: aug1Path,
        report: report("2026-08-01"),
        expectedScope: readerSummaryDailyMaintenanceScope,
      });

      expect(jul31Path).not.toBe(aug1Path);
      expect(jul31Path).toContain("2026-07-31");
      expect(aug1Path).toContain("2026-08-01");
      expect(
        readExactDayCollectionArtifact({
          path: jul31Path,
          collectionDate: "2026-07-31",
          expectedScope: readerSummaryDailyMaintenanceScope,
        })?.run.collectionDate,
      ).toBe("2026-07-31");
      expect(
        readExactDayCollectionArtifact({
          path: aug1Path,
          collectionDate: "2026-08-01",
          expectedScope: readerSummaryDailyMaintenanceScope,
        })?.run.collectionDate,
      ).toBe("2026-08-01");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects a fallback tenant or workspace scope", () => {
    const directory = mkdtempSync(join(tmpdir(), "reader-summary-collection-"));
    const path = readerSummaryDailyCollectionArtifactPath({
      directory,
      collectionDate: "2026-07-31",
    });
    const fallbackScope = {
      tenantId: "00000000-0000-7000-8000-000000007101",
      workspaceId: "00000000-0000-7000-8000-000000007102",
    };
    try {
      expect(() =>
        writeCollectionArtifactAtomically({
          path,
          report: report("2026-07-31", {
            ...fallbackScope,
          }),
          expectedScope: readerSummaryDailyMaintenanceScope,
        }),
      ).toThrow("scope is not the canonical");
      expect(() =>
        writeCollectionArtifactAtomically({
          path,
          report: report("2026-07-31", readerSummaryDailyMaintenanceScope),
          expectedScope: fallbackScope as never,
        }),
      ).toThrow("scope is not canonical");
      writeCollectionArtifactAtomically({
        path,
        report: report("2026-07-31", {
          ...fallbackScope,
        }),
      });

      expect(() =>
        readExactDayCollectionArtifact({
          path,
          collectionDate: "2026-07-31",
          expectedScope: readerSummaryDailyMaintenanceScope,
        }),
      ).toThrow("scope does not match");
      expect(readFileSync(path, "utf8")).toContain("2026-07-31");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects an attempt to write one day under another day's durable path", () => {
    const directory = mkdtempSync(join(tmpdir(), "reader-summary-collection-"));
    const jul31Path = readerSummaryDailyCollectionArtifactPath({
      directory,
      collectionDate: "2026-07-31",
    });
    try {
      expect(() =>
        writeCollectionArtifactAtomically({
          path: jul31Path,
          report: report("2026-08-01"),
          expectedScope: readerSummaryDailyMaintenanceScope,
        }),
      ).toThrow("not explicit for its report date");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("enforces an exact dated path without imposing maintenance scope", () => {
    const directory = mkdtempSync(join(tmpdir(), "reader-summary-collection-"));
    const priorDayPath = readerSummaryDailyCollectionArtifactPath({
      directory,
      collectionDate: "2026-08-24",
    });
    try {
      writeCollectionArtifactAtomically({
        path: priorDayPath,
        report: report("2026-08-24"),
        requireExactDatePath: true,
      });

      expect(() =>
        readExactDayCollectionArtifact({
          path: priorDayPath,
          collectionDate: "2026-08-25",
          requireExactDatePath: true,
        }),
      ).toThrow("not explicit for its requested date");
      expect(() =>
        writeCollectionArtifactAtomically({
          path: join(
            directory,
            "reader-summary-clean-real-day-collection.v1.json",
          ),
          report: report("2026-08-25"),
          requireExactDatePath: true,
        }),
      ).toThrow("not explicit for its report date");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects a non-date artifact name before it can overwrite another day", () => {
    expect(() =>
      readerSummaryDailyCollectionArtifactPath({
        directory: "/tmp/reader-summary-collection",
        collectionDate: "2026-08-1",
      }),
    ).toThrow("exact UTC date");
  });

  it("gives concurrent artifact invocations unique temporary files in the destination directory", () => {
    const directory = mkdtempSync(join(tmpdir(), "reader-summary-collection-"));
    const path = readerSummaryDailyCollectionArtifactPath({
      directory,
      collectionDate: "2026-07-31",
    });
    try {
      const temporaryPaths = Array.from({ length: 32 }, () =>
        readerSummaryDailyCollectionArtifactTemporaryPath(path),
      );

      expect(new Set(temporaryPaths).size).toBe(temporaryPaths.length);
      expect(
        temporaryPaths.every(
          (temporaryPath) => dirname(temporaryPath) === directory,
        ),
      ).toBe(true);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("cleans a failed atomic temporary file without replacing the destination", () => {
    const directory = mkdtempSync(join(tmpdir(), "reader-summary-collection-"));
    const destination = join(directory, "occupied.json");
    mkdirSync(destination);
    try {
      expect(() =>
        writeCollectionArtifactAtomically({
          path: destination,
          report: report("2026-07-31"),
        }),
      ).toThrow();
      expect(
        readdirSync(directory).filter((entry) => entry.endsWith(".tmp")),
      ).toEqual([]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects artifact paths that traverse outside their intended directory", () => {
    const directory = mkdtempSync(join(tmpdir(), "reader-summary-collection-"));
    try {
      expect(() =>
        writeCollectionArtifactAtomically({
          path: `${directory}/../escaped.json`,
          report: report("2026-07-31"),
        }),
      ).toThrow("unsafe path segment");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("refreshes cumulative exact-day proof without repeating provider calls", () => {
    const existing = refreshableReport();
    const refreshed = refreshCollectionArtifactTargetWindow({
      report: existing,
      targetWindow: {
        ...existing.targetWindow,
        feedItemCount: 137,
        providerCounts: { "x-twitter": 137 },
        newestItemAtByProvider: {
          "x-twitter": "2026-08-27T23:58:00.000Z",
        },
      },
    });

    expect(refreshed.targetWindow.providerCounts["x-twitter"]).toBe(137);
    expect(refreshed.scans[0]?.observability.slo).toMatchObject({
      evaluatedItemCount: 137,
      coverageRatio: 1,
      reasons: ["rate_limited"],
    });
    expect(collectionArtifactPassesBlockingValidation(refreshed)).toBe(true);
  });
});

function report(
  collectionDate: string,
  scope: {
    readonly tenantId: string;
    readonly workspaceId: string;
  } = readerSummaryDailyMaintenanceScope,
): CleanRealDayCollectionReport {
  return {
    schemaVersion: 1,
    artifactFormat: "reader-summary-clean-real-day-collection-v1",
    generatedBy: "npm run run:reader-summary-clean-real-day-collection",
    inputs: {
      database: "local-postgres",
      scope,
      targetPublishedWindow: {
        startInclusive: `${collectionDate}T00:00:00.000Z`,
        endExclusive: nextUtcDate(collectionDate),
      },
    },
    run: { collectionDate },
  } as unknown as CleanRealDayCollectionReport;
}

function nextUtcDate(collectionDate: string): string {
  const value = new Date(`${collectionDate}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString();
}

function refreshableReport(): CleanRealDayCollectionReport {
  const collectionDate = "2026-08-27";
  const window = {
    feedItemCount: 34,
    providerCounts: { "x-twitter": 34 },
    newestItemAtByProvider: {
      "x-twitter": "2026-08-27T23:58:00.000Z",
    },
    sourceQueryLaneCoverageByProvider: { "x-twitter": 1 },
    distinctSourceQueryLaneCountByProvider: { "x-twitter": 7 },
    orphanInterestCount: 0,
    orphanSourceBindingCount: 0,
    interestSnapshotCoverage: 1,
    sourceBindingSnapshotCoverage: 1,
    sourceQueryLaneCoverage: 1,
    distinctSourceQueryLaneCount: 7,
  };
  const qualityGates = {
    everyRequestedProviderSucceeded: true,
    everyRequestedProviderHasTargetItems: true,
    everyRequestedProviderMeetsCollectionSlo: false,
    everyRequestedProviderMeetsBlockingCoveragePolicy: false,
    durableSnapshotProofMatchesRequestedDay: true,
    providerRetriesAreBounded: true,
    noRawSecretFragments: true,
  };

  return {
    schemaVersion: 1,
    artifactFormat: "reader-summary-clean-real-day-collection-v1",
    generatedBy: "npm run run:reader-summary-clean-real-day-collection",
    model: {
      mode: "targeted_real_binding_collection",
      liveNetwork: true,
      liveNetworkProviderKeys: ["x-twitter"],
      durableSnapshotReuseProviderKeys: [],
      rawProviderPayloadPersistedInReport: false,
      rawPostTextPersistedInReport: false,
      rawProviderConfigPersistedInReport: false,
    },
    inputs: {
      database: "local-postgres",
      providerKeys: ["x-twitter"],
      xCollectorConfigured: true,
      targetPublishedWindow: {
        startInclusive: `${collectionDate}T00:00:00.000Z`,
        endExclusive: nextUtcDate(collectionDate),
      },
    },
    run: {
      startedAt: "2026-08-28T00:15:00.000Z",
      completedAt: "2026-08-28T00:17:00.000Z",
      collectionDate,
    },
    targets: [
      {
        providerKey: "x-twitter",
        bindingFingerprint: "binding",
        interestFingerprint: "interest",
        workspaceFingerprint: "workspace",
        plannerEnabled: true,
        canaryRollout: true,
      },
    ],
    scans: [
      {
        providerKey: "x-twitter",
        bindingFingerprint: "binding",
        acquisitionMode: "live_collection",
        attemptCount: 1,
        status: "succeeded",
        fetched: 34,
        inserted: 34,
        projected: 34,
        skippedDuplicates: 0,
        warningCount: 1,
        observability: {
          targetItemCount: 100,
          collectedItemCount: 34,
          acceptedItemCount: 34,
          insertedItemCount: 34,
          outsideWindowItemCount: 0,
          paginationDuplicateItemCount: 0,
          storageDuplicateItemCount: 0,
          totalDuplicateItemCount: 0,
          pageCount: 3,
          paginationStopReason: "target_items",
          rateLimitEventCount: 1,
          coverageState: "degraded",
          slo: {
            met: false,
            targetItemCount: 100,
            evaluatedItemCount: 34,
            coverageRatio: 0.34,
            freshnessLagSeconds: 120,
            maxFreshnessLagSeconds: 21_600,
            reasons: ["target_shortfall", "rate_limited"],
            retryDisposition: "deferred",
          },
          freshness: {
            newestAcceptedPublishedAt: "2026-08-27T23:58:00.000Z",
            lagToWindowEndSeconds: 120,
          },
        },
      },
    ],
    freshWindow: window,
    targetWindow: window,
    qualityGates,
    blockingPassed: false,
  };
}
