import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

type EvalDataset = {
  readonly cases?: readonly EvalCase[];
};

type EvalCase = {
  readonly caseId?: string;
  readonly topic?: string;
  readonly sourceKeys?: readonly string[];
  readonly candidates?: readonly {
    readonly candidateId?: string;
    readonly providerKey?: string;
  }[];
  readonly labels?: readonly {
    readonly candidateId?: string;
    readonly mustHave?: boolean;
    readonly officialSignal?: boolean;
    readonly communitySignal?: boolean;
    readonly duplicateOf?: string;
  }[];
};

type RankingEvalOutput = {
  readonly blockingPassed?: boolean;
  readonly caseResults?: readonly {
    readonly caseId?: string;
    readonly rankedCandidateIds?: readonly string[];
    readonly metrics?: Record<string, number>;
    readonly rankingMetadata?: {
      readonly topBreakdowns?: readonly {
        readonly candidateId?: string;
        readonly totalScore?: number;
        readonly reasonCodes?: readonly string[];
      }[];
    };
  }[];
};

type PlannerEvalOutput = {
  readonly blockingPassed?: boolean;
  readonly caseResults?: readonly {
    readonly caseId?: string;
    readonly decision?: string;
    readonly baseline?: { readonly mustHaveRecallAt20?: number };
    readonly experiment?: { readonly mustHaveRecallAt20?: number };
  }[];
};

type SummaryEvalOutput = {
  readonly blockingPassed?: boolean;
  readonly totals?: {
    readonly checkedKeyPointCount?: number;
    readonly groundedKeyPointCount?: number;
    readonly secretLeakCount?: number;
  };
};

const datasetPath = "ops/evals/source-ranking-eval-dataset.v1.json";
const rankingEvalPath = "ops/evals/source-ranking-eval-output.json";
const plannerEvalPath = "ops/evals/source-query-planner-eval-output.json";
const summaryEvalPath = "ops/evals/summary-eval-output.json";
const outputPath = "ops/evals/summary-scan-quality-report.v1.json";
const update = process.argv.includes("--update");
const requiredSources = ["reddit", "x-twitter"];
const forbiddenSerializedFragments = [
  "access_token",
  "refresh_token",
  "api_key",
  "client_secret",
  "authorization",
  "cookie",
  "private_key",
  "postgres://",
  "amqp://",
  "bearer ",
  "sk-proj-",
  "sk-live-",
];

void main();

