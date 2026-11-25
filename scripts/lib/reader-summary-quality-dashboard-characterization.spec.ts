import { readFileSync } from "node:fs";

import {
  isExistingReaderSummaryQualityDashboardValid,
  serializeReaderSummaryQualityDashboard,
} from "./reader-summary-quality-dashboard-artifact";
import {
  buildPlannerRolloutProof,
  plannerLaneExecutionState,
  primaryCollectionMinimumsPass,
} from "./reader-summary-quality-dashboard-collection-strategy";
import type {
  PlannerCanarySourceReport,
  ReaderSummaryQualityDashboardReport,
  ReaderSummaryQualityDayReport,
  TopReadQualityReport,
} from "./reader-summary-quality-dashboard-contract";
import { rankingScoreAlignmentStatus } from "./reader-summary-quality-dashboard-feedback-shadow";
import {
  curatedTopReadCountPasses,
  topReadProviderSkewPasses,
} from "./reader-summary-quality-dashboard-presentation";
import type { DashboardFeedItemRow } from "./reader-summary-quality-dashboard-published-window";
import { dashboardFeedSourceKey } from "./reader-summary-quality-dashboard-source-attribution";

const artifactPath = "ops/evals/reader-summary-quality-dashboard.v1.json";

describe("reader summary quality dashboard characterization", () => {
  const serializedArtifact = readFileSync(artifactPath, "utf8");
  const artifact = JSON.parse(
    serializedArtifact,
  ) as ReaderSummaryQualityDashboardReport;

  it("keeps the checked-in artifact serialization byte-for-byte stable", () => {
    expect(serializeReaderSummaryQualityDashboard(artifact)).toBe(
      serializedArtifact,
    );
  });

  it("accepts the frozen artifact and preserves degraded-mode validation", () => {
    expect(
      isExistingReaderSummaryQualityDashboardValid(artifact, {
        allowDegraded: false,
      }),
    ).toBe(true);

    const degraded = { ...artifact, blockingPassed: false };
    expect(
      isExistingReaderSummaryQualityDashboardValid(degraded, {
        allowDegraded: false,
      }),
    ).toBe(false);
    expect(
      isExistingReaderSummaryQualityDashboardValid(degraded, {
        allowDegraded: true,
      }),
    ).toBe(true);
  });

  it("rejects secret fragments even when the stored gate says they are absent", () => {
    const reportWithSecret = { ...artifact, unexpected: "access_token" };

    expect(
      isExistingReaderSummaryQualityDashboardValid(reportWithSecret, {
        allowDegraded: false,
      }),
    ).toBe(false);
  });

  it.each([
    ["model", { ...artifact, model: undefined }],
    ["inputs", { ...artifact, inputs: null }],
    ["quality gates", { ...artifact, qualityGates: undefined }],
  ])("rejects a malformed artifact with invalid %s", (_label, malformed) => {
    expect(
      isExistingReaderSummaryQualityDashboardValid(malformed, {
        allowDegraded: false,
      }),
    ).toBe(false);
  });

  it("normalizes fallback author source keys", () => {
    expect(
      dashboardFeedSourceKey({
        id: "feed-item",
        sourceItemId: "source-item",
        sourceBindingId: "source-binding",
        interestId: "interest",
        providerKey: "rss",
        canonicalUrl: "not-a-url",
        authorHandle: "MixedCaseSource",
        title: "Source title",
        publishedAt: new Date("2026-08-26T00:00:00.000Z"),
        observedAt: new Date("2026-08-26T00:00:00.000Z"),
        providerMetadata: {},
      } satisfies DashboardFeedItemRow),
    ).toBe("mixedcasesource");
  });

  it.each([
    [0, 0, 0, 0, "no_feedback"],
    [8, 4, 3, 1, "insufficient_matched_feedback"],
    [8, 5, 3, 1, "attention_needed"],
    [8, 5, 1, 3, "aligned"],
  ] as const)(
    "classifies feedback alignment (%i ratings, %i matches) as %s",
    (
      ratingCount,
      matchedTopReadRatingCount,
      negativeHighScoreRatingCount,
      positiveHighScoreRatingCount,
      expected,
    ) => {
      expect(
        rankingScoreAlignmentStatus({
          ratingCount,
          matchedTopReadRatingCount,
          negativeHighScoreRatingCount,
          positiveHighScoreRatingCount,
        }),
      ).toBe(expected);
    },
  );

  it("distinguishes executed, unobservable, and unseen planner lanes", () => {
    expect(
      plannerLaneExecutionState({
        queryFingerprint: "lane-a",
        executedLaneSet: new Set(["lane-a"]),
        observedLaneFingerprintCount: 1,
        collectedCount: 2,
      }),
    ).toBe("executed");
    expect(
      plannerLaneExecutionState({
        queryFingerprint: "lane-a",
        executedLaneSet: new Set(),
        observedLaneFingerprintCount: 0,
        collectedCount: 2,
      }),
    ).toBe("not_observable");
    expect(
      plannerLaneExecutionState({
        queryFingerprint: "lane-a",
        executedLaneSet: new Set(["lane-b"]),
        observedLaneFingerprintCount: 1,
        collectedCount: 2,
      }),
    ).toBe("not_seen_in_feed");
  });

  it("preserves strict and evidence-backed curated top-read thresholds", () => {
    expect(curatedTopReadCountPasses(topReadGateInput(8, 8, false))).toBe(true);
    expect(curatedTopReadCountPasses(topReadGateInput(8, 5, true))).toBe(true);
    expect(curatedTopReadCountPasses(topReadGateInput(8, 5, false))).toBe(
      false,
    );
    expect(curatedTopReadCountPasses(topReadGateInput(8, 4, true))).toBe(false);
  });

  it("uses the frozen provider-skew limits on both sides of ten top reads", () => {
    expect(topReadProviderSkewPasses(summaryWithSkew(9, 0.75))).toBe(true);
    expect(topReadProviderSkewPasses(summaryWithSkew(9, 0.751))).toBe(false);
    expect(topReadProviderSkewPasses(summaryWithSkew(10, 0.6))).toBe(true);
    expect(topReadProviderSkewPasses(summaryWithSkew(10, 0.601))).toBe(false);
  });

  it("accepts cumulative primary evidence without requiring both providers to be strong", () => {
    expect(
      primaryCollectionMinimumsPass({
        redditCollectedEnough: true,
        xTwitterCollectedEnough: true,
        redditEligibleCandidatesEnough: false,
        xTwitterEligibleCandidatesEnough: false,
        primarySummaryRepresentationEnough: true,
      }),
    ).toBe(true);
    expect(
      primaryCollectionMinimumsPass({
        redditCollectedEnough: true,
        xTwitterCollectedEnough: true,
        redditEligibleCandidatesEnough: true,
        xTwitterEligibleCandidatesEnough: true,
        primarySummaryRepresentationEnough: false,
      }),
    ).toBe(true);
    expect(
      primaryCollectionMinimumsPass({
        redditCollectedEnough: true,
        xTwitterCollectedEnough: true,
        redditEligibleCandidatesEnough: true,
        xTwitterEligibleCandidatesEnough: false,
        primarySummaryRepresentationEnough: false,
      }),
    ).toBe(false);
    expect(
      primaryCollectionMinimumsPass({
        redditCollectedEnough: true,
        xTwitterCollectedEnough: false,
        redditEligibleCandidatesEnough: true,
        xTwitterEligibleCandidatesEnough: true,
        primarySummaryRepresentationEnough: true,
      }),
    ).toBe(false);
  });

  it("keeps rollout proof statuses and failure reasons stable", () => {
    const canonicalDay = artifact.days[0];
    expect(canonicalDay).toBeDefined();
    if (canonicalDay === undefined) {
      throw new Error("Characterization artifact requires one day");
    }

    const ready = buildPlannerRolloutProof([canonicalDay]);
    expect(ready.status).toBe("ready");
    expect(ready.eligibleCleanDates).toEqual([canonicalDay.collectionDate]);

    const missingMetadata = buildPlannerRolloutProof([
      dayWithPlannerState(canonicalDay, {
        clean: true,
        xTwitterObservedLaneFingerprintCount: 0,
      }),
    ]);
    expect(missingMetadata.status).toBe("missing_clean_rollout_proof");
    expect(missingMetadata.blockedDates[0]?.reasons).toEqual([
      "x_twitter_lane_metadata_missing",
    ]);

    const dirty = buildPlannerRolloutProof([
      dayWithPlannerState(canonicalDay, { clean: false }),
    ]);
    expect(dirty.status).toBe("missing_clean_collection");
    expect(dirty.blockedDates[0]?.reasons).toEqual(["dirty_collection"]);
  });
});

