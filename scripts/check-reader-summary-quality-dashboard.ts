import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { Pool } from "pg";

import { SocialResearchSourceQueryPlannerAdapter } from "@social-monitor/ingestion/adapters/source/social-research-source-query-planner.adapter";
import {
  DefaultSourceQueryPlanRuntimeCompiler,
  sourceQueryPlannerIntentFromConfig,
} from "@social-monitor/ingestion/adapters/source/source-query-plan-runtime-compiler";
import type {
  SourceQuery,
  SourceQueryMode,
  SourceRuntimeConfig,
} from "@social-monitor/ingestion/ports";
import {
  readerSummaryArtifactFromPrisma,
  type PrismaReaderSummaryArtifactRecord,
} from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-records";
import {
  presentReaderSummaryArtifact,
  readerSummaryContentForArtifact,
  type ReaderSummaryArtifactView,
} from "@social-monitor/summary/features/shared/reader-summary-artifact-presenter";

import {
  type CollectionIntegrityStatus,
  fingerprint,
  message,
  noRawSecretFragments,
  normalizeLineEndings,
  readCollectionIntegrityStatus,
  readOption,
  roundMetric,
  yesterdaySocialQualityDatabaseUrl,
  yesterdaySocialQualityPoolConfig,
} from "./lib/yesterday-social-replay-support";
import {
  type DashboardFeedItemRow as FeedItemRow,
  readDashboardCollectedCoverage,
  readDashboardCollectionDates,
  readDashboardFeedItems,
  readDashboardRatings,
} from "./lib/reader-summary-quality-dashboard-published-window";
import {
  buildReaderSummaryClaimQuality,
  type ReaderSummaryClaimQualityReport,
} from "./lib/reader-summary-claim-quality";
import {
  isEligiblePrimaryTopReadInput,
  primarySummaryRepresentationEnough,
  readerFacingPrimaryCandidateCount,
} from "./lib/reader-summary-primary-source-quality";
import {
  asRecord,
  averageMetric,
  countBy,
  isDefined,
  isLocalDataSourceUnavailable,
  parseHost,
  primaryCounts as primaryCountsForSources,
  type ProviderCount,
  providerSkew,
  readDominantReaderSummaryQualityScope,
  readLatestReaderSummaryArtifact,
  readMetadataString,
  type ReaderSummaryQualityScope as Scope,
  stringValue,
  sumPrimaryCounts as sumPrimaryCountsForSources,
} from "./lib/reader-summary-quality-eval-support";
import { productionCollectionThresholds } from "./lib/production-collection-quality-policy";
import { weakTopReadOutrankingStrongSocialRows } from "./lib/reader-summary-top-read-order-audit";

type SourceBindingRow = {
  readonly id: string;
  readonly interestId: string;
  readonly providerKey: string;
  readonly config: unknown;
};

type ReaderSummaryQualityDashboardReport = {
  readonly schemaVersion: 1;
  readonly artifactFormat: "reader-summary-quality-dashboard-v1";
  readonly generatedBy: string;
  readonly model: {
    readonly liveNetwork: false;
    readonly reportBuilder: "persisted-reader-summary-multi-day-quality-gate";
    readonly rawPostTextPersistedInReport: false;
    readonly rawUserFeedbackPersistedInReport: false;
  };
  readonly inputs: {
    readonly database: "local-postgres";
    readonly dayCount: number;
    readonly cleanDayCount: number;
    readonly dirtyDayCount: number;
  };
  readonly aggregate: {
    readonly latestCleanDate?: string;
    readonly cleanBlockingPassed: boolean;
    readonly degradedCleanDates: readonly string[];
    readonly dirtyDates: readonly string[];
    readonly plannerRolloutProof: PlannerRolloutProofReport;
    readonly averageCleanCrossSourceClusterRate: number;
    readonly averageCleanTopReadProviderSkew: number;
    readonly averageCleanUnexplainedTopReadRate: number;
    readonly averageCleanLowConfidenceWithoutRiskRate: number;
    readonly totalPrimaryCollected: Record<string, number>;
    readonly totalPrimarySelected: Record<string, number>;
    readonly totalPrimaryTopReads: Record<string, number>;
  };
  readonly days: readonly ReaderSummaryQualityDayReport[];
  readonly qualityGates: Record<string, boolean>;
  readonly blockingPassed: boolean;
};

type ReaderSummaryQualityDayReport = {
  readonly collectionDate: string;
  readonly collectionIntegrity: CollectionIntegrityStatus;
  readonly scope: {
    readonly tenantFingerprint: string;
    readonly workspaceFingerprint: string;
  };
  readonly feed: {
    readonly collectedFeedItemCount: number;
    readonly providerCounts: readonly ProviderCount[];
    readonly interestCount: number;
  };
  readonly summary: {
    readonly artifactStatus: "present" | "missing";
    readonly artifactFingerprint?: string;
    readonly confidenceLevel: "none" | "low" | "medium" | "high";
    readonly confidenceScore: number;
    readonly selectedFeedItemCount: number;
    readonly storyClusterCount: number;
    readonly crossSourceClusterRate: number;
    readonly topReadCount: number;
    readonly lowConfidenceTopReadCount: number;
    readonly lowConfidenceTopReadRate: number;
    readonly technicalLeakCount: number;
    readonly topReadProviderSkew: number;
    readonly primarySelectedCounts: Record<string, number>;
    readonly primaryTopReadCounts: Record<string, number>;
  };
  readonly topReadQuality: TopReadQualityReport;
  readonly claimQuality: ReaderSummaryClaimQualityReport;
  readonly collectionStrategy: {
    readonly primarySources: Record<string, PrimarySourceStrategyReport>;
    readonly plannerCanary: PlannerCanaryReport;
    readonly gates: Record<string, boolean>;
    readonly warningSignals: Record<string, boolean>;
  };
  readonly feedbackShadow: {
    readonly mode: "shadow_no_ranking_influence";
    readonly ratingCount: number;
    readonly negativeRatingCount: number;
    readonly positiveRatingCount: number;
    readonly negativeReasonCounts: Record<string, number>;
    readonly providerNegativeRates: readonly {
      readonly providerKey: string;
      readonly ratingCount: number;
      readonly negativeRate: number;
    }[];
    readonly queryNegativeRates: readonly {
      readonly queryFingerprint: string;
      readonly ratingCount: number;
      readonly negativeRate: number;
    }[];
    readonly sourceNegativeRates: readonly {
      readonly sourceFingerprint: string;
      readonly ratingCount: number;
      readonly negativeRate: number;
    }[];
    readonly negativeTopReadMatchCount: number;
    readonly positiveTopReadMatchCount: number;
    readonly badProviderFingerprints: readonly string[];
    readonly badQueryFingerprints: readonly string[];
    readonly badSourceFingerprints: readonly string[];
    readonly rankingScoreAlignment: {
      readonly status:
        | "no_feedback"
        | "insufficient_matched_feedback"
        | "aligned"
        | "attention_needed";
      readonly matchedTopReadRatingCount: number;
      readonly averageMatchedTopReadSignalScore: number;
      readonly averageNegativeTopReadSignalScore: number;
      readonly averagePositiveTopReadSignalScore: number;
      readonly negativeHighScoreRatingCount: number;
      readonly positiveHighScoreRatingCount: number;
    };
    readonly gates: Record<string, boolean>;
  };
  readonly qualityGates: Record<string, boolean>;
  readonly warningSignals: Record<string, boolean>;
  readonly blockingPassed: boolean;
};

type TopReadQualityReport = {
  readonly rowCount: number;
  readonly unexplainedTopReadCount: number;
  readonly unexplainedTopReadRate: number;
  readonly lowConfidenceWithoutRiskCount: number;
  readonly lowConfidenceWithoutRiskRate: number;
  readonly weakTopReadOutrankingStrongSocialCount: number;
  readonly weakTopReadOutrankingStrongSocialRate: number;
  readonly selectionSignalCounts: Record<string, number>;
  readonly riskSignalCounts: Record<string, number>;
  readonly reliabilityRiskCounts: Record<string, number>;
  readonly providerContribution: readonly TopReadProviderContribution[];
  readonly rows: readonly TopReadQualityRow[];
  readonly gates: Record<string, boolean>;
};

type TopReadProviderContribution = {
  readonly providerKey: string;
  readonly selectedCount: number;
  readonly topReadCount: number;
  readonly selectedShare: number;
  readonly topReadShare: number;
  readonly topReadLift: number;
};

type TopReadQualityRow = {
  readonly index: number;
  readonly providerKey: string;
  readonly sourceFingerprint: string;
  readonly signalScore: number;
  readonly confidenceLevel: "low" | "medium" | "high";
  readonly citationCount: number;
  readonly confirmedProviderCount: number;
  readonly matchedRuleCount: number;
  readonly providerMetricCount: number;
  readonly selectionSignals: readonly string[];
  readonly riskSignals: readonly string[];
};

