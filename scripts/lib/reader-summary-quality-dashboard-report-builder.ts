import { Pool } from "pg";

import {
  readerSummaryArtifactFromPrisma,
} from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-records";
import {
  presentReaderSummaryArtifact,
  readerSummaryContentForArtifact,
} from "@social-monitor/summary/features/shared/reader-summary-artifact-presenter";

import { buildReaderSummaryClaimQuality } from "./reader-summary-claim-quality";
import {
  buildCollectionStrategy,
  buildPlannerRolloutProof,
} from "./reader-summary-quality-dashboard-collection-strategy";
import type {
  ReaderSummaryQualityDashboardReport,
  ReaderSummaryQualityDayReport,
} from "./reader-summary-quality-dashboard-contract";
import { buildFeedbackShadow } from "./reader-summary-quality-dashboard-feedback-shadow";
import {
  buildReaderSummaryMetrics,
  buildTopReadQuality,
  curatedTopReadCountPasses,
  topReadProviderSkewPasses,
} from "./reader-summary-quality-dashboard-presentation";
import {
  readDashboardCollectedCoverage,
  readDashboardCollectionDates,
  readDashboardFeedItems,
} from "./reader-summary-quality-dashboard-published-window";
import {
  averageMetric,
  countBy,
  isLocalDataSourceUnavailable,
  readDominantReaderSummaryQualityScope,
  readLatestReaderSummaryArtifact,
  sumPrimaryCounts as sumPrimaryCountsForSources,
} from "./reader-summary-quality-eval-support";
import {
  fingerprint,
  message,
  noRawSecretFragments,
  readCollectionIntegrityStatus,
  yesterdaySocialQualityPoolConfig,
} from "./yesterday-social-replay-support";

const primarySources = ["reddit", "x-twitter"] as const;

export async function buildReaderSummaryQualityDashboardReport(params: {
  readonly databaseUrl: string;
  readonly collectionDate: string | undefined;
}): Promise<ReaderSummaryQualityDashboardReport | undefined> {
  const pool = new Pool(yesterdaySocialQualityPoolConfig(params.databaseUrl, 2));

  try {
    const collectionDates = await readDashboardCollectionDates(
      pool,
      params.collectionDate,
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
  const summary = buildReaderSummaryMetrics(view, artifactRecord);
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

function sumPrimaryCounts(
  values: readonly Record<string, number>[],
): Record<string, number> {
  return sumPrimaryCountsForSources(primarySources, values);
}