function topReadGateInput(
  selectedFeedItemCount: number,
  topReadCount: number,
  evidenceBacked: boolean,
): {
  readonly selectedFeedItemCount: number;
  readonly topReadCount: number;
  readonly topReadQuality: TopReadQualityReport;
} {
  return {
    selectedFeedItemCount,
    topReadCount,
    topReadQuality: {
      rowCount: topReadCount,
      unexplainedTopReadCount: 0,
      unexplainedTopReadRate: 0,
      lowConfidenceWithoutRiskCount: 0,
      lowConfidenceWithoutRiskRate: 0,
      weakTopReadOutrankingStrongSocialCount: 0,
      weakTopReadOutrankingStrongSocialRate: 0,
      selectionSignalCounts: {},
      riskSignalCounts: {},
      reliabilityRiskCounts: {},
      providerContribution: [],
      rows: [],
      gates: {
        everyTopReadHasSelectionSignal: evidenceBacked,
        noWeakTopReadOutranksStrongSocialRead: evidenceBacked,
      },
    },
  };
}

function summaryWithSkew(
  topReadCount: number,
  topReadProviderSkew: number,
): ReaderSummaryQualityDayReport["summary"] {
  return {
    artifactStatus: "present",
    confidenceLevel: "high",
    confidenceScore: 1,
    selectedFeedItemCount: topReadCount,
    storyClusterCount: topReadCount,
    crossSourceClusterRate: 1,
    topReadCount,
    lowConfidenceTopReadCount: 0,
    lowConfidenceTopReadRate: 0,
    technicalLeakCount: 0,
    topReadProviderSkew,
    primarySelectedCounts: {},
    primaryTopReadCounts: {},
  };
}

