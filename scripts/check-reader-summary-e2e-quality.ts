import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import {
  noRawSecretFragments,
  normalizeLineEndings,
  roundMetric,
} from "./lib/yesterday-social-replay-support";

type Metric = {
  readonly metricId: string;
  readonly value: number;
  readonly passed: boolean;
};

type SourceRankingEval = {
  readonly blockingPassed: boolean;
  readonly metrics: readonly Metric[];
};

type CollectionQuality = {
  readonly collectionDate: string;
  readonly collectionBlockingPassed: boolean;
  readonly summaryQualityVerified: boolean;
  readonly primarySourceCoverage: readonly string[];
  readonly providerReports: readonly {
    readonly providerKey: string;
    readonly feedItemCount: number;
    readonly rankInputReadinessScore: number;
    readonly textCoverage: number;
    readonly canonicalUrlCoverage: number;
    readonly engagementMetadataCoverage: number;
  }[];
};

type EvidenceReplay = {
  readonly blockingPassed: boolean;
  readonly replay: {
    readonly selectedEvidenceCount: number;
    readonly providerCounts: readonly {
      readonly providerKey: string;
      readonly count: number;
    }[];
    readonly primaryProviderCounts: Record<string, number>;
    readonly minScore: number;
    readonly maxScore: number;
  };
  readonly evidencePack: {
    readonly confidence: {
      readonly level: "none" | "low" | "medium" | "high";
      readonly score: number;
    };
  };
};

type FinalReplay = {
  readonly blockingPassed: boolean;
  readonly replay: {
    readonly selectedFeedItemCount: number;
    readonly topReadCount: number;
    readonly citationCount: number;
    readonly providerCount: number;
    readonly primarySourceMixCounts: Record<string, number>;
    readonly primaryTopReadCounts: Record<string, number>;
    readonly citedTopReadCount: number;
    readonly canonicalUrlTopReadCount: number;
    readonly citationCanonicalUrlCount: number;
    readonly minTopReadSignalScore: number;
    readonly averageTopReadSignalScore: number;
    readonly mediumOrHighConfidenceTopReadCount: number;
    readonly lowConfidenceTopReadCount: number;
  };
  readonly finalText: {
    readonly bulletCount: number;
    readonly openQuestionCount: number;
    readonly nextActionCount: number;
    readonly riskCount: number;
    readonly technicalLeakCount: number;
  };
  readonly qualityState: {
    readonly warningCount: number;
    readonly confidenceLevel: "none" | "low" | "medium" | "high";
    readonly confidenceScore: number;
  };
};

type Report = {
  readonly schemaVersion: 1;
  readonly artifactFormat: "reader-summary-e2e-quality-report-v1";
  readonly generatedBy: string;
  readonly model: {
    readonly liveNetwork: false;
    readonly reportBuilder: "deterministic-reader-summary-e2e-quality-gate";
    readonly rawPostTextPersistedInReport: false;
  };
  readonly inputs: {
    readonly sourceRankingEvalPath: string;
    readonly collectionQualityPath: string;
    readonly evidenceReplayPath: string;
    readonly finalReplayPath: string;
  };
  readonly collectionDate: string;
  readonly ranking: Record<string, number | boolean>;
  readonly collection: {
    readonly primarySourceCoverage: readonly string[];
    readonly redditFeedItemCount: number;
    readonly xTwitterFeedItemCount: number;
    readonly redditRankInputReadinessScore: number;
    readonly xTwitterRankInputReadinessScore: number;
  };
  readonly evidence: EvidenceReplay["replay"] & {
    readonly confidenceLevel: EvidenceReplay["evidencePack"]["confidence"]["level"];
    readonly confidenceScore: number;
  };
  readonly finalSummary: FinalReplay["replay"] & {
    readonly bulletCount: number;
    readonly openQuestionCount: number;
    readonly nextActionCount: number;
    readonly riskCount: number;
    readonly technicalLeakCount: number;
    readonly warningCount: number;
    readonly confidenceLevel: FinalReplay["qualityState"]["confidenceLevel"];
    readonly confidenceScore: number;
  };
  readonly qualityGates: Record<string, boolean>;
  readonly blockingPassed: boolean;
};

