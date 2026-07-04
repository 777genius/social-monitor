import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

type SourceEvalDataset = {
  readonly datasetVersion?: string;
  readonly cases?: readonly SourceEvalCase[];
};

type SourceEvalCase = {
  readonly caseId?: string;
  readonly topic?: string;
  readonly sourceKeys?: readonly string[];
  readonly queryLanes?: readonly {
    readonly laneId?: string;
    readonly sourceKey?: string;
    readonly operation?: string;
    readonly query?: string;
    readonly maxItems?: number;
  }[];
  readonly candidates?: readonly {
    readonly candidateId?: string;
    readonly providerKey?: string;
  }[];
  readonly labels?: readonly {
    readonly candidateId?: string;
    readonly mustHave?: boolean;
  }[];
};

type SourceRankingEvalOutput = {
  readonly blockingPassed?: boolean;
  readonly metrics?: readonly { readonly metricId?: string; readonly value?: number }[];
  readonly caseResults?: readonly SourceRankingCaseResult[];
};

type SourceRankingCaseResult = {
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
};

type SourceQueryPlannerEvalOutput = {
  readonly blockingPassed?: boolean;
  readonly caseResults?: readonly {
    readonly caseId?: string;
    readonly baseline?: { readonly laneCount?: number };
    readonly experiment?: { readonly laneCount?: number };
    readonly decision?: string;
  }[];
};

type SummaryEvalOutput = {
  readonly blockingPassed?: boolean;
  readonly fixtureGroups?: readonly string[];
  readonly totals?: {
    readonly checkedKeyPointCount?: number;
    readonly groundedKeyPointCount?: number;
    readonly secretLeakCount?: number;
  };
};

type SummaryFeedbackEvalBacklogOutput = {
  readonly blockingPassed?: boolean;
  readonly rollup?: {
    readonly itemCount?: number;
    readonly labelCounts?: Record<string, number>;
    readonly targetEvalSuiteCounts?: Record<string, number>;
  };
};

const datasetPath = "ops/evals/source-ranking-eval-dataset.v1.json";
const sourceRankingEvalPath = "ops/evals/source-ranking-eval-output.json";
const sourceQueryPlannerEvalPath = "ops/evals/source-query-planner-eval-output.json";
const summaryEvalPath = "ops/evals/summary-eval-output.json";
const feedbackBacklogPath = "ops/evals/summary-feedback-eval-backlog.v1.json";
const outputPath = "ops/evals/social-research-quality-trace.v1.json";
const update = process.argv.includes("--update");
const requiredSourceKeys = ["reddit", "x-twitter"];
const forbiddenSerializedFragments = [
  "access_token",
  "refresh_token",
  "id_token",
  "api_key",
  "client_secret",
  "authorization",
  "cookie",
  "private_key",
  "postgres://",
  "postgresql://",
  "amqp://",
  "amqps://",
  "bearer ",
  "sk-proj-",
  "sk-live-",
];

void main();

function main(): void {
  const dataset = readJson<SourceEvalDataset>(datasetPath);
  const sourceRankingEval = readJson<SourceRankingEvalOutput>(sourceRankingEvalPath);
  const sourceQueryPlannerEval = readJson<SourceQueryPlannerEvalOutput>(
    sourceQueryPlannerEvalPath,
  );
  const summaryEval = readJson<SummaryEvalOutput>(summaryEvalPath);
  const feedbackBacklog = readJson<SummaryFeedbackEvalBacklogOutput>(
    feedbackBacklogPath,
  );
  const traces = buildCaseTraces({
    dataset,
    sourceRankingEval,
    sourceQueryPlannerEval,
  });
  const sourceCoverage = [...new Set(traces.flatMap((trace) => trace.sourceKeys))].sort();
  const qualityGates = {
    sourceRankingEvalPassed: sourceRankingEval.blockingPassed === true,
    sourceQueryPlannerEvalPassed: sourceQueryPlannerEval.blockingPassed === true,
    summaryEvalPassed: summaryEval.blockingPassed === true,
    feedbackEvalBacklogPassed: feedbackBacklog.blockingPassed === true,
    everyDatasetCaseTraced:
      traces.length === (dataset.cases ?? []).length &&
      traces.every((trace) => trace.traceComplete),
    everyTopRankedCandidateHasReasonCodes: traces.every((trace) =>
      trace.ranking.topBreakdowns.every(
        (breakdown) => breakdown.reasonCodes.length > 0,
      ),
    ),
    requiredSourceCoverage: requiredSourceKeys.every((sourceKey) =>
      sourceCoverage.includes(sourceKey),
    ),
    summaryGroundingComplete:
      summaryEval.totals?.checkedKeyPointCount ===
      summaryEval.totals?.groundedKeyPointCount,
    noSummarySecretLeaks: summaryEval.totals?.secretLeakCount === 0,
    feedbackBacklogHasItems: (feedbackBacklog.rollup?.itemCount ?? 0) > 0,
  };
  const report = {
    schemaVersion: 1,
    artifactFormat: "social-research-quality-trace-v1",
    evalRunId: "social-research-quality-trace-v1",
    generatedBy: "npm run check:social-research-quality-trace",
    gitShaPolicy:
      "release pipeline records the exact git sha next to this deterministic report",
    model: {
      judge: "none",
      liveNetwork: false,
      traceBuilder: "deterministic-eval-output-join",
    },
    inputs: {
      datasetPath,
      sourceRankingEvalPath,
      sourceQueryPlannerEvalPath,
      summaryEvalPath,
      feedbackBacklogPath,
    },
    sourceCoverage,
    qualityGates: {
      ...qualityGates,
      noRawSecretFragments: true,
    },
    blockingPassed: false,
    traces,
    summaryCoverage: {
      fixtureGroups: summaryEval.fixtureGroups ?? [],
      checkedKeyPointCount: summaryEval.totals?.checkedKeyPointCount ?? 0,
      groundedKeyPointCount: summaryEval.totals?.groundedKeyPointCount ?? 0,
      secretLeakCount: summaryEval.totals?.secretLeakCount ?? 0,
    },
    feedbackEvalBacklogCoverage: {
      itemCount: feedbackBacklog.rollup?.itemCount ?? 0,
      labelCounts: feedbackBacklog.rollup?.labelCounts ?? {},
      targetEvalSuiteCounts: feedbackBacklog.rollup?.targetEvalSuiteCounts ?? {},
    },
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
    throw new Error("Social research quality trace gates failed");
  }

  if (update) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, serialized);
    console.log(`Updated ${outputPath}`);
    return;
  }

  if (!existsSync(outputPath)) {
    throw new Error(
      `${outputPath} is missing. Run npm run check:social-research-quality-trace -- --update`,
    );
  }

  const expected = normalizeLineEndings(readFileSync(outputPath, "utf8"));
  if (expected !== serialized) {
    throw new Error(
      `${outputPath} is stale. Run npm run check:social-research-quality-trace -- --update`,
    );
  }

  console.log(
    `Social research quality trace OK (${traces.length} cases, git ${readGitSha()})`,
  );
}