function dayWithPlannerState(
  day: ReaderSummaryQualityDayReport,
  params: {
    readonly clean: boolean;
    readonly xTwitterObservedLaneFingerprintCount?: number;
  },
): ReaderSummaryQualityDayReport {
  const reddit = requiredPlannerSource(day, "reddit");
  const xTwitter = requiredPlannerSource(day, "x-twitter");

  return {
    ...day,
    collectionIntegrity: params.clean
      ? { status: "clean" }
      : {
          status: "collection_integrity_failed",
          reason: "characterization",
          evidence: {
            feedItemCount: 1,
            orphanInterestCount: 0,
            orphanSourceBindingCount: 0,
          },
          action: "characterization",
        },
    collectionStrategy: {
      ...day.collectionStrategy,
      plannerCanary: {
        ...day.collectionStrategy.plannerCanary,
        primarySources: {
          reddit,
          "x-twitter": {
            ...xTwitter,
            observedLaneFingerprintCount:
              params.xTwitterObservedLaneFingerprintCount ??
              xTwitter.observedLaneFingerprintCount,
          },
        },
      },
    },
  };
}

function requiredPlannerSource(
  day: ReaderSummaryQualityDayReport,
  providerKey: "reddit" | "x-twitter",
): PlannerCanarySourceReport {
  const source =
    day.collectionStrategy.plannerCanary.primarySources[providerKey];
  if (source === undefined) {
    throw new Error(`Missing ${providerKey} planner source in fixture`);
  }

  return source;
}