const update = process.argv.includes("--update");
const outputPath = "ops/evals/reader-summary-e2e-quality-report.v1.json";
const sourceRankingEvalPath = "ops/evals/source-ranking-eval-output.json";
const collectionQualityPath =
  "ops/evals/yesterday-social-collection-quality-report.v1.json";
const evidenceReplayPath =
  "ops/evals/yesterday-reader-summary-evidence-replay.v1.json";
const finalReplayPath =
  "ops/evals/yesterday-reader-summary-final-replay.v1.json";
const primarySources = ["reddit", "x-twitter"] as const;

void main();

function main(): void {
  const report = buildReport();
  const serialized = `${JSON.stringify(report, null, 2)}\n`;

  if (!report.blockingPassed) {
    console.error(serialized);
    throw new Error("Reader summary end-to-end quality gates failed");
  }

  if (update) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, serialized);
    console.log(`Updated ${outputPath}`);
    return;
  }

  if (!existsSync(outputPath)) {
    throw new Error(
      `${outputPath} is missing. Run npm run check:reader-summary-e2e-quality -- --update`,
    );
  }

  const expected = normalizeLineEndings(readFileSync(outputPath, "utf8"));
  if (expected !== serialized) {
    throw new Error(
      `${outputPath} is stale. Run npm run check:reader-summary-e2e-quality -- --update`,
    );
  }

  console.log(
    `Reader summary end-to-end quality OK (${report.collectionDate})`,
  );
}

