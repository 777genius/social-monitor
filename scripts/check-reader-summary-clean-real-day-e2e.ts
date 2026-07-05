import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import {
  noRawSecretFragments,
  normalizeLineEndings,
  roundMetric,
} from "./lib/yesterday-social-replay-support";

type ProviderKey = "reddit" | "x-twitter";

type CleanCollectionReport = {
  readonly schemaVersion: 1;
  readonly artifactFormat: "reader-summary-clean-real-day-collection-v1";
  readonly generatedBy: string;
  readonly run: {
    readonly collectionDate: string;
  };
  readonly targets: readonly {
    readonly providerKey: ProviderKey;
    readonly bindingFingerprint: string;
    readonly plannerEnabled: boolean;
    readonly canaryRollout: boolean;
  }[];
  readonly scans: readonly {
    readonly providerKey: ProviderKey;
    readonly bindingFingerprint: string;
    readonly status: "succeeded" | string;
    readonly fetched: number;
    readonly projected: number;
    readonly warningCount: number;
  }[];
  readonly freshWindow: {
    readonly feedItemCount: number;
    readonly providerCounts: Record<ProviderKey, number>;
    readonly orphanInterestCount: number;
    readonly orphanSourceBindingCount: number;
    readonly interestSnapshotCoverage: number;
    readonly sourceBindingSnapshotCoverage: number;
    readonly sourceQueryLaneCoverage: number;
    readonly distinctSourceQueryLaneCount: number;
  };
  readonly qualityGates: Record<string, boolean>;
  readonly blockingPassed: boolean;
};

type PlannerCanaryReport = {
  readonly schemaVersion: 1;
  readonly artifactFormat: "source-query-planner-real-binding-canary-v1";
  readonly generatedBy: string;
  readonly totals: {
    readonly bindingCount: number;
    readonly redditBindingCount: number;
    readonly xTwitterBindingCount: number;
  };
  readonly bindings: readonly {
    readonly providerKey: ProviderKey;
    readonly bindingFingerprint: string;
    readonly plannerEnabled: boolean;
    readonly rollout: "real_binding_canary" | "other" | "missing";
    readonly scanPassCount: number;
    readonly searchQueryCount: number;
  }[];
  readonly qualityGates: Record<string, boolean>;
  readonly blockingPassed: boolean;
};

type DashboardDay = {
  readonly collectionDate: string;
  readonly feed: {
    readonly collectedFeedItemCount: number;
    readonly providerCounts: readonly {
      readonly providerKey: string;
      readonly count: number;
    }[];
  };
  readonly summary: {
    readonly artifactStatus: "present" | string;
    readonly artifactFingerprint: string;
    readonly confidenceLevel: "none" | "low" | "medium" | "high";
    readonly confidenceScore: number;
    readonly selectedFeedItemCount: number;
    readonly storyClusterCount: number;
    readonly topReadCount: number;
    readonly technicalLeakCount: number;
    readonly topReadProviderSkew: number;
    readonly primarySelectedCounts: Record<string, number>;
    readonly primaryTopReadCounts: Record<string, number>;
  };
  readonly topReadQuality: {
    readonly rowCount: number;
    readonly unexplainedTopReadCount: number;
    readonly lowConfidenceWithoutRiskCount: number;
    readonly gates: Record<string, boolean>;
  };
  readonly claimQuality: {
    readonly claimCount: number;
    readonly gates: Record<string, boolean>;
  };
  readonly collectionStrategy: {
    readonly primarySources: Record<
      ProviderKey,
      {
        readonly collectedCount: number;
        readonly selectedCount: number;
        readonly topReadCount: number;
        readonly queryLaneCount: number;
        readonly productLaneCount: number;
        readonly eligibleTopReadCandidateCount: number;
        readonly sourceSkewRatio: number;
      }
    >;
    readonly plannerCanary: {
      readonly primarySources: Record<
        ProviderKey,
        {
          readonly bindingCount: number;
          readonly canaryEnabledBindingCount: number;
          readonly plannedLaneCount: number;
          readonly executedLaneCount: number;
          readonly observedLaneFingerprintCount: number;
        }
      >;
      readonly gates: Record<string, boolean>;
      readonly warningSignals: Record<string, boolean>;
    };
    readonly gates: Record<string, boolean>;
    readonly warningSignals: Record<string, boolean>;
  };
  readonly feedbackShadow: {
    readonly mode: "shadow_no_ranking_influence" | string;
    readonly rankingScoreAlignment: {
      readonly status: string;
    };
    readonly gates: Record<string, boolean>;
  };
  readonly qualityGates: Record<string, boolean>;
  readonly warningSignals: Record<string, boolean>;
  readonly blockingPassed: boolean;
};