function buildCaseTraces(params: {
  readonly dataset: SourceEvalDataset;
  readonly sourceRankingEval: SourceRankingEvalOutput;
  readonly sourceQueryPlannerEval: SourceQueryPlannerEvalOutput;
}): readonly {
  readonly caseId: string;
  readonly topic: string;
  readonly sourceKeys: readonly string[];
  readonly collection: {
    readonly queryLaneCount: number;
    readonly candidateCount: number;
    readonly mustHaveCandidateCount: number;
    readonly queryLanes: readonly {
      readonly laneId: string;
      readonly sourceKey: string;
      readonly operation: string;
      readonly maxItems: number;
    }[];
  };
  readonly planner: {
    readonly baselineLaneCount: number;
    readonly experimentLaneCount: number;
    readonly decision: string;
  };
  readonly ranking: {
    readonly rankedCandidateCount: number;
    readonly metrics: Record<string, number>;
    readonly topBreakdowns: readonly {
      readonly candidateId: string;
      readonly totalScore: number;
      readonly reasonCodes: readonly string[];
    }[];
  };
  readonly traceComplete: boolean;
}[] {
  const rankingResults = new Map(
    (params.sourceRankingEval.caseResults ?? []).map((result) => [
      result.caseId,
      result,
    ]),
  );
  const plannerResults = new Map(
    (params.sourceQueryPlannerEval.caseResults ?? []).map((result) => [
      result.caseId,
      result,
    ]),
  );

  return (params.dataset.cases ?? []).map((evalCase) => {
    const caseId = evalCase.caseId ?? "";
    const ranking = rankingResults.get(caseId);
    const planner = plannerResults.get(caseId);
    const queryLanes = (evalCase.queryLanes ?? []).map((lane) => ({
      laneId: lane.laneId ?? "",
      sourceKey: lane.sourceKey ?? "",
      operation: lane.operation ?? "",
      maxItems: lane.maxItems ?? 0,
    }));
    const topBreakdowns = (ranking?.rankingMetadata?.topBreakdowns ?? [])
      .slice(0, 5)
      .map((breakdown) => ({
        candidateId: breakdown.candidateId ?? "",
        totalScore: breakdown.totalScore ?? 0,
        reasonCodes: breakdown.reasonCodes ?? [],
      }));

    return {
      caseId,
      topic: evalCase.topic ?? "",
      sourceKeys: evalCase.sourceKeys ?? [],
      collection: {
        queryLaneCount: queryLanes.length,
        candidateCount: (evalCase.candidates ?? []).length,
        mustHaveCandidateCount: (evalCase.labels ?? []).filter(
          (label) => label.mustHave === true,
        ).length,
        queryLanes,
      },
      planner: {
        baselineLaneCount: planner?.baseline?.laneCount ?? 0,
        experimentLaneCount: planner?.experiment?.laneCount ?? 0,
        decision: planner?.decision ?? "missing",
      },
      ranking: {
        rankedCandidateCount: (ranking?.rankedCandidateIds ?? []).length,
        metrics: ranking?.metrics ?? {},
        topBreakdowns,
      },
      traceComplete:
        caseId.length > 0 &&
        (evalCase.topic ?? "").trim().length > 0 &&
        queryLanes.length > 0 &&
        (evalCase.candidates ?? []).length > 0 &&
        ranking !== undefined &&
        planner !== undefined &&
        topBreakdowns.length > 0,
    };
  });
}

function noRawSecretFragments(value: unknown): boolean {
  const serialized = JSON.stringify(value).toLowerCase();

  return forbiddenSerializedFragments.every(
    (fragment) => !serialized.includes(fragment.toLowerCase()),
  );
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function readGitSha(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function normalizeLineEndings(value: string): string {
  return value.replaceAll("\r\n", "\n");
}