function main(): void {
  const dataset = readJson<EvalDataset>(datasetPath);
  const rankingEval = readJson<RankingEvalOutput>(rankingEvalPath);
  const plannerEval = readJson<PlannerEvalOutput>(plannerEvalPath);
  const summaryEval = readJson<SummaryEvalOutput>(summaryEvalPath);
  const rankingByCase = new Map(
    (rankingEval.caseResults ?? []).map((item) => [item.caseId, item]),
  );
  const plannerByCase = new Map(
    (plannerEval.caseResults ?? []).map((item) => [item.caseId, item]),
  );
  const summaryGroundingRatio = groundingRatio(summaryEval);
  const scanReports = (dataset.cases ?? []).map((evalCase) => {
    const caseId = evalCase.caseId ?? "";
    const ranking = rankingByCase.get(caseId);
    const planner = plannerByCase.get(caseId);
    const topEvidence = (ranking?.rankingMetadata?.topBreakdowns ?? [])
      .slice(0, 5)
      .map((item) => ({
        evidenceId: item.candidateId ?? "",
        score: item.totalScore ?? 0,
        reasonCodes: item.reasonCodes ?? [],
      }));
    const providerCounts = providerCountsFor(evalCase);
    const metrics = ranking?.metrics ?? {};
    const confidence = confidenceFor({
      mustHaveRecallAt20: metrics.mustHaveRecallAt20 ?? 0,
      duplicateRateAt20: metrics.duplicateRateAt20 ?? 1,
      officialCommunityCoverageAt20:
        metrics.officialCommunityCoverageAt20 ?? 0,
      summaryGroundingRatio,
      topEvidenceReasonCodeCoverage: topEvidence.length === 0
        ? 0
        : topEvidence.filter((item) => item.reasonCodes.length > 0).length /
          topEvidence.length,
    });

    return {
      scanId: `eval-scan:${caseId}`,
      caseId,
      topic: evalCase.topic ?? "",
      sourceKeys: evalCase.sourceKeys ?? [],
      plannerDecision: planner?.decision ?? "missing",
      evidence: {
        candidateCount: evalCase.candidates?.length ?? 0,
        mustHaveCount: (evalCase.labels ?? []).filter(
          (item) => item.mustHave === true,
        ).length,
        duplicateLabelCount: (evalCase.labels ?? []).filter(
          (item) => item.duplicateOf !== undefined,
        ).length,
        providerCounts,
        topEvidence,
      },
      citationReadiness: {
        citationReadyEvidenceIds: topEvidence.map((item) => item.evidenceId),
        topEvidenceHasReasonCodes: topEvidence.every(
          (item) => item.reasonCodes.length > 0,
        ),
        expectedCitationPolicy:
          "summary claims should cite these top evidence ids or explicitly state uncertainty",
      },
      quality: {
        precisionAt10: metrics.precisionAt10 ?? 0,
        ndcgAt20: metrics.ndcgAt20 ?? 0,
        mustHaveRecallAt20: metrics.mustHaveRecallAt20 ?? 0,
        duplicateRateAt20: metrics.duplicateRateAt20 ?? 0,
        officialCommunityCoverageAt20:
          metrics.officialCommunityCoverageAt20 ?? 0,
        sourceDiversityAt20: metrics.sourceDiversityAt20 ?? 0,
        summaryGroundingRatio,
        confidence,
      },
      canaryComparison: {
        baselineMustHaveRecallAt20:
          planner?.baseline?.mustHaveRecallAt20 ?? 0,
        experimentMustHaveRecallAt20:
          planner?.experiment?.mustHaveRecallAt20 ?? 0,
      },
    };
  });
  const sourceCoverage = [
    ...new Set(scanReports.flatMap((report) => report.sourceKeys)),
  ].sort();
  const qualityGates = {
    rankingEvalPassed: rankingEval.blockingPassed === true,
    plannerEvalPassed: plannerEval.blockingPassed === true,
    summaryEvalPassed: summaryEval.blockingPassed === true,
    scanReportCountAtLeast20: scanReports.length >= 20,
    everyScanHasEvidence: scanReports.every(
      (report) => report.evidence.candidateCount > 0,
    ),
    everyScanHasCitationReadyEvidence: scanReports.every(
      (report) => report.citationReadiness.citationReadyEvidenceIds.length > 0,
    ),
    everyTopEvidenceHasReasonCodes: scanReports.every(
      (report) => report.citationReadiness.topEvidenceHasReasonCodes,
    ),
    everyScanHasConfidence: scanReports.every(
      (report) => report.quality.confidence.level !== "none",
    ),
    requiredSourceCoverage: requiredSources.every((sourceKey) =>
      sourceCoverage.includes(sourceKey),
    ),
    summaryGroundingComplete: summaryGroundingRatio === 1,
    noSummarySecretLeaks: summaryEval.totals?.secretLeakCount === 0,
  };
  const report = {
    schemaVersion: 1,
    artifactFormat: "summary-scan-quality-report-v1",
    evalRunId: "summary-scan-quality-report-v1",
    generatedBy: "npm run check:summary-scan-quality-report",
    gitShaPolicy:
      "release pipeline records the exact git sha next to this deterministic report",
    model: {
      liveNetwork: false,
      reportBuilder: "deterministic-source-eval-to-summary-quality-report",
    },
    inputs: {
      datasetPath,
      rankingEvalPath,
      plannerEvalPath,
      summaryEvalPath,
    },
    sourceCoverage,
    rollup: {
      scanCount: scanReports.length,
      highConfidenceCount: scanReports.filter(
        (item) => item.quality.confidence.level === "high",
      ).length,
      mediumConfidenceCount: scanReports.filter(
        (item) => item.quality.confidence.level === "medium",
      ).length,
      lowConfidenceCount: scanReports.filter(
        (item) => item.quality.confidence.level === "low",
      ).length,
      averageDuplicateRateAt20: roundMetric(
        average(scanReports, (item) => item.quality.duplicateRateAt20),
      ),
      averageSummaryUsefulnessScore: roundMetric(
        average(scanReports, (item) => item.quality.confidence.score),
      ),
    },
    qualityGates: {
      ...qualityGates,
      noRawSecretFragments: true,
    },
    blockingPassed: false,
    scanReports,
  };
  const reportWithSecretGate = {
    ...report,
    qualityGates: {
      ...report.qualityGates,
      noRawSecretFragments: noRawSecretFragments(report),
    },
  };
  const finalReport = {
    ...reportWithSecretGate,
    blockingPassed: Object.values(reportWithSecretGate.qualityGates).every(
      (value) => value === true,
    ),
  };
  const serialized = `${JSON.stringify(finalReport, null, 2)}\n`;

  if (!finalReport.blockingPassed) {
    console.error(serialized);
    throw new Error("Summary scan quality report gates failed");
  }

  if (update) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, serialized);
    console.log(`Updated ${outputPath}`);
    return;
  }

  if (!existsSync(outputPath)) {
    throw new Error(
      `${outputPath} is missing. Run npm run check:summary-scan-quality-report -- --update`,
    );
  }

  const expected = normalizeLineEndings(readFileSync(outputPath, "utf8"));
  if (expected !== serialized) {
    throw new Error(
      `${outputPath} is stale. Run npm run check:summary-scan-quality-report -- --update`,
    );
  }

  console.log(
    `Summary scan quality report OK (${scanReports.length} scans, git ${readGitSha()})`,
  );
}

