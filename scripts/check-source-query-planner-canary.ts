import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

type EvalDataset = {
  readonly cases?: readonly {
    readonly caseId?: string;
    readonly sourceKeys?: readonly string[];
  }[];
};

type PlannerEvalOutput = {
  readonly blockingPassed?: boolean;
  readonly caseResults?: readonly PlannerCaseResult[];
};

type PlannerCaseResult = {
  readonly caseId?: string;
  readonly baseline?: PlannerVariant;
  readonly experiment?: PlannerVariant;
  readonly decision?: string;
};

type PlannerVariant = {
  readonly laneCount?: number;
  readonly mustHaveRecallAt20?: number;
  readonly relevantRecallAt20?: number;
  readonly officialCommunityCoverageAt20?: number;
};

type RankingEvalOutput = {
  readonly blockingPassed?: boolean;
  readonly caseResults?: readonly {
    readonly caseId?: string;
    readonly metrics?: Record<string, number>;
    readonly rankingMetadata?: {
      readonly topBreakdowns?: readonly {
        readonly candidateId?: string;
        readonly reasonCodes?: readonly string[];
      }[];
    };
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
const plannerEvalPath = "ops/evals/source-query-planner-eval-output.json";
const rankingEvalPath = "ops/evals/source-ranking-eval-output.json";
const summaryEvalPath = "ops/evals/summary-eval-output.json";
const outputPath = "ops/evals/source-query-planner-canary-report.v1.json";
const update = process.argv.includes("--update");

void main();

function main(): void {
  const dataset = readJson<EvalDataset>(datasetPath);
  const plannerEval = readJson<PlannerEvalOutput>(plannerEvalPath);
  const rankingEval = readJson<RankingEvalOutput>(rankingEvalPath);
  const summaryEval = readJson<SummaryEvalOutput>(summaryEvalPath);
  const plannerByCase = new Map(
    (plannerEval.caseResults ?? []).map((item) => [item.caseId, item]),
  );
  const rankingByCase = new Map(
    (rankingEval.caseResults ?? []).map((item) => [item.caseId, item]),
  );
  const canaryBindings = [
    buildCanaryBinding({
      canaryId: "canary-reddit-source-query-planner",
      workspaceId: "workspace-eval-canary-reddit",
      sourceBindingId: "source-binding-eval-canary-reddit",
      providerKey: "reddit",
      caseIds: selectCaseIds(dataset, "reddit"),
      plannerByCase,
      rankingByCase,
      enabledConfig: {
        sourceQueryPlanner: {
          enabled: true,
          maxLanesPerSource: 8,
          includeEnrichment: true,
        },
      },
    }),
    buildCanaryBinding({
      canaryId: "canary-x-twitter-source-query-planner",
      workspaceId: "workspace-eval-canary-x-twitter",
      sourceBindingId: "source-binding-eval-canary-x-twitter",
      providerKey: "x-twitter",
      caseIds: selectCaseIds(dataset, "x-twitter"),
      plannerByCase,
      rankingByCase,
      enabledConfig: {
        sourceQueryPlanner: {
          enabled: true,
          maxLanesPerSource: 8,
          maxSearchQueries: 8,
        },
      },
    }),
  ];
  const qualityGates = {
    plannerEvalPassed: plannerEval.blockingPassed === true,
    rankingEvalPassed: rankingEval.blockingPassed === true,
    summaryEvalPassed: summaryEval.blockingPassed === true,
    canaryBindingCount: canaryBindings.length === 2,
    everyBindingHasCases: canaryBindings.every((binding) => binding.caseCount > 0),
    noRegressedCases: canaryBindings.every((binding) => binding.regressedCaseCount === 0),
    everyBindingImprovesMustHaveRecall: canaryBindings.every(
      (binding) => binding.experiment.mustHaveRecallAt20 >= binding.baseline.mustHaveRecallAt20,
    ),
    everyBindingImprovesRelevantRecall: canaryBindings.every(
      (binding) => binding.experiment.relevantRecallAt20 >= binding.baseline.relevantRecallAt20,
    ),
    atLeastOneImprovedCasePerBinding: canaryBindings.every(
      (binding) => binding.improvedCaseCount > 0,
    ),
    duplicateRateWithinGate: canaryBindings.every(
      (binding) => binding.ranking.averageDuplicateRateAt20 <= 0.25,
    ),
    topEvidenceHasReasonCodes: canaryBindings.every(
      (binding) => binding.ranking.topEvidenceReasonCodeCoverage === 1,
    ),
    summaryGroundingComplete:
      summaryEval.totals?.checkedKeyPointCount ===
      summaryEval.totals?.groundedKeyPointCount,
    noSummarySecretLeaks: summaryEval.totals?.secretLeakCount === 0,
  };
  const report = {
    schemaVersion: 1,
    artifactFormat: "source-query-planner-canary-report-v1",
    evalRunId: "source-query-planner-canary-v1",
    generatedBy: "npm run check:source-query-planner-canary",
    gitShaPolicy:
      "release pipeline records the exact git sha next to this deterministic report",
    model: {
      liveNetwork: false,
      baseline: "single-topic-lane",
      experiment: "sourceQueryPlanner.enabled",
      comparison: "frozen-dataset-before-after",
    },
    inputs: {
      datasetPath,
      plannerEvalPath,
      rankingEvalPath,
      summaryEvalPath,
    },
    canaryBindings,
    qualityGates,
    blockingPassed: Object.values(qualityGates).every((value) => value === true),
  };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;

  if (!report.blockingPassed) {
    console.error(serialized);
    throw new Error("Source query planner canary gates failed");
  }

  if (update) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, serialized);
    console.log(`Updated ${outputPath}`);
    return;
  }

  if (!existsSync(outputPath)) {
    throw new Error(
      `${outputPath} is missing. Run npm run check:source-query-planner-canary -- --update`,
    );
  }

  const expected = normalizeLineEndings(readFileSync(outputPath, "utf8"));
  if (expected !== serialized) {
    throw new Error(
      `${outputPath} is stale. Run npm run check:source-query-planner-canary -- --update`,
    );
  }

  console.log(
    `Source query planner canary OK (${canaryBindings.length} bindings, git ${readGitSha()})`,
  );
}

