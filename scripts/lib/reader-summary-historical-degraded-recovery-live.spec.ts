import type { ReaderSummaryGitHubProjectionItem } from "@social-monitor/summary/domain";

import { sha256 } from "./reader-summary-historical-degraded-recovery-authority";
import {
  assertHistoricalDegradedRecoveryCurrentGitHubZero,
  assertHistoricalDegradedRecoveryCurrentPreflight,
  buildHistoricalDegradedGitHubZero,
  PrismaHistoricalDegradedRecoveryLiveVerifier,
  verifyHistoricalDegradedRecoveryInputArtifacts,
} from "./reader-summary-historical-degraded-recovery-live";
import { assertHistoricalDegradedRecoveryPublicationSlot } from "./reader-summary-historical-degraded-recovery-slot";

describe("historical degraded recovery live GitHub zero", () => {
  const startedAt = new Date("2026-08-18T00:00:00.000Z");
  const endedAt = new Date("2026-08-19T00:00:00.000Z");
  const observedThrough = new Date("2026-08-22T12:00:00.000Z");

  it("does not require an available agent runtime to construct recovery verification", () => {
    expect(() => new PrismaHistoricalDegradedRecoveryLiveVerifier(
      {} as never,
    )).not.toThrow();
  });

  it("means zero rows touch the requested day, not zero later rows or bindings", () => {
    const result = {
      eligibleBindingIds: ["github-binding"],
      items: Array.from({ length: 160 }, (_, index) => laterItem(index)),
      pageCount: 2,
    };

    expect(
      buildHistoricalDegradedGitHubZero({
        startedAt,
        endedAt,
        observedThrough,
        result,
      }),
    ).toMatchObject({
      readerStatus: "ok",
      scannedItemCount: 160,
      touchingRequestedDayCount: 0,
      eligibleBindingIds: ["github-binding"],
      firstLaterObservation: "2026-08-20T00:00:00.000Z",
    });
  });

  it("accepts requested-day zero with no unrelated rows", () => {
    expect(buildHistoricalDegradedGitHubZero({
      startedAt,
      endedAt,
      observedThrough,
      result: { eligibleBindingIds: [], items: [], pageCount: 1 },
    })).toMatchObject({
      scannedItemCount: 0,
      touchingRequestedDayCount: 0,
    });
  });

  it.each(["timestamp", "identity"] as const)(
    "binds every primitive projection %s",
    (mutation) => {
      const original = laterItem(1);
      const mutated = mutation === "timestamp"
        ? { ...original, observedAt: new Date("2026-08-20T00:10:00.000Z") }
        : { ...original, feedItemId: "different-feed-identity" };
      const projectionSha256 = (item: ReaderSummaryGitHubProjectionItem) =>
        buildHistoricalDegradedGitHubZero({
          startedAt,
          endedAt,
          observedThrough,
          result: {
            eligibleBindingIds: ["github-binding"],
            items: [item],
            pageCount: 2,
          },
        }).projectionSha256;
      expect(projectionSha256(mutated)).not.toBe(projectionSha256(original));
    },
  );

  it("rejects even one row whose canonical projection envelope touches the day", () => {
    const touching = {
      ...laterItem(0),
      fetchStartedAt: new Date("2026-08-18T12:00:00.000Z"),
      checkedAt: new Date("2026-08-18T12:01:00.000Z"),
      publishedAt: new Date("2026-08-18T12:01:00.000Z"),
    };
    expect(() =>
      buildHistoricalDegradedGitHubZero({
        startedAt,
        endedAt,
        observedThrough,
        result: {
          eligibleBindingIds: ["github-binding"],
          items: [touching, ...Array.from({ length: 149 }, (_, index) => laterItem(index))],
          pageCount: 2,
        },
      }),
    ).toThrow("requested-day zero");
  });

  it("requires collection, freshly generated quality, and manifest files to bind live truth", () => {
    const dataset = {
      liveCount: 277,
      uniqueCount: 277,
      aggregateSha256: "d".repeat(64),
      providerCounts: {
        "hacker-news": 100,
        reddit: 79,
        rss: 26,
        "x-twitter": 72,
      },
    };
    const generatedAt = "2026-08-22T11:55:00.000Z";
    const manifest = Buffer.from(JSON.stringify({
      format: "reader-summary-day-dataset-manifest-v1",
      generatedAt,
      scope: {
        tenantId: "00000000-0000-7000-8000-000000006101",
        workspaceId: "00000000-0000-7000-8000-000000006102",
      },
      period: {
        startedAt: "2026-08-18T00:00:00.000Z",
        endedAt: "2026-08-19T00:00:00.000Z",
        timezone: "UTC",
      },
      dataset: {
        feedRowCount: 277,
        aggregateSha256: dataset.aggregateSha256,
        providerCounts: dataset.providerCounts,
      },
    }));
    const collection = Buffer.from(JSON.stringify({
      artifactFormat: "reader-summary-clean-real-day-collection-v1",
      run: { collectionDate: "2026-08-18" },
      inputs: {
        scope: {
          tenantId: "00000000-0000-7000-8000-000000006101",
          workspaceId: "00000000-0000-7000-8000-000000006102",
        },
      },
      targetWindow: {
        feedItemCount: 205,
        providerCounts: {
          "hacker-news": 100,
          reddit: 79,
          rss: 26,
        },
      },
      blockingPassed: true,
    }));
    const qualityGates = {
      globalXCollectionSucceeded: true,
      postgresFeedItemsAvailable: true,
      allExpectedPrimarySourcesPresent: true,
      redditVisibleFeedItemsAtLeast50: true,
      xTwitterVisibleFeedItemsMeetProductionMinimum: true,
      everyPrimaryItemHasText: true,
      everyPrimaryItemHasCanonicalUrl: true,
      primaryDuplicateRateBelowFivePercent: true,
      primaryEngagementMetadataCoverageAtLeast90Percent: true,
      primaryFreshnessP90Below48Hours: true,
      xCollectorLedgerAvailable: true,
      xCollectorRunCountAtLeast20: true,
      xCollectorCompletedRunRateMeetsProductionMinimum: true,
      xCollectorUsableRunRateMeetsProductionMinimum: true,
      xCollectorNoNonTerminalOrUnknownRuns: true,
      xCollectorLedgerJsonValid: true,
      xCollectorReturnedAtLeast500Tweets: true,
      xCollectorHasTopAndLatest: true,
      xCollectorHasStrictAndDiscoveryLanes: true,
      xCollectorDistinctQueryHashesAtLeast4: true,
      xAccountPoolStateAvailable: true,
      xAccountPoolTracksPerAccount: true,
      dayWindowAuditAvailable: true,
      observedWindowFilterIsStrict: true,
      duplicateAndLowRelevanceCountsReported: true,
      summaryArtifactAbsenceIsExplicit: true,
      noOrphanFeedInterestReferences: true,
      noOrphanFeedSourceItemReferences: true,
      noOrphanFeedSourceBindingReferences: true,
      collectionIntegrityCleanForEval: true,
      noRawSecretFragments: true,
    };
    const quality = (
      datasetSha256: string,
      options: Readonly<{
        blockingPassed?: boolean;
        gateOverrides?: Readonly<Record<string, boolean>>;
        omitGate?: string;
      }> = {},
    ) => {
      const gates: Record<string, boolean> = {
        ...qualityGates,
        ...options.gateOverrides,
      };
      if (options.omitGate !== undefined) delete gates[options.omitGate];
      return Buffer.from(JSON.stringify({
        schemaVersion: 1,
        artifactFormat: "yesterday-social-collection-quality-report-v1",
        collectionDate: "2026-08-18",
        generatedBy: "npm run check:yesterday-social-collection-quality",
        collectionBlockingPassed: options.blockingPassed ?? true,
        summaryQualityVerified: false,
        completionStatus:
          "collection_quality_verified_summary_artifact_missing",
        summaryArtifactCoverage: {
          verificationStatus: "not_verified_missing_summary_artifact",
        },
        qualityGates: gates,
        inputs: {
          historicalRegenerationFreshness: {
            mode: "historical_regeneration_current_snapshot",
            generalAllowHistorical: false,
            manifestFileSha256: sha256(manifest),
            datasetSha256,
          },
        },
      }));
    };
    const params = {
      requestedUtcDate: "2026-08-18",
      files: {
        collectionArtifactBytes: collection,
        collectionQualityReportBytes: quality(dataset.aggregateSha256),
        datasetManifestBytes: manifest,
        xBackfillReceiptBytes: Buffer.from("receipt"),
      },
      dataset,
      authorizedAt: new Date("2026-08-22T12:00:00.000Z"),
    };

    expect(() => verifyHistoricalDegradedRecoveryInputArtifacts(params))
      .not.toThrow();
    expect(() => verifyHistoricalDegradedRecoveryInputArtifacts({
      ...params,
      files: {
        ...params.files,
        collectionQualityReportBytes: quality(dataset.aggregateSha256, {
          blockingPassed: false,
          gateOverrides: { xCollectorHasStrictAndDiscoveryLanes: false },
        }),
      },
    })).not.toThrow();
    expect(() => verifyHistoricalDegradedRecoveryInputArtifacts({
      ...params,
      files: {
        ...params.files,
        collectionQualityReportBytes: quality(dataset.aggregateSha256, {
          blockingPassed: false,
          gateOverrides: {
            xCollectorHasStrictAndDiscoveryLanes: false,
            xCollectorHasTopAndLatest: false,
          },
        }),
      },
    })).toThrow("fresh live truth");
    expect(() => verifyHistoricalDegradedRecoveryInputArtifacts({
      ...params,
      files: {
        ...params.files,
        collectionQualityReportBytes: quality(dataset.aggregateSha256, {
          blockingPassed: false,
          gateOverrides: { xCollectorHasStrictAndDiscoveryLanes: false },
          omitGate: "noRawSecretFragments",
        }),
      },
    })).toThrow("fresh live truth");
    expect(() => verifyHistoricalDegradedRecoveryInputArtifacts({
      ...params,
      files: {
        ...params.files,
        collectionQualityReportBytes: quality("e".repeat(64)),
      },
    })).toThrow("fresh live truth");
    expect(() => verifyHistoricalDegradedRecoveryInputArtifacts({
      ...params,
      dataset: {
        ...dataset,
        providerCounts: { ...dataset.providerCounts, reddit: 78, rss: 27 },
      },
    })).toThrow("fresh live truth");
    expect(() => verifyHistoricalDegradedRecoveryInputArtifacts({
      ...params,
      requestedUtcDate: "2026-08-20",
    })).toThrow("exactly 2026-08-18 or 2026-08-19");
  });

  it("requires current inputs for first publication but preserves exact replay", () => {
    const files = {
      collectionArtifactBytes: Buffer.from("collection"),
      collectionQualityReportBytes: Buffer.from("quality"),
      datasetManifestBytes: Buffer.from(JSON.stringify({
        generatedAt: "2026-08-22T11:55:00.000Z",
      })),
      xBackfillReceiptBytes: Buffer.from("receipt"),
    };
    expect(assertHistoricalDegradedRecoveryCurrentPreflight({
      slot: "empty",
      files,
      preflightAt: new Date("2026-08-22T12:00:00.000Z"),
    })).toBe("empty");
    expect(() => assertHistoricalDegradedRecoveryCurrentPreflight({
      slot: "empty",
      files,
      preflightAt: new Date("2026-08-22T12:30:00.001Z"),
    })).toThrow("current preflight inputs");
    expect(assertHistoricalDegradedRecoveryCurrentPreflight({
      slot: "replay",
      files,
      preflightAt: new Date("2027-01-01T00:00:00.000Z"),
    })).toBe("replay");
  });

  it("checks GitHub through the current first-publish preflight but skips exact replay", async () => {
    const observedThrough = new Date("2026-08-22T12:00:00.000Z");
    const assertZero = jest.fn(async () => undefined);
    await expect(assertHistoricalDegradedRecoveryCurrentGitHubZero({
      slot: "empty",
      requestedUtcDate: "2026-08-18",
      observedThrough,
      assertZero,
    })).resolves.toBe("empty");
    expect(assertZero).toHaveBeenCalledWith({
      startedAt: new Date("2026-08-18T00:00:00.000Z"),
      endedAt: new Date("2026-08-19T00:00:00.000Z"),
      observedThrough,
    });

    assertZero.mockRejectedValueOnce(new Error("requested-day GitHub row"));
    await expect(assertHistoricalDegradedRecoveryCurrentGitHubZero({
      slot: "empty",
      requestedUtcDate: "2026-08-18",
      observedThrough,
      assertZero,
    })).rejects.toThrow("requested-day GitHub row");

    assertZero.mockClear();
    await expect(assertHistoricalDegradedRecoveryCurrentGitHubZero({
      slot: "replay",
      requestedUtcDate: "2026-08-18",
      observedThrough: new Date("2027-01-01T00:00:00.000Z"),
      assertZero,
    })).resolves.toBe("replay");
    expect(assertZero).not.toHaveBeenCalled();
  });

  it("allows only an empty slot or the exact deterministic replay", () => {
    const publicationId = "00000000-0000-7000-8000-000000000001";
    expect(assertHistoricalDegradedRecoveryPublicationSlot({
      publicationCount: 0,
      exactPublicationCount: 0,
      exactOutboxCount: 0,
      completedCandidateCount: 0,
      slotCount: 1,
      currentPublicationId: null,
    }, publicationId)).toBe("empty");
    expect(assertHistoricalDegradedRecoveryPublicationSlot({
      publicationCount: 1,
      exactPublicationCount: 1,
      exactOutboxCount: 1,
      completedCandidateCount: 1,
      slotCount: 1,
      currentPublicationId: publicationId,
    }, publicationId)).toBe("replay");
    expect(() => assertHistoricalDegradedRecoveryPublicationSlot({
      publicationCount: 1,
      exactPublicationCount: 0,
      exactOutboxCount: 1,
      completedCandidateCount: 1,
      slotCount: 1,
      currentPublicationId: publicationId,
    }, publicationId)).toThrow("exact terminal publication");
    expect(() => assertHistoricalDegradedRecoveryPublicationSlot({
      publicationCount: 1,
      exactPublicationCount: 1,
      exactOutboxCount: 1,
      completedCandidateCount: 1,
      slotCount: 1,
      currentPublicationId: "00000000-0000-7000-8000-000000000002",
    }, publicationId)).toThrow("exact terminal publication");
  });

  it.each([
    ["corrupt outbox content", { exactOutboxCount: 0 }],
    ["non-COMPLETED recovery candidate", { completedCandidateCount: 0 }],
  ])("rejects %s during replay verification", (_label, mutation) => {
    const publicationId = "00000000-0000-7000-8000-000000000001";
    expect(() => assertHistoricalDegradedRecoveryPublicationSlot({
      publicationCount: 1,
      exactPublicationCount: 1,
      exactOutboxCount: 1,
      completedCandidateCount: 1,
      slotCount: 1,
      currentPublicationId: publicationId,
      ...mutation,
    }, publicationId)).toThrow("exact terminal publication");
  });
});

const laterItem = (index: number): ReaderSummaryGitHubProjectionItem => {
  const observedAt = new Date(Date.parse("2026-08-20T00:00:00.000Z") + index);
  return {
    feedItemId: `feed-${index}`,
    sourceItemId: `source-${index}`,
    sourceBindingId: "github-binding",
    providerKey: "github-trending-page",
    metadataKind: "github_trending_page_repository",
    scanJobId: "later-scan",
    canonicalUrl: `https://github.com/example/repo-${index}`,
    repositoryFullName: `example/repo-${index}`,
    rank: (index % 10) + 1,
    window: "daily",
    fetchStartedAt: new Date("2026-08-20T00:00:00.000Z"),
    checkedAt: new Date("2026-08-20T00:01:00.000Z"),
    publishedAt: new Date("2026-08-20T00:01:00.000Z"),
    observedAt,
    sourceContentHash: "a".repeat(64),
    sourceProviderContentHash: "b".repeat(64),
  };
};