function confidenceFor(input: {
  readonly mustHaveRecallAt20: number;
  readonly duplicateRateAt20: number;
  readonly officialCommunityCoverageAt20: number;
  readonly summaryGroundingRatio: number;
  readonly topEvidenceReasonCodeCoverage: number;
}) {
  const score = roundMetric(
    input.mustHaveRecallAt20 * 0.3 +
      (1 - input.duplicateRateAt20) * 0.2 +
      input.officialCommunityCoverageAt20 * 0.2 +
      input.summaryGroundingRatio * 0.2 +
      input.topEvidenceReasonCodeCoverage * 0.1,
  );
  const level = score >= 0.9 ? "high" : score >= 0.7 ? "medium" : "low";

  return {
    score,
    level,
    rationale:
      level === "high"
        ? "Must-have recall, source coverage, grounding and top evidence reason codes are strong."
        : "Review low coverage, duplicate pressure or weak top evidence reason codes before trusting the summary.",
  };
}

function providerCountsFor(
  evalCase: EvalCase,
): Readonly<Record<string, number>> {
  const counts = new Map<string, number>();

  for (const candidate of evalCase.candidates ?? []) {
    const providerKey = candidate.providerKey ?? "unknown";
    counts.set(providerKey, (counts.get(providerKey) ?? 0) + 1);
  }

  return Object.fromEntries([...counts.entries()].sort());
}

function groundingRatio(summaryEval: SummaryEvalOutput): number {
  const checked = summaryEval.totals?.checkedKeyPointCount ?? 0;

  return checked === 0
    ? 1
    : roundMetric((summaryEval.totals?.groundedKeyPointCount ?? 0) / checked);
}

function noRawSecretFragments(value: unknown): boolean {
  const serialized = JSON.stringify(value).toLowerCase();

  return forbiddenSerializedFragments.every(
    (fragment) => !serialized.includes(fragment),
  );
}

function average<T>(items: readonly T[], selector: (item: T) => number): number {
  return items.length === 0
    ? 0
    : items.reduce((total, item) => total + selector(item), 0) / items.length;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function normalizeLineEndings(value: string): string {
  return value.replaceAll("\r\n", "\n");
}

function readGitSha(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function roundMetric(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