type QualityDashboardReport = {
  readonly schemaVersion: 1;
  readonly artifactFormat: "reader-summary-quality-dashboard-v1";
  readonly generatedBy: string;
  readonly aggregate: {
    readonly latestCleanDate: string;
    readonly cleanBlockingPassed: boolean;
    readonly degradedCleanDates: readonly string[];
    readonly dirtyDates: readonly string[];
    readonly plannerRolloutProof: {
      readonly status: "ready" | string;
      readonly latestEligibleCleanDate: string | null;
      readonly eligibleCleanDates: readonly string[];
      readonly gates: Record<string, boolean>;
    };
  };
  readonly days: readonly DashboardDay[];
  readonly blockingPassed: boolean;
};

type FeedbackCalibrationReport = {
  readonly schemaVersion: 1;
  readonly artifactFormat: "summary-feedback-calibration-report-v1";
  readonly generatedBy: string;
  readonly status: string;
  readonly totals: {
    readonly ratingCount: number;
    readonly negativeRatingCount: number;
    readonly positiveRatingCount: number;
    readonly negativeRatingsMissingReasonCount: number;
  };
  readonly reasonCorrelation: readonly {
    readonly reason: string;
    readonly negativeRatingCount: number;
    readonly riskMatchRate: number;
  }[];
  readonly qualityGates: Record<string, boolean>;
  readonly blockingPassed: boolean;
};

type ArtifactQualityReport = {
  readonly schemaVersion: 1;
  readonly artifactFormat: "yesterday-reader-summary-artifact-quality-v1";
  readonly collectionDate: string;
  readonly artifactHistory: {
    readonly visibleBadGamingArtifactCount: number;
    readonly rejectedBadGamingArtifactCount: number;
    readonly failedBadGamingArtifactCount: number;
    readonly visiblePeriodArtifactCount: number;
    readonly supersededPeriodArtifactCount: number;
  };
  readonly qualityGates: Record<string, boolean>;
  readonly blockingPassed: boolean;
};

type Report = {
  readonly schemaVersion: 1;
  readonly artifactFormat: "reader-summary-clean-real-day-e2e-report-v1";
  readonly generatedBy: string;
  readonly model: {
    readonly liveNetwork: false;
    readonly reportBuilder: "clean-real-day-reader-summary-e2e-quality-gate";
    readonly rawProviderPayloadPersistedInReport: false;
  };
  readonly inputs: {
    readonly collectionPath: string;
    readonly plannerCanaryPath: string;
    readonly qualityDashboardPath: string;
    readonly feedbackCalibrationPath: string;
    readonly artifactQualityPath: string;
  };
  readonly collectionDate: string;
  readonly collection: {
    readonly feedItemCount: number;
    readonly providerCounts: Record<ProviderKey, number>;
    readonly sourceQueryLaneCoverage: number;
    readonly distinctSourceQueryLaneCount: number;
    readonly targetCount: number;
    readonly succeededScanCount: number;
  };
  readonly planner: {
    readonly bindingCount: number;
    readonly redditBindingCount: number;
    readonly xTwitterBindingCount: number;
    readonly realBindingCanaryBindingCount: number;
  };
  readonly summary: {
    readonly artifactFingerprint: string;
    readonly confidenceLevel: string;
    readonly confidenceScore: number;
    readonly selectedFeedItemCount: number;
    readonly storyClusterCount: number;
    readonly topReadCount: number;
    readonly topReadProviderSkew: number;
    readonly primarySelectedCounts: Record<ProviderKey, number>;
    readonly primaryTopReadCounts: Record<ProviderKey, number>;
    readonly technicalLeakCount: number;
  };
  readonly topReadQuality: {
    readonly rowCount: number;
    readonly unexplainedTopReadCount: number;
    readonly lowConfidenceWithoutRiskCount: number;
  };
  readonly claimBoard: {
    readonly claimCount: number;
    readonly structuredClaimBoardPresent: boolean;
    readonly everyClaimHasTwoEvidenceOrExplicitRisk: boolean;
  };
  readonly collectionStrategy: {
    readonly redditQueryLaneCount: number;
    readonly xTwitterQueryLaneCount: number;
    readonly redditEligibleTopReadCandidateCount: number;
    readonly xTwitterEligibleTopReadCandidateCount: number;
    readonly plannerExecutionGap: boolean;
    readonly queryLaneWeaknessDetected: boolean;
  };
  readonly feedback: {
    readonly calibrationStatus: string;
    readonly shadowStatus: string;
    readonly ratingCount: number;
    readonly negativeRatingCount: number;
    readonly positiveRatingCount: number;
    readonly negativeRatingsMissingReasonCount: number;
    readonly reasonCount: number;
    readonly shadowMode: string;
  };
  readonly artifactHistory: {
    readonly visibleBadGamingArtifactCount: number;
    readonly rejectedBadGamingArtifactCount: number;
    readonly failedBadGamingArtifactCount: number;
    readonly visiblePeriodArtifactCount: number;
    readonly supersededPeriodArtifactCount: number;
  };
  readonly qualityGates: Record<string, boolean>;
  readonly blockingPassed: boolean;
};