type PrimarySourceStrategyReport = {
  readonly collectedCount: number;
  readonly selectedCount: number;
  readonly topReadCount: number;
  readonly interestCount: number;
  readonly collectedForEveryInterest: boolean;
  readonly minCollectedPerInterest: number;
  readonly sourceBindingCount: number;
  readonly queryLaneCount: number;
  readonly productLaneCount: number;
  readonly eligibleTopReadCandidateCount: number;
  readonly readerFacingTopReadCandidateCount: number;
  readonly sourceSkewRatio: number;
  readonly topSourceFingerprints: readonly string[];
};

type PlannerCanaryReport = {
  readonly mode: "shadow_config_preview";
  readonly primarySources: Record<string, PlannerCanarySourceReport>;
  readonly gates: Record<string, boolean>;
  readonly warningSignals: Record<string, boolean>;
};

type PlannerCanarySourceReport = {
  readonly bindingCount: number;
  readonly canaryEnabledBindingCount: number;
  readonly plannedLaneCount: number;
  readonly executableLaneCount: number;
  readonly executedLaneCount: number;
  readonly observedLaneFingerprintCount: number;
  readonly plannedBudget: number;
  readonly compiledAppliedCount: number;
  readonly compiledSearchQueryCount: number;
  readonly compiledScanPassCount: number;
  readonly collectedCount: number;
  readonly selectedCount: number;
  readonly topReadCount: number;
  readonly lanes: readonly PlannerCanaryLaneReport[];
  readonly executedLaneFingerprints: readonly string[];
  readonly warnings: readonly string[];
};

type PlannerRolloutProofReport = {
  readonly status:
    "ready" | "missing_clean_collection" | "missing_clean_rollout_proof";
  readonly latestEligibleCleanDate?: string;
  readonly eligibleCleanDates: readonly string[];
  readonly blockedDates: readonly PlannerRolloutProofDateReport[];
  readonly gates: Record<string, boolean>;
};

type PlannerRolloutProofDateReport = {
  readonly collectionDate: string;
  readonly cleanCollection: boolean;
  readonly redditLaneMetadataPresent: boolean;
  readonly xTwitterLaneMetadataPresent: boolean;
  readonly redditExecutedLaneCount: number;
  readonly xTwitterExecutedLaneCount: number;
  readonly reasons: readonly string[];
};

type PlannerCanaryLaneReport = {
  readonly laneFingerprint: string;
  readonly kind: string;
  readonly operation: string;
  readonly maxItems: number;
  readonly queryFingerprint: string;
  readonly executionState: "executed" | "not_observable" | "not_seen_in_feed";
};

const outputPath = "ops/evals/reader-summary-quality-dashboard.v1.json";
const databaseUrl = yesterdaySocialQualityDatabaseUrl();
const update = process.argv.includes("--update");
const artifactOnly = process.argv.includes("--artifact-only");
const allowDegraded = process.argv.includes("--allow-degraded");
const primarySources = ["reddit", "x-twitter"] as const;
const technicalLeakPatterns = [
  /\bsource item\b/i,
  /\bcanonicalurl\b/i,
  /\bsource-binding\b/i,
  /\bsourcebinding\b/i,
  /\binterest:[0-9a-f-]{8,}\b/i,
  /\bprovider:[a-z0-9_-]+\b/i,
  /\bfeed_item\b/i,
  /\bsource_item\b/i,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
];

void main();

async function main(): Promise<void> {
  if (artifactOnly) {
    validateExistingReport({ allowDegraded });
    return;
  }

  const report = await tryBuildReport();

  if (report === undefined) {
    if (update) {
      throw new Error(
        "Local reader summary quality data source is unavailable; cannot update dashboard.",
      );
    }
    validateExistingReport({ allowDegraded });
    return;
  }

  const serialized = `${JSON.stringify(report, null, 2)}\n`;

  if (update) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, serialized);
    console.log(`Updated ${outputPath}`);
    if (!report.blockingPassed && !allowDegraded) {
      throw new Error("Reader summary quality dashboard gates failed");
    }
    return;
  }

  if (!report.blockingPassed && !allowDegraded) {
    console.error(serialized);
    throw new Error("Reader summary quality dashboard gates failed");
  }

  if (!existsSync(outputPath)) {
    throw new Error(
      `${outputPath} is missing. Run npm run check:reader-summary-quality-dashboard -- --update`,
    );
  }

  const expected = normalizeLineEndings(readFileSync(outputPath, "utf8"));
  if (expected !== serialized) {
    throw new Error(
      `${outputPath} is stale. Run npm run check:reader-summary-quality-dashboard -- --update`,
    );
  }

  console.log(
    `Reader summary quality dashboard OK (${report.inputs.dayCount} days, degraded=${report.aggregate.degradedCleanDates.length})`,
  );
}

async function tryBuildReport(): Promise<
  ReaderSummaryQualityDashboardReport | undefined
