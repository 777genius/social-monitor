import { readFileSync } from "node:fs";

type EvalDataset = {
  readonly cases?: readonly EvalCase[];
};

type EvalCase = {
  readonly caseId?: string;
  readonly sourceKeys?: readonly string[];
  readonly queryPlannerIntent?: unknown;
  readonly candidates?: readonly { readonly candidateId?: string; readonly providerKey?: string }[];
  readonly labels?: readonly {
    readonly candidateId?: string;
    readonly relevance?: number;
    readonly mustHave?: boolean;
  }[];
};

const datasetPath = "ops/evals/source-ranking-eval-dataset.v1.json";
const minCaseCount = 20;
const maxCaseCount = 50;
const requiredSources = ["reddit", "x-twitter"] as const;

void main();

function main(): void {
  const dataset = readJson<EvalDataset>(datasetPath);
  const cases = dataset.cases ?? [];
  const violations: string[] = [];
  const caseIds = new Set<string>();
  const sourceCounts = new Map<string, number>();
  const kindCounts = {
    redditOnly: 0,
    xOnly: 0,
    mixed: 0,
  };

  if (cases.length < minCaseCount || cases.length > maxCaseCount) {
    violations.push(
      `${datasetPath}: expected ${minCaseCount}-${maxCaseCount} eval cases, got ${cases.length}`,
    );
  }

  for (const [index, evalCase] of cases.entries()) {
    const label = `cases[${index}]`;
    const caseId = readNonEmptyString(evalCase.caseId);
    const sourceKeys = evalCase.sourceKeys ?? [];
    const candidates = evalCase.candidates ?? [];
    const labels = evalCase.labels ?? [];
    const candidateIds = new Set(candidates.flatMap((candidate) =>
      readNonEmptyString(candidate.candidateId) === undefined
        ? []
        : [String(candidate.candidateId)],
    ));

    if (caseId === undefined) {
      violations.push(`${label}: caseId is required`);
    } else if (caseIds.has(caseId)) {
      violations.push(`${label}: duplicate caseId "${caseId}"`);
    } else {
      caseIds.add(caseId);
    }

    if (sourceKeys.length === 0) {
      violations.push(`${label}: sourceKeys must be non-empty`);
    }

    for (const sourceKey of sourceKeys) {
      sourceCounts.set(sourceKey, (sourceCounts.get(sourceKey) ?? 0) + 1);
    }

    if (sourceKeys.includes("reddit") && sourceKeys.includes("x-twitter")) {
      kindCounts.mixed += 1;
    } else if (sourceKeys.includes("reddit")) {
      kindCounts.redditOnly += 1;
    } else if (sourceKeys.includes("x-twitter")) {
      kindCounts.xOnly += 1;
    }

    if (evalCase.queryPlannerIntent === undefined) {
      violations.push(`${label}: queryPlannerIntent is required`);
    }

    if (candidates.length < 5) {
      violations.push(`${label}: expected at least 5 frozen candidates`);
    }

    if (labels.length !== candidateIds.size) {
      violations.push(`${label}: labels must cover every candidate exactly once`);
    }

    if (!labels.some((item) => item.mustHave === true)) {
      violations.push(`${label}: at least one mustHave label is required`);
    }

    if ((labels.filter((item) => (item.relevance ?? 0) >= 2).length) < 3) {
      violations.push(`${label}: at least 3 relevant labels are required`);
    }

    for (const candidate of candidates) {
      if (!sourceKeys.includes(String(candidate.providerKey))) {
        violations.push(
          `${label}: candidate "${candidate.candidateId ?? "<missing>"}" provider is outside sourceKeys`,
        );
      }
    }
  }

  for (const sourceKey of requiredSources) {
    if ((sourceCounts.get(sourceKey) ?? 0) === 0) {
      violations.push(`${datasetPath}: missing required source coverage for ${sourceKey}`);
    }
  }

  if (kindCounts.redditOnly < 8) {
    violations.push(`${datasetPath}: expected at least 8 reddit-only cases`);
  }

  if (kindCounts.xOnly < 8) {
    violations.push(`${datasetPath}: expected at least 8 x-twitter-only cases`);
  }

  if (kindCounts.mixed < 1) {
    violations.push(`${datasetPath}: expected at least 1 mixed reddit/x-twitter case`);
  }

  if (violations.length > 0) {
    console.error(violations.join("\n"));
    process.exit(1);
  }

  console.log(
    `Source ranking eval dataset coverage OK (${cases.length} cases: reddit=${sourceCounts.get("reddit") ?? 0}, x-twitter=${sourceCounts.get("x-twitter") ?? 0})`,
  );
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}