const update = process.argv.includes("--update");
const outputPath = "ops/evals/reader-summary-clean-real-day-e2e-report.v1.json";
const collectionPath =
  "ops/evals/reader-summary-clean-real-day-collection.v1.json";
const plannerCanaryPath =
  "ops/evals/source-query-planner-real-binding-canary.v1.json";
const qualityDashboardPath =
  "ops/evals/reader-summary-quality-dashboard.v1.json";
const feedbackCalibrationPath =
  "ops/evals/summary-feedback-calibration-report.v1.json";
const artifactQualityPath =
  "ops/evals/yesterday-reader-summary-artifact-quality.v1.json";
const primarySources = ["reddit", "x-twitter"] as const;

void main();

function main(): void {
  const report = buildReport();
  const serialized = `${JSON.stringify(report, null, 2)}\n`;

  if (!report.blockingPassed) {
    console.error(serialized);
    throw new Error("Reader summary clean real-day end-to-end gates failed");
  }

  if (update) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, serialized);
    console.log(`Updated ${outputPath}`);
    return;
  }

  if (!existsSync(outputPath)) {
    throw new Error(
      `${outputPath} is missing. Run npm run check:reader-summary-clean-real-day-e2e -- --update`,
    );
  }

  const expected = normalizeLineEndings(readFileSync(outputPath, "utf8"));
  if (expected !== serialized) {
    throw new Error(
      `${outputPath} is stale. Run npm run check:reader-summary-clean-real-day-e2e -- --update`,
    );
  }

  console.log(
    `Reader summary clean real-day e2e OK (${report.collectionDate}: ${report.collection.feedItemCount} collected, ${report.summary.selectedFeedItemCount} selected, ${report.summary.topReadCount} top reads)`,
  );
}

function buildReport(): Report {
  const collection = readJson<CleanCollectionReport>(collectionPath);
  const plannerCanary = readJson<PlannerCanaryReport>(plannerCanaryPath);
  const dashboard = readJson<QualityDashboardReport>(qualityDashboardPath);
  const feedback = readJson<FeedbackCalibrationReport>(feedbackCalibrationPath);
  const artifactQuality = readJson<ArtifactQualityReport>(artifactQualityPath);
  const latestDay = dashboard.days.find(
    (day) => day.collectionDate === dashboard.aggregate.latestCleanDate,
  );

  if (latestDay === undefined) {
    throw new Error(
      `Dashboard latest clean date ${dashboard.aggregate.latestCleanDate} is missing from days`,
    );
  }

  const reportWithoutSecretGate = buildReportWithoutSecretGate(
    collection,
    plannerCanary,
    dashboard,
    latestDay,
    feedback,
    artifactQuality,
  );
  const qualityGates = {
    ...reportWithoutSecretGate.qualityGates,
    noRawSecretFragments: noRawSecretFragments(reportWithoutSecretGate),
  };

  return {
    ...reportWithoutSecretGate,
    summary: roundRecordNumbers(reportWithoutSecretGate.summary),
    collectionStrategy: roundRecordNumbers(
      reportWithoutSecretGate.collectionStrategy,
    ),
    qualityGates,
    blockingPassed: Object.values(qualityGates).every(Boolean),
  };
}