> {
  const pool = new Pool(yesterdaySocialQualityPoolConfig(databaseUrl, 2));

  try {
    const collectionDates = await readDashboardCollectionDates(
      pool,
      readOption("--date"),
    );
    if (collectionDates.length === 0) {
      throw new Error("No feed item collection days found");
    }

    const days: ReaderSummaryQualityDayReport[] = [];
    for (const collectionDate of collectionDates) {
      days.push(await buildDayReport(pool, collectionDate));
    }

    const cleanDays = days.filter(
      (day) => day.collectionIntegrity.status === "clean",
    );
    const dirtyDays = days.filter(
      (day) => day.collectionIntegrity.status !== "clean",
    );
    const degradedCleanDates = cleanDays
      .filter((day) => !day.blockingPassed)
      .map((day) => day.collectionDate);
    const plannerRolloutProof = buildPlannerRolloutProof(days);
    const aggregate = {
      latestCleanDate: cleanDays.at(-1)?.collectionDate,
      cleanBlockingPassed: degradedCleanDates.length === 0,
      degradedCleanDates,
      dirtyDates: dirtyDays.map((day) => day.collectionDate),
      plannerRolloutProof,
      averageCleanCrossSourceClusterRate: averageMetric(
        cleanDays.map((day) => day.summary.crossSourceClusterRate),
      ),
      averageCleanTopReadProviderSkew: averageMetric(
        cleanDays.map((day) => day.summary.topReadProviderSkew),
      ),
      averageCleanUnexplainedTopReadRate: averageMetric(
        cleanDays.map((day) => day.topReadQuality.unexplainedTopReadRate),
      ),
      averageCleanLowConfidenceWithoutRiskRate: averageMetric(
        cleanDays.map((day) => day.topReadQuality.lowConfidenceWithoutRiskRate),
      ),
      totalPrimaryCollected: sumPrimaryCounts(
        days.map((day) =>
          Object.fromEntries(
            day.feed.providerCounts.map((item) => [
              item.providerKey,
              item.count,
            ]),
          ),
        ),
      ),
      totalPrimarySelected: sumPrimaryCounts(
        days.map((day) => day.summary.primarySelectedCounts),
      ),
      totalPrimaryTopReads: sumPrimaryCounts(
        days.map((day) => day.summary.primaryTopReadCounts),
      ),
    };
    const reportWithoutSecretGate = {
      schemaVersion: 1,
      artifactFormat: "reader-summary-quality-dashboard-v1",
      generatedBy: "npm run check:reader-summary-quality-dashboard",
      model: {
        liveNetwork: false,
        reportBuilder: "persisted-reader-summary-multi-day-quality-gate",
        rawPostTextPersistedInReport: false,
        rawUserFeedbackPersistedInReport: false,
      },
      inputs: {
        database: "local-postgres",
        dayCount: days.length,
        cleanDayCount: cleanDays.length,
        dirtyDayCount: dirtyDays.length,
      },
      aggregate,
      days,
      qualityGates: {
        localDataAvailable: true,
        atLeastOneCollectionDay: days.length > 0,
        atLeastOneCleanCollectionDay: cleanDays.length > 0,
        cleanDaysPassBlockingGates: aggregate.cleanBlockingPassed,
        dirtyCollectionsAreExcludedFromCleanGates:
          dirtyDays.every((day) => !day.blockingPassed) ||
          dirtyDays.length === 0,
        plannerRolloutProofTracked:
          plannerRolloutProof.status === "ready" ||
          plannerRolloutProof.status === "missing_clean_collection" ||
          plannerRolloutProof.status === "missing_clean_rollout_proof",
        noRawSecretFragments: true,
      },
      blockingPassed: false,
    } satisfies ReaderSummaryQualityDashboardReport;
    const qualityGates = {
      ...reportWithoutSecretGate.qualityGates,
      noRawSecretFragments: noRawSecretFragments(reportWithoutSecretGate),
    };

    return {
      ...reportWithoutSecretGate,
      qualityGates,
      blockingPassed: Object.values(qualityGates).every(Boolean),
    };
  } catch (error) {
    if (!isLocalDataSourceUnavailable(error)) {
      throw error;
    }
    console.warn(
      `Reader summary quality dashboard local source unavailable: ${message(error)}`,
    );
    return undefined;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

async function buildDayReport(
  pool: Pool,
  collectionDate: string,
): Promise<ReaderSummaryQualityDayReport> {
  const scope = await readDominantReaderSummaryQualityScope(
    pool,
    collectionDate,
  );
  const collectionIntegrity = readCollectionIntegrityStatus(collectionDate);
  const feedItems = await readDashboardFeedItems(pool, scope, collectionDate);
  const artifactRecord = await readLatestReaderSummaryArtifact(
    pool,
    scope,
    collectionDate,
  );
  const collectedCoverage = await readDashboardCollectedCoverage(
    pool,
    scope,
    collectionDate,
  );
  const artifact =
    artifactRecord === null
      ? undefined
      : readerSummaryArtifactFromPrisma(artifactRecord);
  const view =
    artifact === undefined
      ? undefined
      : presentReaderSummaryArtifact(
          artifact,
          { status: "fresh", checkedAt: new Date() },
          { collectedCoverage },
        );
  const domainContent =
    artifact === undefined
      ? undefined
      : readerSummaryContentForArtifact(artifact);
  const providerCounts = countBy(feedItems, (item) => item.providerKey);
  const strategy = await buildCollectionStrategy({
    pool,
    scope,
    feedItems,
    view,
  });
  const claimQuality = buildReaderSummaryClaimQuality({ view, feedItems });
  const feedbackShadow = await buildFeedbackShadow(pool, {
    scope,
    collectionDate,
    view,
    feedItems,
  });
  const summary = buildSummaryMetrics(view, artifactRecord);
  const topReadQuality = buildTopReadQuality(
    view,
    domainContent?.topReads,
  );
  const feed = {
    collectedFeedItemCount: feedItems.length,
    providerCounts,
    interestCount: new Set(feedItems.map((item) => item.interestId)).size,
  };
  const warningSignals = {
    dirtyCollection: collectionIntegrity.status !== "clean",
    lowConfidenceTopReadsPresent: summary.lowConfidenceTopReadCount > 0,
    topReadProviderSkewAboveHalf: summary.topReadProviderSkew > 0.5,
    redditMissingFromTopReads: summary.primaryTopReadCounts.reddit === 0,
    xTwitterMissingFromTopReads:
      summary.primaryTopReadCounts["x-twitter"] === 0,
    queryLaneWeaknessDetected:
      strategy.warningSignals.redditQueryLanesMissing === true ||
      strategy.warningSignals.xTwitterQueryLanesMissing === true,
    plannerCanaryExecutionGap:
      strategy.plannerCanary.warningSignals.redditPlannedLanesNotExecuted ===
        true ||
      strategy.plannerCanary.warningSignals.xTwitterPlannedLanesNotExecuted ===
        true,
    unexplainedTopReadsPresent: topReadQuality.unexplainedTopReadCount > 0,
    lowConfidenceTopReadsWithoutRisk:
      topReadQuality.lowConfidenceWithoutRiskCount > 0,
    feedbackInsufficientForLearning:
      feedbackShadow.gates.enoughFeedbackForLearning === false,
  };
  const qualityGates = {
    collectionIntegrityCleanForEval: collectionIntegrity.status === "clean",
    artifactPresent: view !== undefined,
    summaryHasTopReads: curatedTopReadCountPasses({
      selectedFeedItemCount: summary.selectedFeedItemCount,
      topReadCount: summary.topReadCount,
      topReadQuality,
    }),
    summaryHasPrimarySourcesSelected: primarySources.every(
      (source) => (summary.primarySelectedCounts[source] ?? 0) >= 1,
    ),
    summaryHasPrimarySourcesInTopReads: primarySources.every(
      (source) => (summary.primaryTopReadCounts[source] ?? 0) >= 1,
    ),
    noTechnicalLeakage: summary.technicalLeakCount === 0,
    topReadProviderSkewControlled: topReadProviderSkewPasses(summary),
    topReadQualityPasses: Object.values(topReadQuality.gates).every(Boolean),
    claimQualityPasses: Object.values(claimQuality.gates).every(Boolean),
    primaryCollectionMinimumsPass:
      strategy.gates.redditCollectedEnough === true &&
      strategy.gates.xTwitterCollectedEnough === true &&
      (strategy.gates.redditEligibleCandidatesEnough === true ||
        strategy.gates.redditSummaryRepresentationEnough === true) &&
      (strategy.gates.xTwitterEligibleCandidatesEnough === true ||
        strategy.gates.xTwitterSummaryRepresentationEnough === true),
    primaryCollectionSourceSkewPass:
      strategy.gates.redditSourceSkewControlled === true &&
      strategy.gates.xTwitterSourceSkewControlled === true,
    plannerCanaryTelemetryPresent: Object.values(
      strategy.plannerCanary.gates,
    ).every(Boolean),
    feedbackShadowDoesNotInfluenceRanking:
      feedbackShadow.gates.noRankingInfluence === true,
  };

  return {
    collectionDate,
    collectionIntegrity,
    scope: {
      tenantFingerprint: fingerprint(String(scope.tenantId)),
      workspaceFingerprint: fingerprint(String(scope.workspaceId)),
    },
    feed,
    summary,
    topReadQuality,
    claimQuality,
    collectionStrategy: strategy,
    feedbackShadow,
    qualityGates,
    warningSignals,
    blockingPassed:
      collectionIntegrity.status === "clean" &&
      Object.values(qualityGates).every(Boolean),
  };
}

function buildPlannerRolloutProof(
  days: readonly ReaderSummaryQualityDayReport[],
): PlannerRolloutProofReport {
  const dateReports = days.map(plannerRolloutProofForDay);
  const eligibleCleanDates = dateReports
    .filter((item) => item.reasons.length === 0)
    .map((item) => item.collectionDate);
  const cleanCollectionAvailable = dateReports.some(
    (item) => item.cleanCollection,
  );
  const status =
    eligibleCleanDates.length > 0
      ? "ready"
      : cleanCollectionAvailable
        ? "missing_clean_rollout_proof"
        : "missing_clean_collection";

  return {
    status,
    latestEligibleCleanDate: eligibleCleanDates.at(-1),
    eligibleCleanDates,
    blockedDates: dateReports.filter((item) => item.reasons.length > 0),
    gates: {
      cleanCollectionAvailable,
      realPlannerRolloutProofAvailable: status === "ready",
      dirtyDaysExcludedFromRolloutProof: dateReports
        .filter((item) => !item.cleanCollection)
        .every((item) => item.reasons.includes("dirty_collection")),
    },
  };
}

function plannerRolloutProofForDay(
  day: ReaderSummaryQualityDayReport,
): PlannerRolloutProofDateReport {
  const reddit = day.collectionStrategy.plannerCanary.primarySources.reddit;
  const xTwitter =
    day.collectionStrategy.plannerCanary.primarySources["x-twitter"];
  const cleanCollection = day.collectionIntegrity.status === "clean";
  const redditObservedLaneFingerprintCount =
    reddit?.observedLaneFingerprintCount ?? 0;
  const xTwitterObservedLaneFingerprintCount =
    xTwitter?.observedLaneFingerprintCount ?? 0;
  const redditExecutedLaneCount = reddit?.executedLaneCount ?? 0;
  const xTwitterExecutedLaneCount = xTwitter?.executedLaneCount ?? 0;
  const redditExecutableLaneCount = reddit?.executableLaneCount ?? 0;
  const xTwitterExecutableLaneCount = xTwitter?.executableLaneCount ?? 0;
  const redditLaneMetadataPresent = redditObservedLaneFingerprintCount > 0;
  const xTwitterLaneMetadataPresent = xTwitterObservedLaneFingerprintCount > 0;
  const reasons: string[] = [];

  if (!cleanCollection) {
    reasons.push("dirty_collection");
  }
  if (!redditLaneMetadataPresent) {
    reasons.push("reddit_lane_metadata_missing");
  }
  if (!xTwitterLaneMetadataPresent) {
    reasons.push("x_twitter_lane_metadata_missing");
  }
  if (redditLaneMetadataPresent && redditExecutedLaneCount === 0) {
    reasons.push("reddit_lanes_not_executed");
  }
  if (xTwitterLaneMetadataPresent && xTwitterExecutedLaneCount === 0) {
    reasons.push("x_twitter_lanes_not_executed");
  }
  if (
    redditLaneMetadataPresent &&
    redditExecutableLaneCount > 0 &&
    redditExecutedLaneCount / redditExecutableLaneCount < 0.5
  ) {
    reasons.push("reddit_execution_under_planned_half");
  }
  if (
    xTwitterLaneMetadataPresent &&
    xTwitterExecutableLaneCount > 0 &&
    xTwitterExecutedLaneCount / xTwitterExecutableLaneCount < 0.5
  ) {
    reasons.push("x_twitter_execution_under_planned_half");
  }

  return {
    collectionDate: day.collectionDate,
    cleanCollection,
    redditLaneMetadataPresent,
    xTwitterLaneMetadataPresent,
    redditExecutedLaneCount,
    xTwitterExecutedLaneCount,
    reasons,
  };
}

function buildSummaryMetrics(
  view: ReaderSummaryArtifactView | undefined,
  artifactRecord: PrismaReaderSummaryArtifactRecord | null,
): ReaderSummaryQualityDayReport["summary"] {
  if (view === undefined || artifactRecord === null) {
    return {
      artifactStatus: "missing",
      confidenceLevel: "none",
      confidenceScore: 0,
      selectedFeedItemCount: 0,
      storyClusterCount: 0,
      crossSourceClusterRate: 0,
      topReadCount: 0,
      lowConfidenceTopReadCount: 0,
      lowConfidenceTopReadRate: 0,
      technicalLeakCount: 0,
      topReadProviderSkew: 0,
      primarySelectedCounts: primaryZeroCounts(),
      primaryTopReadCounts: primaryZeroCounts(),
    };
  }

  const lowConfidenceTopReadCount = view.content.topReads.filter(
    (item) => item.confidence.level === "low",
  ).length;
  const topReadProviderCounts = Object.fromEntries(
    countBy(view.content.topReads, (item) => item.providerKey).map((item) => [
      item.providerKey,
      item.count,
    ]),
  );
  const selectedProviderCounts = Object.fromEntries(
    view.coverage.providerBreakdown.map((item) => [
      item.providerKey,
      item.selectedFeedItemCount,
    ]),
  );

  return {
    artifactStatus: "present",
    artifactFingerprint: fingerprint(artifactRecord.id),
    confidenceLevel: view.confidence.level,
    confidenceScore: view.confidence.score,
    selectedFeedItemCount: view.coverage.selectedFeedItemCount,
    storyClusterCount: view.coverage.storyClusterCount,
    crossSourceClusterRate:
      view.coverage.storyClusterCount === 0
        ? 0
        : roundMetric(
            view.coverage.crossSourceClusterCount /
              view.coverage.storyClusterCount,
          ),
    topReadCount: view.content.topReads.length,
    lowConfidenceTopReadCount,
    lowConfidenceTopReadRate:
      view.content.topReads.length === 0
        ? 0
        : roundMetric(lowConfidenceTopReadCount / view.content.topReads.length),
    technicalLeakCount: countTechnicalLeaks(collectUserFacingText(view)),
    topReadProviderSkew: providerSkew(Object.values(topReadProviderCounts)),
    primarySelectedCounts: primaryCounts(selectedProviderCounts),
    primaryTopReadCounts: primaryCounts(topReadProviderCounts),
  };
}

function buildTopReadQuality(
  view: ReaderSummaryArtifactView | undefined,
  persistedTopReads:
    | ReturnType<typeof readerSummaryContentForArtifact>["topReads"]
    | undefined,
): TopReadQualityReport {
  if (view === undefined) {
    return {
      rowCount: 0,
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
        telemetryAvailableForArtifact: false,
        everyTopReadHasSelectionSignal: false,
        noWeakTopReadOutranksStrongSocialRead: false,
      },
    };
  }

  const duplicateTitleFingerprints = duplicateFingerprintSet(
    view.content.topReads.map((read) =>
      fingerprint(normalizeHumanKey(read.title)),
    ),
  );
  const citationProviderKeysByRead = citationProviderKeysByTopRead(view);
  const rows = view.content.topReads.map((read, index) => {
    const citationProviderKeys =
      citationProviderKeysByRead.get(index) ?? new Set<string>();
    const riskSignals = topReadRiskSignals({
      read,
      citationProviderKeys,
      duplicateTitleFingerprints,
    });

    return {
      index: index + 1,
      providerKey: read.providerKey,
      sourceFingerprint: fingerprint(
        `${read.providerKey}:${read.canonicalUrl ?? read.title}`,
      ),
      signalScore: roundMetric(read.signalScore),
      confidenceLevel: read.confidence.level,
      citationCount: read.citationIds.length,
      confirmedProviderCount: read.confirmedProviderKeys.length,
      matchedRuleCount: read.matchedRules.length,
      providerMetricCount: read.providerMetrics.length,
      selectionSignals: topReadSelectionSignals(read),
      riskSignals,
    } satisfies TopReadQualityRow;
  });
  const unexplainedTopReadCount = rows.filter(
    (row) => row.selectionSignals.length === 0,
  ).length;
  const lowConfidenceWithoutRiskCount = rows.filter(
    (row) =>
      row.confidenceLevel === "low" &&
      !row.riskSignals.some((signal) => signal !== "low_confidence"),
  ).length;
  const weakTopReadOutrankingStrongSocialCount =
    weakTopReadOutrankingStrongSocialRows({
      rows,
      topReads: view.content.topReads,
      persistedTopReads,
    }).length;

  return {
    rowCount: rows.length,
    unexplainedTopReadCount,
    unexplainedTopReadRate: ratio(unexplainedTopReadCount, rows.length),
    lowConfidenceWithoutRiskCount,
    lowConfidenceWithoutRiskRate: ratio(
      lowConfidenceWithoutRiskCount,
      rows.length,
    ),
    weakTopReadOutrankingStrongSocialCount,
    weakTopReadOutrankingStrongSocialRate: ratio(
      weakTopReadOutrankingStrongSocialCount,
      rows.length,
    ),
    selectionSignalCounts: countedRecord(
      rows.flatMap((row) => row.selectionSignals),
    ),
    riskSignalCounts: countedRecord(rows.flatMap((row) => row.riskSignals)),
    reliabilityRiskCounts: countedRecord(
      view.content.reliabilityReport.risks.map(
        (risk) => `${risk.kind}:${risk.level}`,
      ),
    ),
    providerContribution: buildTopReadProviderContribution(view),
    rows,
    gates: {
      telemetryAvailableForArtifact:
        rows.length === view.content.topReads.length &&
        view.content.topReads.length > 0,
      everyTopReadHasSelectionSignal: unexplainedTopReadCount === 0,
      noWeakTopReadOutranksStrongSocialRead:
        weakTopReadOutrankingStrongSocialCount === 0,
    },
  };
}

function buildTopReadProviderContribution(
  view: ReaderSummaryArtifactView,
): readonly TopReadProviderContribution[] {
  const topReadCounts = new Map(
    countBy(view.content.topReads, (read) => read.providerKey).map((item) => [
      item.providerKey,
      item.count,
    ]),
  );
  const selectedTotal = view.coverage.providerBreakdown.reduce(
    (sum, item) => sum + item.selectedFeedItemCount,
    0,
  );
  const topReadTotal = view.content.topReads.length;

  return view.coverage.providerBreakdown.map((item) => {
    const selectedShare = ratio(item.selectedFeedItemCount, selectedTotal);
    const topReadShare = ratio(
      topReadCounts.get(item.providerKey) ?? 0,
      topReadTotal,
    );

    return {
      providerKey: item.providerKey,
      selectedCount: item.selectedFeedItemCount,
      topReadCount: topReadCounts.get(item.providerKey) ?? 0,
      selectedShare,
      topReadShare,
      topReadLift:
        selectedShare === 0 ? 0 : roundMetric(topReadShare / selectedShare),
    };
  });
}

function topReadSelectionSignals(
  read: ReaderSummaryArtifactView["content"]["topReads"][number],
): readonly string[] {
  return [
    read.signalScore >= 0.7
      ? "high_signal_score"
      : read.signalScore >= 0.4
        ? "medium_signal_score"
        : "low_signal_score",
    read.confidence.level === "high"
      ? "high_confidence"
      : read.confidence.level === "medium"
        ? "medium_confidence"
        : "low_confidence",
    read.matchedRules.length > 0 ? "matched_interest_rules" : undefined,
    read.providerMetrics.length > 0 ? "provider_metrics" : undefined,
    read.confirmedProviderKeys.length > 1
      ? "cross_provider_confirmation"
      : undefined,
    read.citationIds.length > 1 ? "multi_citation_evidence" : undefined,
    read.whyNow.trim().length > 0 ? "has_why_now" : undefined,
    read.whyImportant.length > 0 ? "has_why_important" : undefined,
  ].filter(isDefined);
}

function topReadRiskSignals(params: {
  readonly read: ReaderSummaryArtifactView["content"]["topReads"][number];
  readonly citationProviderKeys: ReadonlySet<string>;
  readonly duplicateTitleFingerprints: ReadonlySet<string>;
}): readonly string[] {
  const read = params.read;
  const riskSignals = [
    read.confidence.level === "low" ? "low_confidence" : undefined,
    read.signalScore < 0.4 ? "low_signal_score" : undefined,
    read.citationIds.length <= 1 ? "low_evidence" : undefined,
    read.providerMetrics.length === 0 ? "weak_provider_metrics" : undefined,
    params.citationProviderKeys.size <= 1 &&
    read.confirmedProviderKeys.length <= 1
      ? "single_source"
      : undefined,
    params.duplicateTitleFingerprints.has(
      fingerprint(normalizeHumanKey(read.title)),
    )
      ? "duplicate_title"
      : undefined,
  ].filter(isDefined);

  return [...new Set(riskSignals)].sort((left, right) =>
    left.localeCompare(right),
  );
}

function citationProviderKeysByTopRead(
  view: ReaderSummaryArtifactView,
): ReadonlyMap<number, ReadonlySet<string>> {
  const providerKeyByCitationId = new Map(
    view.citations.map((citation) => [
      citation.citationId,
      citation.providerKey,
    ]),
  );

  return new Map(
    view.content.topReads.map((read, index) => [
      index,
      new Set(
        read.citationIds
          .map((citationId) => providerKeyByCitationId.get(citationId))
          .filter(isDefined),
      ),
    ]),
  );
}

function duplicateFingerprintSet(
  values: readonly string[],
): ReadonlySet<string> {
  return new Set(
    countBy(values, (value) => value)
      .filter((item) => item.count > 1)
      .map((item) => item.providerKey),
  );
}

function countedRecord(values: readonly string[]): Record<string, number> {
  return Object.fromEntries(
    countBy(values, (value) => value).map((item) => [
      item.providerKey,
      item.count,
    ]),
  );
}

function normalizeHumanKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function ratio(value: number, total: number): number {
  return total <= 0 ? 0 : roundMetric(value / total);
}

async function buildCollectionStrategy(params: {
  readonly pool: Pool;
  readonly scope: Scope;
  readonly feedItems: readonly FeedItemRow[];
  readonly view: ReaderSummaryArtifactView | undefined;
}): Promise<ReaderSummaryQualityDayReport["collectionStrategy"]> {
  const reddit = buildPrimarySourceStrategy(
    "reddit",
    params.feedItems,
    params.view,
  );
  const xTwitter = buildPrimarySourceStrategy(
    "x-twitter",
    params.feedItems,
    params.view,
  );
  const primaryReports = {
    reddit,
    "x-twitter": xTwitter,
  };
  const plannerCanary = await buildPlannerCanaryReport({
    pool: params.pool,
    scope: params.scope,
    feedItems: params.feedItems,
    primaryReports,
  });
  const gates = {
    redditCollectedEnough: reddit.collectedCount >= 25,
    xTwitterCollectedEnough:
      xTwitter.collectedCount >=
      productionCollectionThresholds.xTwitterCollectedFeedItems,
    redditEligibleCandidatesEnough: reddit.eligibleTopReadCandidateCount >= 8,
    xTwitterEligibleCandidatesEnough:
      xTwitter.eligibleTopReadCandidateCount >= 8,
    redditSummaryRepresentationEnough:
      primarySummaryRepresentationEnough(reddit),
    xTwitterSummaryRepresentationEnough:
      primarySummaryRepresentationEnough(xTwitter),
    redditSourceSkewControlled: reddit.sourceSkewRatio <= 0.75,
    xTwitterSourceSkewControlled: xTwitter.sourceSkewRatio <= 0.75,
  };
  const warningSignals = {
    redditQueryLanesMissing: reddit.queryLaneCount < 2,
    xTwitterQueryLanesMissing: xTwitter.queryLaneCount < 2,
    redditTopNewLatestMixMissing: reddit.productLaneCount < 2,
    xTwitterTopNewLatestMixMissing: xTwitter.productLaneCount < 2,
    redditNotCollectedForEveryInterest: !reddit.collectedForEveryInterest,
    xTwitterNotCollectedForEveryInterest: !xTwitter.collectedForEveryInterest,
  };

  return {
    primarySources: primaryReports,
    plannerCanary,
    gates,
    warningSignals,
  };
}

function curatedTopReadCountPasses(params: {
  readonly selectedFeedItemCount: number;
  readonly topReadCount: number;
  readonly topReadQuality: TopReadQualityReport;
}): boolean {
  const strictTarget = Math.min(8, params.selectedFeedItemCount);
  if (params.topReadCount >= strictTarget) {
    return true;
  }

  return (
    params.topReadCount >= 5 &&
    params.topReadQuality.gates.everyTopReadHasSelectionSignal === true &&
    params.topReadQuality.gates.noWeakTopReadOutranksStrongSocialRead === true
  );
}

function topReadProviderSkewPasses(
  summary: ReaderSummaryQualityDayReport["summary"],
): boolean {
  const skewLimit = summary.topReadCount < 10 ? 0.75 : 0.6;

  return summary.topReadProviderSkew <= skewLimit;
}

async function buildPlannerCanaryReport(params: {
  readonly pool: Pool;
  readonly scope: Scope;
  readonly feedItems: readonly FeedItemRow[];
  readonly primaryReports: Record<string, PrimarySourceStrategyReport>;
}): Promise<PlannerCanaryReport> {
  const bindings = await readPrimarySourceBindings(params.pool, params.scope);
  const reddit = await buildPlannerCanarySourceReport({
    providerKey: "reddit",
    bindings,
    feedItems: params.feedItems,
    primaryReport: params.primaryReports.reddit,
  });
  const xTwitter = await buildPlannerCanarySourceReport({
    providerKey: "x-twitter",
    bindings,
    feedItems: params.feedItems,
    primaryReport: params.primaryReports["x-twitter"],
  });

  return {
    mode: "shadow_config_preview",
    primarySources: {
      reddit,
      "x-twitter": xTwitter,
    },
    gates: {
      redditPlannerPreviewAvailable:
        reddit.canaryEnabledBindingCount > 0 && reddit.plannedLaneCount > 0,
      xTwitterPlannerPreviewAvailable:
        xTwitter.canaryEnabledBindingCount > 0 && xTwitter.plannedLaneCount > 0,
    },
    warningSignals: {
      redditPlannedLanesNotExecuted:
        reddit.observedLaneFingerprintCount > 0 &&
        reddit.plannedLaneCount > 0 &&
        reddit.executedLaneCount === 0,
      xTwitterPlannedLanesNotExecuted:
        xTwitter.observedLaneFingerprintCount > 0 &&
        xTwitter.plannedLaneCount > 0 &&
        xTwitter.executedLaneCount === 0,
      redditLaneMetadataMissing:
        reddit.collectedCount > 0 && reddit.observedLaneFingerprintCount === 0,
      xTwitterLaneMetadataMissing:
        xTwitter.collectedCount > 0 &&
        xTwitter.observedLaneFingerprintCount === 0,
      redditExecutionUnderPlannedHalf:
        reddit.observedLaneFingerprintCount > 0 &&
        reddit.executableLaneCount > 0 &&
        reddit.executedLaneCount / reddit.executableLaneCount < 0.5,
      xTwitterExecutionUnderPlannedHalf:
        xTwitter.observedLaneFingerprintCount > 0 &&
        xTwitter.executableLaneCount > 0 &&
        xTwitter.executedLaneCount / xTwitter.executableLaneCount < 0.5,
    },
  };
}

async function buildPlannerCanarySourceReport(params: {
  readonly providerKey: "reddit" | "x-twitter";
  readonly bindings: readonly SourceBindingRow[];
  readonly feedItems: readonly FeedItemRow[];
  readonly primaryReport: PrimarySourceStrategyReport | undefined;
}): Promise<PlannerCanarySourceReport> {
  const planner = new SocialResearchSourceQueryPlannerAdapter();
  const compiler = new DefaultSourceQueryPlanRuntimeCompiler();
  const providerBindings = params.bindings.filter(
    (binding) => binding.providerKey === params.providerKey,
  );
  const providerFeedItems = params.feedItems.filter(
    (item) => item.providerKey === params.providerKey,
  );
  const executedLaneFingerprints = executedLaneFingerprintsForProvider(
    params.providerKey,
    providerFeedItems,
  );
  const executedLaneSet = new Set(executedLaneFingerprints);
  const laneReports: PlannerCanaryLaneReport[] = [];
  const warnings: string[] = [];
  let plannedBudget = 0;
  let compiledAppliedCount = 0;
  let compiledSearchQueryCount = 0;
  let compiledScanPassCount = 0;

  for (const binding of providerBindings) {
    const runtimeConfig = canaryPlannerConfig(
      params.providerKey,
      binding.config,
    );
    const sourceQuery = sourceQueryFromBinding(binding);

    try {
      const plan = await planner.compilePlan({
        intent: sourceQueryPlannerIntentFromConfig({
          providerKey: params.providerKey,
          sourceQuery,
          config: runtimeConfig,
        }),
      });
      const compiled = compiler.compile({
        providerKey: params.providerKey,
        originalSourceQuery: sourceQuery,
        runtimeConfig,
        plan,
      });

      if (compiled.applied) {
        compiledAppliedCount += 1;
      }
      compiledSearchQueryCount += readRuntimeArray(
        compiled.sourceQuery.parameters?.searchQueries,
      ).length;
      compiledScanPassCount += readRuntimeArray(
        compiled.sourceQuery.parameters?.scanPasses,
      ).length;
      warnings.push(...plan.warnings, ...compiled.warnings);

      for (const lane of plan.lanes.filter(
        (lane) => lane.sourceKey === params.providerKey,
      )) {
        const queryFingerprint = plannerLaneQueryFingerprint(lane.query);
        plannedBudget += lane.maxItems;
        laneReports.push({
          laneFingerprint: fingerprint(
            `${params.providerKey}:${lane.kind}:${lane.operation}:${lane.query}`,
          ),
          kind: lane.kind,
          operation: lane.operation,
          maxItems: lane.maxItems,
          queryFingerprint,
          executionState: plannerLaneExecutionState({
            queryFingerprint,
            executedLaneSet,
            observedLaneFingerprintCount: executedLaneFingerprints.length,
            collectedCount: providerFeedItems.length,
          }),
        });
      }
    } catch (error) {
      warnings.push(
        `source_query_planner.canary_preview_failed:${fingerprint(
          message(error),
        )}`,
      );
    }
  }

  return {
    bindingCount: providerBindings.length,
    canaryEnabledBindingCount: providerBindings.length,
    plannedLaneCount: laneReports.length,
    executableLaneCount: laneReports.filter(
      (lane) => lane.operation !== "enrichment",
    ).length,
    executedLaneCount: laneReports.filter(
      (lane) => lane.executionState === "executed",
    ).length,
    observedLaneFingerprintCount: executedLaneFingerprints.length,
    plannedBudget,
    compiledAppliedCount,
    compiledSearchQueryCount,
    compiledScanPassCount,
    collectedCount:
      params.primaryReport?.collectedCount ?? providerFeedItems.length,
    selectedCount: params.primaryReport?.selectedCount ?? 0,
    topReadCount: params.primaryReport?.topReadCount ?? 0,
    lanes: laneReports,
    executedLaneFingerprints,
    warnings: uniqueStrings(warnings),
  };
}

function buildPrimarySourceStrategy(
  providerKey: "reddit" | "x-twitter",
  feedItems: readonly FeedItemRow[],
  view: ReaderSummaryArtifactView | undefined,
): PrimarySourceStrategyReport {
  const providerItems = feedItems.filter(
    (item) => item.providerKey === providerKey,
  );
  const allInterestIds = new Set(feedItems.map((item) => item.interestId));
  const countsByInterest = countBy(providerItems, (item) => item.interestId);
  const sourceBindingCount = new Set(
    providerItems.map((item) => item.sourceBindingId),
  ).size;
  const queryLaneCount = new Set(
    providerItems
      .map(
        (item) =>
          sourceQueryLaneQuery(asRecord(item.providerMetadata)) ??
          readMetadataString(item.providerMetadata, "searchQuery"),
      )
      .filter(isDefined),
  ).size;
  const productLaneCount = new Set(
    providerItems
      .map((item) => sourceProduct(item.providerMetadata))
      .filter(isDefined),
  ).size;
  const sourceCounts = countBy(providerItems, (item) =>
    providerSourceKey(providerKey, item),
  );
  const selectedCount =
    view?.coverage.providerBreakdown.find(
      (item) => item.providerKey === providerKey,
    )?.selectedFeedItemCount ?? 0;
  const topReadCount =
    view?.content.topReads.filter((item) => item.providerKey === providerKey)
      .length ?? 0;
  const readerFacingTopReadCandidateCount = readerFacingPrimaryCandidateCount({
    providerKey,
    selectedPosts: view?.content.selectedPosts ?? [],
  });

  return {
    collectedCount: providerItems.length,
    selectedCount,
    topReadCount,
    interestCount: countsByInterest.length,
    collectedForEveryInterest:
      allInterestIds.size > 0 &&
      [...allInterestIds].every((interestId) =>
        providerItems.some((item) => item.interestId === interestId),
      ),
    minCollectedPerInterest:
      allInterestIds.size === 0
        ? 0
        : Math.min(
            ...[...allInterestIds].map(
              (interestId) =>
                countsByInterest.find((item) => item.providerKey === interestId)
                  ?.count ?? 0,
            ),
          ),
    sourceBindingCount,
    queryLaneCount: Math.max(queryLaneCount, sourceBindingCount),
    productLaneCount,
    eligibleTopReadCandidateCount: providerItems.filter(
      isEligiblePrimaryTopReadInput,
    ).length,
    readerFacingTopReadCandidateCount,
    sourceSkewRatio: providerSkew(sourceCounts.map((item) => item.count)),
    topSourceFingerprints: sourceCounts
      .slice(0, 5)
      .map((item) => fingerprint(`${providerKey}:${item.providerKey}`)),
  };
}

async function buildFeedbackShadow(
  pool: Pool,
  params: {
    readonly scope: Scope;
    readonly collectionDate: string;
    readonly view: ReaderSummaryArtifactView | undefined;
    readonly feedItems: readonly FeedItemRow[];
  },
): Promise<ReaderSummaryQualityDayReport["feedbackShadow"]> {
  const ratings = await readDashboardRatings(
    pool,
    params.scope,
    params.collectionDate,
  );
  const feedItemIds = new Set(params.feedItems.map((item) => item.id));
  const sourceItemIds = new Set(
    params.feedItems.map((item) => item.sourceItemId),
  );
  const feedItemByFeedId = new Map(
    params.feedItems.map((item) => [item.id, item]),
  );
  const feedItemBySourceId = new Map(
    params.feedItems.map((item) => [item.sourceItemId, item]),
  );
  const dayRatings = ratings.filter((rating) => {
    const target = ratingTarget(rating.target);
    return (
      (target.feedItemId !== undefined && feedItemIds.has(target.feedItemId)) ||
      (target.sourceItemId !== undefined &&
        sourceItemIds.has(target.sourceItemId))
    );
  });
  const providerCounts = new Map<string, { total: number; negative: number }>();
  const queryCounts = new Map<string, { total: number; negative: number }>();
  const sourceCounts = new Map<string, { total: number; negative: number }>();
  const negativeReasonCounts = new Map<string, number>();
  const topReadFingerprints = new Set(
    params.view?.content.topReads.map((item) =>
      fingerprint(`${item.providerKey}:${item.canonicalUrl ?? item.title}`),
    ) ?? [],
  );
  const topReadScoresByTarget = topReadSignalScoresByTarget(params.view);
  const matchedTopReadScores: number[] = [];
  const negativeTopReadScores: number[] = [];
  const positiveTopReadScores: number[] = [];
  let negativeTopReadMatchCount = 0;
  let positiveTopReadMatchCount = 0;
  let negativeHighScoreRatingCount = 0;
  let positiveHighScoreRatingCount = 0;

  for (const rating of dayRatings) {
    if (rating.rating === null) {
      continue;
    }
    const target = ratingTarget(rating.target);
    const matchedFeedItem = feedItemForRatingTarget({
      target,
      feedItemByFeedId,
      feedItemBySourceId,
    });
    const providerKey =
      target.providerKey ?? matchedFeedItem?.providerKey ?? "unknown";
    const current = providerCounts.get(providerKey) ?? {
      total: 0,
      negative: 0,
    };
    const isNegative = rating.rating <= 2;
    current.total += 1;
    current.negative += isNegative ? 1 : 0;
    providerCounts.set(providerKey, current);
    if (matchedFeedItem !== undefined) {
      const queryFingerprint = queryLaneFingerprint(matchedFeedItem);
      if (queryFingerprint !== undefined) {
        incrementNegativeRate(queryCounts, queryFingerprint, isNegative);
      }
      incrementNegativeRate(
        sourceCounts,
        fingerprint(
          `${matchedFeedItem.providerKey}:${feedSourceKey(matchedFeedItem)}`,
        ),
        isNegative,
      );
    }

    if (isNegative && target.postRatingReason !== undefined) {
      negativeReasonCounts.set(
        target.postRatingReason,
        (negativeReasonCounts.get(target.postRatingReason) ?? 0) + 1,
      );
    }

    const targetFingerprint = fingerprint(
      `${providerKey}:${target.canonicalUrl ?? target.title ?? target.feedItemId ?? ""}`,
    );
    const matchedScore = topReadScoreForTarget(topReadScoresByTarget, target);
    if (matchedScore !== undefined) {
      matchedTopReadScores.push(matchedScore);
      if (isNegative) {
        negativeTopReadScores.push(matchedScore);
        if (matchedScore >= 0.7) {
          negativeHighScoreRatingCount += 1;
        }
      } else if (rating.rating >= 4) {
        positiveTopReadScores.push(matchedScore);
        if (matchedScore >= 0.7) {
          positiveHighScoreRatingCount += 1;
        }
      }
    }
    if (
      matchedScore !== undefined ||
      topReadFingerprints.has(targetFingerprint)
    ) {
      if (isNegative) {
        negativeTopReadMatchCount += 1;
      } else if (rating.rating >= 4) {
        positiveTopReadMatchCount += 1;
      }
    }
  }

  const providerNegativeRates = [...providerCounts.entries()]
    .map(([providerKey, counts]) => ({
      providerKey,
      ratingCount: counts.total,
      negativeRate:
        counts.total === 0 ? 0 : roundMetric(counts.negative / counts.total),
    }))
    .sort(
      (left, right) =>
        right.negativeRate - left.negativeRate ||
        right.ratingCount - left.ratingCount ||
        left.providerKey.localeCompare(right.providerKey),
    );
  const queryNegativeRates = queryNegativeRateRows(queryCounts);
  const sourceNegativeRates = sourceNegativeRateRows(sourceCounts);
  const ratingCount = dayRatings.filter(
    (rating) => rating.rating !== null,
  ).length;
  const negativeRatingCount = dayRatings.filter(
    (rating) => rating.rating !== null && rating.rating <= 2,
  ).length;
  const positiveRatingCount = dayRatings.filter(
    (rating) => rating.rating !== null && rating.rating >= 4,
  ).length;

  return {
    mode: "shadow_no_ranking_influence",
    ratingCount,
    negativeRatingCount,
    positiveRatingCount,
    negativeReasonCounts: Object.fromEntries(
      [...negativeReasonCounts.entries()].sort((left, right) =>
        left[0].localeCompare(right[0]),
      ),
    ),
    providerNegativeRates,
    queryNegativeRates,
    sourceNegativeRates,
    negativeTopReadMatchCount,
    positiveTopReadMatchCount,
    badProviderFingerprints: providerNegativeRates
      .filter((item) => item.ratingCount >= 3 && item.negativeRate >= 0.5)
      .map((item) => fingerprint(item.providerKey)),
    badQueryFingerprints: queryNegativeRates
      .filter((item) => item.ratingCount >= 3 && item.negativeRate >= 0.5)
      .map((item) => item.queryFingerprint),
    badSourceFingerprints: sourceNegativeRates
      .filter((item) => item.ratingCount >= 3 && item.negativeRate >= 0.5)
      .map((item) => item.sourceFingerprint),
    rankingScoreAlignment: {
      status: rankingScoreAlignmentStatus({
        ratingCount,
        matchedTopReadRatingCount: matchedTopReadScores.length,
        negativeHighScoreRatingCount,
        positiveHighScoreRatingCount,
      }),
      matchedTopReadRatingCount: matchedTopReadScores.length,
      averageMatchedTopReadSignalScore: averageMetric(matchedTopReadScores),
      averageNegativeTopReadSignalScore: averageMetric(negativeTopReadScores),
      averagePositiveTopReadSignalScore: averageMetric(positiveTopReadScores),
      negativeHighScoreRatingCount,
      positiveHighScoreRatingCount,
    },
    gates: {
      noRankingInfluence: true,
      enoughFeedbackForLearning: ratingCount >= 20,
      negativeRatingsHaveReason:
        negativeRatingCount === 0 ||
        [...negativeReasonCounts.values()].reduce(
          (sum, count) => sum + count,
          0,
        ) === negativeRatingCount,
      noHighRankNegativeCluster: negativeTopReadMatchCount <= 2,
    },
  };
}

function topReadSignalScoresByTarget(
  view: ReaderSummaryArtifactView | undefined,
): ReadonlyMap<string, number> {
  const scores = new Map<string, number>();
  if (view === undefined) {
    return scores;
  }

  const citationById = new Map(
    view.citations.map((citation) => [citation.citationId, citation]),
  );
  for (const read of view.content.topReads) {
    for (const citationId of read.citationIds) {
      const citation = citationById.get(citationId);
      if (citation === undefined) {
        continue;
      }
      scores.set(`feed:${citation.feedItemId}`, read.signalScore);
      scores.set(`source:${citation.sourceItemId}`, read.signalScore);
    }
  }

  return scores;
}

function feedItemForRatingTarget(params: {
  readonly target: ReturnType<typeof ratingTarget>;
  readonly feedItemByFeedId: ReadonlyMap<string, FeedItemRow>;
  readonly feedItemBySourceId: ReadonlyMap<string, FeedItemRow>;
}): FeedItemRow | undefined {
  if (params.target.feedItemId !== undefined) {
    const item = params.feedItemByFeedId.get(params.target.feedItemId);
    if (item !== undefined) {
      return item;
    }
  }
  if (params.target.sourceItemId !== undefined) {
    return params.feedItemBySourceId.get(params.target.sourceItemId);
  }

  return undefined;
}

function queryLaneFingerprint(item: FeedItemRow): string | undefined {
  const query =
    readMetadataString(item.providerMetadata, "searchQuery") ??
    sourceProduct(item.providerMetadata);

  return query === undefined
    ? undefined
    : fingerprint(`${item.providerKey}:${query.toLowerCase()}`);
}

function feedSourceKey(item: FeedItemRow): string {
  if (item.providerKey === "reddit") {
    return providerSourceKey("reddit", item);
  }
  if (item.providerKey === "x-twitter") {
    return providerSourceKey("x-twitter", item);
  }

  return parseHost(item.canonicalUrl) ?? item.authorHandle ?? "unknown";
}

function incrementNegativeRate(
  counts: Map<string, { total: number; negative: number }>,
  key: string,
  isNegative: boolean,
): void {
  const current = counts.get(key) ?? { total: 0, negative: 0 };
  counts.set(key, {
    total: current.total + 1,
    negative: current.negative + (isNegative ? 1 : 0),
  });
}

function queryNegativeRateRows(
  counts: ReadonlyMap<string, { total: number; negative: number }>,
): readonly {
  readonly queryFingerprint: string;
  readonly ratingCount: number;
  readonly negativeRate: number;
}[] {
  return [...counts.entries()]
    .map(([queryFingerprint, value]) => ({
      queryFingerprint,
      ratingCount: value.total,
      negativeRate:
        value.total === 0 ? 0 : roundMetric(value.negative / value.total),
    }))
    .sort(
      (left, right) =>
        right.negativeRate - left.negativeRate ||
        right.ratingCount - left.ratingCount ||
        left.queryFingerprint.localeCompare(right.queryFingerprint),
    );
}

function sourceNegativeRateRows(
  counts: ReadonlyMap<string, { total: number; negative: number }>,
): readonly {
  readonly sourceFingerprint: string;
  readonly ratingCount: number;
  readonly negativeRate: number;
}[] {
  return [...counts.entries()]
    .map(([sourceFingerprint, value]) => ({
      sourceFingerprint,
      ratingCount: value.total,
      negativeRate:
        value.total === 0 ? 0 : roundMetric(value.negative / value.total),
    }))
    .sort(
      (left, right) =>
        right.negativeRate - left.negativeRate ||
        right.ratingCount - left.ratingCount ||
        left.sourceFingerprint.localeCompare(right.sourceFingerprint),
    );
}

function topReadScoreForTarget(
  scores: ReadonlyMap<string, number>,
  target: ReturnType<typeof ratingTarget>,
): number | undefined {
  if (target.feedItemId !== undefined) {
    const score = scores.get(`feed:${target.feedItemId}`);
    if (score !== undefined) {
      return score;
    }
  }
  if (target.sourceItemId !== undefined) {
    return scores.get(`source:${target.sourceItemId}`);
  }

  return undefined;
}

function rankingScoreAlignmentStatus(params: {
  readonly ratingCount: number;
  readonly matchedTopReadRatingCount: number;
  readonly negativeHighScoreRatingCount: number;
  readonly positiveHighScoreRatingCount: number;
}): ReaderSummaryQualityDayReport["feedbackShadow"]["rankingScoreAlignment"]["status"] {
  if (params.ratingCount === 0) {
    return "no_feedback";
  }
  if (params.matchedTopReadRatingCount < 5) {
    return "insufficient_matched_feedback";
  }
  if (
    params.negativeHighScoreRatingCount > params.positiveHighScoreRatingCount
  ) {
    return "attention_needed";
  }

  return "aligned";
}

async function readPrimarySourceBindings(
  pool: Pool,
  scope: Scope,
): Promise<readonly SourceBindingRow[]> {
  const result = await pool.query<SourceBindingRow>(
    `
      select
        sb.id::text as "id",
        sb.interest_id::text as "interestId",
        sce.provider_key as "providerKey",
        sb.config as "config"
      from source_bindings sb
      join source_catalog_entries sce
        on sce.id = sb.source_catalog_entry_id
      where sb.tenant_id = $1::uuid
        and sb.workspace_id = $2::uuid
        and sb.deleted_at is null
        and sb.status = 'ENABLED'
        and sce.provider_key in ('reddit', 'x-twitter')
      order by sce.provider_key, sb.created_at, sb.id
    `,
    [scope.tenantId, scope.workspaceId],
  );

  return result.rows;
}

function canaryPlannerConfig(
  providerKey: "reddit" | "x-twitter",
  value: unknown,
): SourceRuntimeConfig {
  const config = asRecord(value);
  const planner = asRecord(config.sourceQueryPlanner);

  return {
    ...(config as SourceRuntimeConfig),
    sourceQueryPlanner: {
      ...(planner as SourceRuntimeConfig),
      enabled: true,
      maxLanesPerSource: 8,
      maxItemsPerLane: 25,
      includeEnrichment: providerKey === "reddit",
      ...(providerKey === "x-twitter" ? { maxSearchQueries: 8 } : {}),
    },
  };
}

function sourceQueryFromBinding(binding: SourceBindingRow): SourceQuery {
  const config = asRecord(binding.config);

  return {
    mode: sourceQueryModeFromValue(config.mode),
    query:
      stringValue(config.query) ??
      stringValue(config.term) ??
      stringValue(config.topic) ??
      stringValue(config.subreddit) ??
      binding.providerKey,
    parameters: config as SourceRuntimeConfig,
  };
}

function executedLaneFingerprintsForProvider(
  providerKey: "reddit" | "x-twitter",
  feedItems: readonly FeedItemRow[],
): readonly string[] {
  return uniqueStrings(
    feedItems.flatMap((item) => {
      const metadata = asRecord(item.providerMetadata);
      const laneQuery = sourceQueryLaneQuery(metadata);
      if (laneQuery !== undefined) {
        return [plannerLaneQueryFingerprint(laneQuery)];
      }

      const searchQuery = readMetadataString(metadata, "searchQuery");
      if (searchQuery !== undefined) {
        return [plannerLaneQueryFingerprint(searchQuery)];
      }

      if (providerKey === "reddit") {
        const subreddit = readMetadataString(metadata, "subreddit");
        const listing =
          readMetadataString(metadata, "listing") ?? sourceProduct(metadata);
        if (subreddit !== undefined && listing !== undefined) {
          return [plannerLaneQueryFingerprint(`${subreddit}:${listing}`)];
        }
      }

      const product = sourceProduct(metadata);

      return product === undefined
        ? []
        : [plannerLaneQueryFingerprint(product)];
    }),
  );
}

function plannerLaneQueryFingerprint(query: string): string {
  return fingerprint(query.trim().toLowerCase());
}

function sourceQueryLaneQuery(
  metadata: Readonly<Record<string, unknown>>,
): string | undefined {
  const lane = asRecord(metadata.sourceQueryLane);

  return readMetadataString(lane, "query");
}

function plannerLaneExecutionState(params: {
  readonly queryFingerprint: string;
  readonly executedLaneSet: ReadonlySet<string>;
  readonly observedLaneFingerprintCount: number;
  readonly collectedCount: number;
}): PlannerCanaryLaneReport["executionState"] {
  if (params.executedLaneSet.has(params.queryFingerprint)) {
    return "executed";
  }

  return params.collectedCount > 0 && params.observedLaneFingerprintCount === 0
    ? "not_observable"
    : "not_seen_in_feed";
}

function readRuntimeArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function sourceQueryModeFromValue(value: unknown): SourceQueryMode {
  const mode = stringValue(value);

  return mode === "listing" ||
    mode === "account_feed" ||
    mode === "thread" ||
    mode === "url"
    ? mode
    : "search";
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function validateExistingReport(params: {
  readonly allowDegraded: boolean;
}): void {
  if (!existsSync(outputPath)) {
    throw new Error(
      `${outputPath} is missing and local data source is unavailable.`,
    );
  }

  const report = JSON.parse(
    readFileSync(outputPath, "utf8"),
  ) as ReaderSummaryQualityDashboardReport;
  const valid =
    report.schemaVersion === 1 &&
    report.artifactFormat === "reader-summary-quality-dashboard-v1" &&
    report.generatedBy === "npm run check:reader-summary-quality-dashboard" &&
    report.model.liveNetwork === false &&
    report.model.rawPostTextPersistedInReport === false &&
    report.model.rawUserFeedbackPersistedInReport === false &&
    report.inputs.dayCount > 0 &&
    (report.blockingPassed === true || params.allowDegraded) &&
    report.qualityGates.noRawSecretFragments === true &&
    noRawSecretFragments(report);

  if (!valid) {
    throw new Error(`${outputPath} failed existing artifact validation`);
  }

  console.log(
    `Reader summary quality dashboard artifact OK (${report.inputs.dayCount} days)`,
  );
}

function collectUserFacingText(
  view: ReaderSummaryArtifactView,
): readonly string[] {
  const content = view.content;

  return [
    content.headline,
    content.oneLineTakeaway,
    ...content.bullets,
    ...content.claimBoard.flatMap((claim) => [
      claim.claim,
      ...claim.risks.map((risk) => risk.description),
    ]),
    ...content.topReads.flatMap((item) => [
      item.title,
      item.reason,
      item.whyNow,
      ...item.whyImportant,
    ]),
    ...content.selectedPosts.flatMap((item) => [
      item.title,
      item.reason,
      item.whyNow,
      ...item.whyImportant,
    ]),
    ...content.interestSections.flatMap((section) => [
      section.title,
      section.insight,
    ]),
    ...content.openQuestions,
    ...content.risks,
    ...content.nextActions.flatMap((action) => [action.label, action.reason]),
  ].filter((value) => value.trim().length > 0);
}

function countTechnicalLeaks(values: readonly string[]): number {
  return values.filter((value) =>
    technicalLeakPatterns.some((pattern) => pattern.test(value)),
  ).length;
}

function providerSourceKey(
  providerKey: "reddit" | "x-twitter",
  item: FeedItemRow,
): string {
  const metadata = asRecord(item.providerMetadata);
  if (providerKey === "reddit") {
    return (
      readMetadataString(metadata, "subreddit") ??
      parseRedditSubreddit(item.canonicalUrl) ??
      "unknown"
    ).toLowerCase();
  }

  return (
    readMetadataString(metadata, "authorHandle") ??
    item.authorHandle ??
    parseXHandle(item.canonicalUrl) ??
    "unknown"
  ).toLowerCase();
}

function sourceProduct(metadata: unknown): string | undefined {
  const record = asRecord(metadata);
  const lane = asRecord(record.sourceQueryLane);
  const value =
    readMetadataString(record, "sourceProduct") ??
    readMetadataString(record, "sort") ??
    readMetadataString(record, "searchSort") ??
    readMetadataString(record, "timeline") ??
    readMetadataString(lane, "sourceProduct") ??
    readMetadataString(lane, "listing") ??
    readMetadataString(lane, "searchSort") ??
    readMetadataString(lane, "timeline");

  return value?.trim().toLowerCase();
}

function parseRedditSubreddit(value: string): string | undefined {
  return /reddit\.com\/r\/([^/]+)/i.exec(value)?.[1];
}

function parseXHandle(value: string): string | undefined {
  return /(?:x|twitter)\.com\/([^/?#]+)/i.exec(value)?.[1];
}

function ratingTarget(value: unknown): {
  readonly feedItemId?: string;
  readonly sourceItemId?: string;
  readonly providerKey?: string;
  readonly title?: string;
  readonly canonicalUrl?: string;
  readonly postRatingReason?: string;
} {
  const target = asRecord(value);

  return {
    feedItemId: stringValue(target.feedItemId),
    sourceItemId: stringValue(target.sourceItemId),
    providerKey: stringValue(target.providerKey)?.toLowerCase(),
    title: stringValue(target.title),
    canonicalUrl: stringValue(target.canonicalUrl),
    postRatingReason: stringValue(target.postRatingReason),
  };
}

function primaryCounts(counts: Record<string, number>): Record<string, number> {
  return primaryCountsForSources(primarySources, counts);
}

function primaryZeroCounts(): Record<string, number> {
  return primaryCounts({});
}

function sumPrimaryCounts(
  values: readonly Record<string, number>[],
): Record<string, number> {
  return sumPrimaryCountsForSources(primarySources, values);
}