function buildReport(): Report {
  const rankingEval = readJson<SourceRankingEval>(sourceRankingEvalPath);
  const collectionQuality = readJson<CollectionQuality>(collectionQualityPath);
  const evidenceReplay = readJson<EvidenceReplay>(evidenceReplayPath);
  const finalReplay = readJson<FinalReplay>(finalReplayPath);
  const ranking = {
    blockingPassed: rankingEval.blockingPassed,
    precisionAt10: metricValue(rankingEval, "precisionAt10"),
    ndcgAt20: metricValue(rankingEval, "ndcgAt20"),
    mustHaveRecallAt20: metricValue(rankingEval, "mustHaveRecallAt20"),
    duplicateRateAt20: metricValue(rankingEval, "duplicateRateAt20"),
    sourceDiversityAt20: metricValue(rankingEval, "sourceDiversityAt20"),
    viralOffTopicAt10: metricValue(rankingEval, "viralOffTopicAt10"),
  };
  const redditReport = providerReport(collectionQuality, "reddit");
  const xTwitterReport = providerReport(collectionQuality, "x-twitter");
  const collection = {
    primarySourceCoverage: collectionQuality.primarySourceCoverage,
    redditFeedItemCount: redditReport.feedItemCount,
    xTwitterFeedItemCount: xTwitterReport.feedItemCount,
    redditRankInputReadinessScore: redditReport.rankInputReadinessScore,
    xTwitterRankInputReadinessScore: xTwitterReport.rankInputReadinessScore,
  };
  const evidence = {
    ...evidenceReplay.replay,
    confidenceLevel: evidenceReplay.evidencePack.confidence.level,
    confidenceScore: evidenceReplay.evidencePack.confidence.score,
  };
  const finalSummary = {
    ...finalReplay.replay,
    bulletCount: finalReplay.finalText.bulletCount,
    openQuestionCount: finalReplay.finalText.openQuestionCount,
    nextActionCount: finalReplay.finalText.nextActionCount,
    riskCount: finalReplay.finalText.riskCount,
    technicalLeakCount: finalReplay.finalText.technicalLeakCount,
    warningCount: finalReplay.qualityState.warningCount,
    confidenceLevel: finalReplay.qualityState.confidenceLevel,
    confidenceScore: finalReplay.qualityState.confidenceScore,
  };
  const reportWithoutSecretGate = {
    schemaVersion: 1,
    artifactFormat: "reader-summary-e2e-quality-report-v1",
    generatedBy: "npm run check:reader-summary-e2e-quality",
    model: {
      liveNetwork: false,
      reportBuilder: "deterministic-reader-summary-e2e-quality-gate",
      rawPostTextPersistedInReport: false,
    },
    inputs: {
      sourceRankingEvalPath,
      collectionQualityPath,
      evidenceReplayPath,
      finalReplayPath,
    },
    collectionDate: collectionQuality.collectionDate,
    ranking,
    collection,
    evidence,
    finalSummary,
    qualityGates: {
      rankingEvalPassed: rankingEval.blockingPassed,
      rankingPrecisionAt10Strong: ranking.precisionAt10 >= 0.85,
      rankingNdcgAt20Strong: ranking.ndcgAt20 >= 0.95,
      rankingMustHaveRecallComplete: ranking.mustHaveRecallAt20 === 1,
      rankingDuplicateRateLow: ranking.duplicateRateAt20 <= 0.05,
      rankingNoViralOffTopicAt10: ranking.viralOffTopicAt10 === 0,
      collectionQualityPassed: collectionQuality.collectionBlockingPassed,
      primarySourcesCollected: primarySources.every((source) =>
        collection.primarySourceCoverage.includes(source),
      ),
      primarySourceInventoryLargeEnough:
        collection.redditFeedItemCount >= 100 &&
        collection.xTwitterFeedItemCount >= 50,
      primaryRankInputsReady:
        collection.redditRankInputReadinessScore >= 0.95 &&
        collection.xTwitterRankInputReadinessScore >= 0.95,
      evidenceReplayPassed: evidenceReplay.blockingPassed,
      evidenceHasEnoughItems: evidence.selectedEvidenceCount >= 30,
      evidenceHasFourProviders: evidence.providerCounts.length >= 4,
      evidencePrimarySourcesBalanced: primarySources.every(
        (source) => (evidence.primaryProviderCounts[source] ?? 0) >= 8,
      ),
      evidenceScoreFloorStrong: evidence.minScore >= 1.35,
      evidenceConfidenceAtLeastMedium:
        evidence.confidenceLevel === "medium" ||
        evidence.confidenceLevel === "high",
      finalReplayPassed: finalReplay.blockingPassed,
      finalTopReadsEnough: finalSummary.topReadCount >= 8,
      finalPrimarySourcesReachTopReads: primarySources.every(
        (source) => (finalSummary.primaryTopReadCounts[source] ?? 0) >= 1,
      ),
      finalTopReadSignalsStrong:
        finalSummary.minTopReadSignalScore >= 0.35 &&
        finalSummary.averageTopReadSignalScore >= 0.65,
      finalCitationsComplete:
        finalSummary.citedTopReadCount === finalSummary.topReadCount &&
        finalSummary.canonicalUrlTopReadCount === finalSummary.topReadCount &&
        finalSummary.citationCanonicalUrlCount === finalSummary.citationCount,
      finalStructureActionable:
        finalSummary.bulletCount >= 1 &&
        finalSummary.openQuestionCount >= 1 &&
        finalSummary.nextActionCount >= 1,
      finalLowConfidenceIsExplained:
        finalSummary.lowConfidenceTopReadCount === 0 ||
        (finalSummary.warningCount >= 1 &&
          finalSummary.openQuestionCount >= 1 &&
          finalSummary.riskCount >= 1),
      finalTextHasNoTechnicalLeakage: finalSummary.technicalLeakCount === 0,
      noRawSecretFragments: true,
    },
    blockingPassed: false,
  } satisfies Report;
  const qualityGates = {
    ...reportWithoutSecretGate.qualityGates,
    noRawSecretFragments: noRawSecretFragments(reportWithoutSecretGate),
  };

  return {
    ...reportWithoutSecretGate,
    ranking: roundRecordNumbers(reportWithoutSecretGate.ranking),
    evidence: roundRecordNumbers(reportWithoutSecretGate.evidence),
    finalSummary: roundRecordNumbers(reportWithoutSecretGate.finalSummary),
    qualityGates,
    blockingPassed: Object.values(qualityGates).every(Boolean),
  };
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function metricValue(report: SourceRankingEval, metricId: string): number {
  const metric = report.metrics.find((item) => item.metricId === metricId);
  if (metric === undefined) {
    throw new Error(`Missing source ranking metric ${metricId}`);
  }
  return metric.value;
}

function providerReport(
  report: CollectionQuality,
  providerKey: string,
): CollectionQuality["providerReports"][number] {
  const provider = report.providerReports.find(
    (item) => item.providerKey === providerKey,
  );
  if (provider === undefined) {
    throw new Error(`Missing collection provider report ${providerKey}`);
  }
  return provider;
}

function roundRecordNumbers<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      typeof entry === "number" ? roundMetric(entry) : entry,
    ]),
  ) as T;
}