function buildReportWithoutSecretGate(
  collectionReport: CleanCollectionReport,
  plannerCanary: PlannerCanaryReport,
  dashboard: QualityDashboardReport,
  latestDay: DashboardDay,
  feedbackReport: FeedbackCalibrationReport,
  artifactQualityReport: ArtifactQualityReport,
): Report {
  const collectionDate = collectionReport.run.collectionDate;
  const plannerRolloutProof = dashboard.aggregate.plannerRolloutProof;
  const cleanProviderCounts = primaryProviderCounts(
    collectionReport.freshWindow.providerCounts,
  );
  const summaryPrimarySelectedCounts = primaryProviderCounts(
    latestDay.summary.primarySelectedCounts,
  );
  const summaryPrimaryTopReadCounts = primaryProviderCounts(
    latestDay.summary.primaryTopReadCounts,
  );
  const plannerExecutionGap =
    latestDay.warningSignals.plannerCanaryExecutionGap === true ||
    latestDay.collectionStrategy.plannerCanary.warningSignals
      .redditPlannedLanesNotExecuted === true ||
    latestDay.collectionStrategy.plannerCanary.warningSignals
      .xTwitterPlannedLanesNotExecuted === true ||
    latestDay.collectionStrategy.plannerCanary.warningSignals
      .redditExecutionUnderPlannedHalf === true ||
    latestDay.collectionStrategy.plannerCanary.warningSignals
      .xTwitterExecutionUnderPlannedHalf === true;
  const queryLaneWeaknessDetected =
    latestDay.warningSignals.queryLaneWeaknessDetected === true ||
    latestDay.collectionStrategy.warningSignals.redditQueryLanesMissing ===
      true ||
    latestDay.collectionStrategy.warningSignals.xTwitterQueryLanesMissing ===
      true;
  const report = {
    schemaVersion: 1,
    artifactFormat: "reader-summary-clean-real-day-e2e-report-v1",
    generatedBy: "npm run check:reader-summary-clean-real-day-e2e",
    model: {
      liveNetwork: false,
      reportBuilder: "clean-real-day-reader-summary-e2e-quality-gate",
      rawProviderPayloadPersistedInReport: false,
    },
    inputs: {
      collectionPath,
      plannerCanaryPath,
      qualityDashboardPath,
      feedbackCalibrationPath,
      artifactQualityPath,
    },
    collectionDate,
    collection: {
      feedItemCount: collectionReport.freshWindow.feedItemCount,
      providerCounts: cleanProviderCounts,
      sourceQueryLaneCoverage:
        collectionReport.freshWindow.sourceQueryLaneCoverage,
      distinctSourceQueryLaneCount:
        collectionReport.freshWindow.distinctSourceQueryLaneCount,
      targetCount: collectionReport.targets.length,
      succeededScanCount: collectionReport.scans.filter(
        (scan) => scan.status === "succeeded",
      ).length,
    },
    planner: {
      bindingCount: plannerCanary.totals.bindingCount,
      redditBindingCount: plannerCanary.totals.redditBindingCount,
      xTwitterBindingCount: plannerCanary.totals.xTwitterBindingCount,
      realBindingCanaryBindingCount: plannerCanary.bindings.filter(
        (binding) => binding.rollout === "real_binding_canary",
      ).length,
    },
    summary: {
      artifactFingerprint: latestDay.summary.artifactFingerprint,
      confidenceLevel: latestDay.summary.confidenceLevel,
      confidenceScore: latestDay.summary.confidenceScore,
      selectedFeedItemCount: latestDay.summary.selectedFeedItemCount,
      storyClusterCount: latestDay.summary.storyClusterCount,
      topReadCount: latestDay.summary.topReadCount,
      topReadProviderSkew: latestDay.summary.topReadProviderSkew,
      primarySelectedCounts: summaryPrimarySelectedCounts,
      primaryTopReadCounts: summaryPrimaryTopReadCounts,
      technicalLeakCount: latestDay.summary.technicalLeakCount,
    },
    topReadQuality: {
      rowCount: latestDay.topReadQuality.rowCount,
      unexplainedTopReadCount: latestDay.topReadQuality.unexplainedTopReadCount,
      lowConfidenceWithoutRiskCount:
        latestDay.topReadQuality.lowConfidenceWithoutRiskCount,
    },
    claimBoard: {
      claimCount: latestDay.claimQuality.claimCount,
      structuredClaimBoardPresent:
        latestDay.claimQuality.gates.structuredClaimBoardPresent === true,
      everyClaimHasTwoEvidenceOrExplicitRisk:
        latestDay.claimQuality.gates.everyClaimHasTwoEvidenceOrExplicitRisk ===
        true,
    },
    collectionStrategy: {
      redditQueryLaneCount:
        latestDay.collectionStrategy.primarySources.reddit.queryLaneCount,
      xTwitterQueryLaneCount:
        latestDay.collectionStrategy.primarySources["x-twitter"].queryLaneCount,
      redditEligibleTopReadCandidateCount:
        latestDay.collectionStrategy.primarySources.reddit
          .eligibleTopReadCandidateCount,
      xTwitterEligibleTopReadCandidateCount:
        latestDay.collectionStrategy.primarySources["x-twitter"]
          .eligibleTopReadCandidateCount,
      plannerExecutionGap,
      queryLaneWeaknessDetected,
    },
    feedback: {
      calibrationStatus: feedbackReport.status,
      shadowStatus: latestDay.feedbackShadow.rankingScoreAlignment.status,
      ratingCount: feedbackReport.totals.ratingCount,
      negativeRatingCount: feedbackReport.totals.negativeRatingCount,
      positiveRatingCount: feedbackReport.totals.positiveRatingCount,
      negativeRatingsMissingReasonCount:
        feedbackReport.totals.negativeRatingsMissingReasonCount,
      reasonCount: feedbackReport.reasonCorrelation.length,
      shadowMode: latestDay.feedbackShadow.mode,
    },
    artifactHistory: artifactQualityReport.artifactHistory,
    qualityGates: {
      collectionArtifactFormatValid:
        collectionReport.artifactFormat ===
        "reader-summary-clean-real-day-collection-v1",
      plannerCanaryArtifactFormatValid:
        plannerCanary.artifactFormat ===
        "source-query-planner-real-binding-canary-v1",
      qualityDashboardArtifactFormatValid:
        dashboard.artifactFormat === "reader-summary-quality-dashboard-v1",
      feedbackArtifactFormatValid:
        feedbackReport.artifactFormat ===
        "summary-feedback-calibration-report-v1",
      artifactQualityArtifactFormatValid:
        artifactQualityReport.artifactFormat ===
        "yesterday-reader-summary-artifact-quality-v1",
      collectionArtifactPassed: collectionReport.blockingPassed,
      collectionQualityGatesPassed: allGatesPass(collectionReport.qualityGates),
      cleanCollectionDateMatchesDashboard:
        collectionDate === dashboard.aggregate.latestCleanDate &&
        collectionDate === latestDay.collectionDate &&
        collectionDate === plannerRolloutProof.latestEligibleCleanDate,
      cleanCollectionFreshFeedWritten:
        collectionReport.freshWindow.feedItemCount > 0,
      cleanCollectionPrimarySourcesCollected: primarySources.every(
        (source) => cleanProviderCounts[source] > 0,
      ),
      cleanCollectionNoOrphans:
        collectionReport.freshWindow.orphanInterestCount === 0 &&
        collectionReport.freshWindow.orphanSourceBindingCount === 0,
      cleanCollectionSnapshotsPersisted:
        collectionReport.freshWindow.interestSnapshotCoverage === 1 &&
        collectionReport.freshWindow.sourceBindingSnapshotCoverage === 1,
      cleanCollectionQueryLaneCoverageComplete:
        collectionReport.freshWindow.sourceQueryLaneCoverage === 1,
      cleanCollectionMultipleQueryLanesObserved:
        collectionReport.freshWindow.distinctSourceQueryLaneCount >= 2,
      cleanCollectionTargetsUsePlannerCanary:
        collectionReport.targets.length >= primarySources.length &&
        collectionReport.targets.every(
          (target) => target.plannerEnabled && target.canaryRollout,
        ),
      cleanCollectionScansSucceeded:
        collectionReport.scans.length >= primarySources.length &&
        collectionReport.scans.every(
          (scan) =>
            scan.status === "succeeded" &&
            scan.fetched > 0 &&
            scan.projected > 0,
        ),
      plannerCanaryArtifactPassed: plannerCanary.blockingPassed,
      plannerCanaryQualityGatesPassed: allGatesPass(plannerCanary.qualityGates),
      plannerPrimaryBindingsPresent:
        plannerCanary.totals.redditBindingCount > 0 &&
        plannerCanary.totals.xTwitterBindingCount > 0,
      plannerEveryBindingEnabled: plannerCanary.bindings.every(
        (binding) => binding.plannerEnabled,
      ),
      plannerEveryBindingUsesRealCanary: plannerCanary.bindings.every(
        (binding) => binding.rollout === "real_binding_canary",
      ),
      plannerKeepsProviderSpecificFallbacks:
        plannerCanary.bindings
          .filter((binding) => binding.providerKey === "reddit")
          .every((binding) => binding.scanPassCount > 0) &&
        plannerCanary.bindings
          .filter((binding) => binding.providerKey === "x-twitter")
          .every((binding) => binding.searchQueryCount > 0),
      dashboardArtifactPassed: dashboard.blockingPassed,
      dashboardCleanAggregatePassed: dashboard.aggregate.cleanBlockingPassed,
      dashboardHasNoDegradedCleanDates:
        dashboard.aggregate.degradedCleanDates.length === 0,
      dashboardPlannerRolloutProofReady:
        plannerRolloutProof.status === "ready" &&
        allGatesPass(plannerRolloutProof.gates),
      dashboardDirtyDaysExcludedFromRolloutProof:
        dashboard.aggregate.dirtyDates.length > 0 &&
        plannerRolloutProof.gates.dirtyDaysExcludedFromRolloutProof === true,
      latestCleanDayPassed: latestDay.blockingPassed,
      latestCleanDayQualityGatesPassed: allGatesPass(latestDay.qualityGates),
      latestCleanDayIncludesCleanCollectionPrimaryCounts:
        latestDay.feed.collectedFeedItemCount >=
          collectionReport.freshWindow.feedItemCount &&
        primarySources.every(
          (source) =>
            providerCount(latestDay.feed.providerCounts, source) >=
            cleanProviderCounts[source],
        ),
      latestCleanDaySummaryArtifactPresent:
        latestDay.summary.artifactStatus === "present",
      latestCleanDayHasEnoughTopReads: latestDay.summary.topReadCount >= 8,
      latestCleanDayHasEnoughSelectedEvidence:
        latestDay.summary.selectedFeedItemCount >= 30,
      latestCleanDayPrimarySourcesSelected: primarySources.every(
        (source) => summaryPrimarySelectedCounts[source] > 0,
      ),
      latestCleanDayPrimarySourcesReachTopReads: primarySources.every(
        (source) => summaryPrimaryTopReadCounts[source] > 0,
      ),
      latestCleanDayTopReadSkewControlled:
        latestDay.summary.topReadProviderSkew <= 0.6,
      latestCleanDayNoTechnicalLeakage:
        latestDay.summary.technicalLeakCount === 0,
      latestCleanDayTopReadTelemetryComplete:
        latestDay.topReadQuality.rowCount === latestDay.summary.topReadCount &&
        allGatesPass(latestDay.topReadQuality.gates),
      latestCleanDayTopReadsExplained:
        latestDay.topReadQuality.unexplainedTopReadCount === 0,
      latestCleanDayStructuredClaimBoardPresent:
        latestDay.claimQuality.gates.structuredClaimBoardPresent === true,
      latestCleanDayClaimsSupportedOrRisked:
        latestDay.claimQuality.gates.everyClaimHasTwoEvidenceOrExplicitRisk ===
        true,
      latestCleanDayCollectionStrategyPassed: allGatesPass(
        latestDay.collectionStrategy.gates,
      ),
      latestCleanDayPlannerCanaryTelemetryPresent: allGatesPass(
        latestDay.collectionStrategy.plannerCanary.gates,
      ),
      latestCleanDayPlannerCanaryExecuted:
        primarySources.every((source) => {
          const sourcePlan =
            latestDay.collectionStrategy.plannerCanary.primarySources[source];

          return (
            sourcePlan.canaryEnabledBindingCount > 0 &&
            sourcePlan.plannedLaneCount > 0 &&
            sourcePlan.executedLaneCount > 0 &&
            sourcePlan.observedLaneFingerprintCount > 0
          );
        }) && !plannerExecutionGap,
      latestCleanDayQueryLanesHealthy: !queryLaneWeaknessDetected,
      feedbackCalibrationArtifactPassed: feedbackReport.blockingPassed,
      feedbackCalibrationQualityGatesPassed: allGatesPass(
        feedbackReport.qualityGates,
      ),
      feedbackCalibrationStatusExplicit: feedbackReport.status.length > 0,
      feedbackRankingInfluenceDisabled:
        feedbackReport.qualityGates.rankingInfluenceDisabled === true &&
        feedbackReport.qualityGates.rankingInfluenceRequiresCalibratedStatus ===
          true,
      feedbackLowRatingsRequireReason:
        feedbackReport.totals.negativeRatingsMissingReasonCount === 0 &&
        feedbackReport.qualityGates.lowRatingReasonCoverageReadyForInfluence ===
          true,
      feedbackReasonTaxonomyPresent:
        feedbackReport.reasonCorrelation.length >= 5,
      feedbackShadowDoesNotInfluenceRanking:
        latestDay.feedbackShadow.mode === "shadow_no_ranking_influence" &&
        latestDay.feedbackShadow.gates.noRankingInfluence === true,
      feedbackShadowNegativeRatingsHaveReason:
        latestDay.feedbackShadow.gates.negativeRatingsHaveReason === true,
      feedbackShadowNoHighRankNegativeCluster:
        latestDay.feedbackShadow.gates.noHighRankNegativeCluster === true,
      artifactQualityArtifactPassed: artifactQualityReport.blockingPassed,
      artifactQualityDateMatchesCleanCollection:
        artifactQualityReport.collectionDate === collectionDate,
      artifactLifecycleQualityGatesPassed:
        artifactQualityReport.qualityGates
          .noVisibleHistoricalBadGamingArtifacts === true &&
        artifactQualityReport.qualityGates.badGamingArtifactsUseRejectedStatus ===
          true &&
        artifactQualityReport.qualityGates
          .latestPeriodHasSingleVisibleArtifact === true,
      artifactLatestPeriodHasSingleVisibleSummary:
        artifactQualityReport.artifactHistory.visiblePeriodArtifactCount === 1,
      artifactBadHistoricalSummaryNotVisible:
        artifactQualityReport.artifactHistory.visibleBadGamingArtifactCount ===
          0 &&
        artifactQualityReport.artifactHistory.failedBadGamingArtifactCount ===
          0,
      noRawSecretFragments: true,
    },
    blockingPassed: false,
  } satisfies Report;

  return report;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function allGatesPass(gates: Record<string, boolean>): boolean {
  return Object.values(gates).every(Boolean);
}

function primaryProviderCounts(
  counts: Record<string, number>,
): Record<ProviderKey, number> {
  return {
    reddit: counts.reddit ?? 0,
    "x-twitter": counts["x-twitter"] ?? 0,
  };
}

function providerCount(
  counts: readonly { readonly providerKey: string; readonly count: number }[],
  providerKey: ProviderKey,
): number {
  return counts.find((item) => item.providerKey === providerKey)?.count ?? 0;
}

function roundRecordNumbers<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      typeof entry === "number" ? roundMetric(entry) : entry,
    ]),
  ) as T;
}