function buildCanaryBinding(params: {
  readonly canaryId: string;
  readonly workspaceId: string;
  readonly sourceBindingId: string;
  readonly providerKey: string;
  readonly caseIds: readonly string[];
  readonly plannerByCase: ReadonlyMap<string | undefined, PlannerCaseResult>;
  readonly rankingByCase: ReadonlyMap<string | undefined, NonNullable<RankingEvalOutput["caseResults"]>[number]>;
  readonly enabledConfig: Record<string, unknown>;
}) {
  const plannerCases = params.caseIds.flatMap((caseId) => {
    const result = params.plannerByCase.get(caseId);

    return result === undefined ? [] : [result];
  });
  const rankingCases = params.caseIds.flatMap((caseId) => {
    const result = params.rankingByCase.get(caseId);

    return result === undefined ? [] : [result];
  });
  const topEvidenceBreakdowns = rankingCases.flatMap((item) =>
    (item.rankingMetadata?.topBreakdowns ?? []).slice(0, 5),
  );
  const improvedCaseCount = plannerCases.filter(
    (item) => item.decision === "improved",
  ).length;
  const regressedCaseCount = plannerCases.filter(
    (item) => item.decision === "regressed",
  ).length;

  return {
    canaryId: params.canaryId,
    workspaceId: params.workspaceId,
    sourceBindingId: params.sourceBindingId,
    providerKey: params.providerKey,
    rolloutPolicy: "opt_in_config_only",
    enabledConfig: params.enabledConfig,
    caseIds: params.caseIds,
    caseCount: params.caseIds.length,
    improvedCaseCount,
    regressedCaseCount,
    baseline: aggregatePlannerVariant(plannerCases, "baseline"),
    experiment: aggregatePlannerVariant(plannerCases, "experiment"),
    ranking: {
      averageDuplicateRateAt20: roundMetric(
        average(rankingCases, (item) => item.metrics?.duplicateRateAt20 ?? 0),
      ),
      averageOfficialCommunityCoverageAt20: roundMetric(
        average(
          rankingCases,
          (item) => item.metrics?.officialCommunityCoverageAt20 ?? 0,
        ),
      ),
      topEvidenceCount: topEvidenceBreakdowns.length,
      topEvidenceReasonCodeCoverage:
        topEvidenceBreakdowns.length === 0
          ? 0
          : roundMetric(
              topEvidenceBreakdowns.filter(
                (item) => (item.reasonCodes ?? []).length > 0,
              ).length / topEvidenceBreakdowns.length,
            ),
    },
  };
}

function aggregatePlannerVariant(
  cases: readonly PlannerCaseResult[],
  variant: "baseline" | "experiment",
) {
  return {
    averageLaneCount: roundMetric(
      average(cases, (item) => item[variant]?.laneCount ?? 0),
    ),
    mustHaveRecallAt20: roundMetric(
      average(cases, (item) => item[variant]?.mustHaveRecallAt20 ?? 0),
    ),
    relevantRecallAt20: roundMetric(
      average(cases, (item) => item[variant]?.relevantRecallAt20 ?? 0),
    ),
    officialCommunityCoverageAt20: roundMetric(
      average(
        cases,
        (item) => item[variant]?.officialCommunityCoverageAt20 ?? 0,
      ),
    ),
  };
}

function selectCaseIds(dataset: EvalDataset, providerKey: string): readonly string[] {
  return (dataset.cases ?? []).flatMap((item) =>
    item.caseId !== undefined && item.sourceKeys?.includes(providerKey)
      ? [item.caseId]
      : [],
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
