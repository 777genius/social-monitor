import { existsSync, readFileSync } from "node:fs";

type SourceRankingEvalDataset = {
  readonly schemaVersion?: number;
  readonly datasetVersion?: string;
  readonly refreshPolicy?: SourceRankingEvalRefreshPolicy;
  readonly cases?: readonly {
    readonly caseId?: string;
    readonly sourceKeys?: readonly string[];
  }[];
};

type SourceRankingEvalRefreshPolicy = {
  readonly cadence?: string;
  readonly cadenceDays?: number;
  readonly lastRefreshedAt?: string;
  readonly nextRefreshDueAt?: string;
  readonly owner?: string;
  readonly refreshRunbook?: string;
  readonly feedbackBacklogArtifact?: string;
  readonly requiredSourceKeys?: readonly string[];
  readonly requiredCaseKinds?: readonly string[];
};

const datasetPath = "ops/evals/source-ranking-eval-dataset.v1.json";
const now =
  process.env.SOURCE_RANKING_EVAL_REFRESH_NOW ?? new Date().toISOString();
const dayMs = 24 * 60 * 60 * 1000;

void main();

function main(): void {
  const dataset = readJson<SourceRankingEvalDataset>(datasetPath);
  const violations: string[] = [];

  if (dataset.schemaVersion !== 1) {
    violations.push(`${datasetPath}: schemaVersion must be 1`);
  }
  if (dataset.datasetVersion !== "source-ranking-silver-v1") {
    violations.push(`${datasetPath}: datasetVersion must be source-ranking-silver-v1`);
  }

  const policy = dataset.refreshPolicy;
  if (policy === undefined) {
    violations.push(`${datasetPath}: refreshPolicy is required`);
  } else {
    validateRefreshPolicy(policy, dataset, violations);
  }

  if (violations.length > 0) {
    console.error(violations.join("\n"));
    process.exit(1);
  }

  console.log("Source ranking eval refresh policy OK");
}

function validateRefreshPolicy(
  policy: SourceRankingEvalRefreshPolicy,
  dataset: SourceRankingEvalDataset,
  violations: string[],
): void {
  if (policy.cadence !== "weekly") {
    violations.push(`${datasetPath}: refreshPolicy.cadence must be weekly`);
  }
  if (policy.cadenceDays !== 7) {
    violations.push(`${datasetPath}: refreshPolicy.cadenceDays must be 7`);
  }

  const lastRefreshedAt = parseDate(
    policy.lastRefreshedAt,
    "refreshPolicy.lastRefreshedAt",
    violations,
  );
  const nextRefreshDueAt = parseDate(
    policy.nextRefreshDueAt,
    "refreshPolicy.nextRefreshDueAt",
    violations,
  );
  const checkedAt = parseDate(now, "SOURCE_RANKING_EVAL_REFRESH_NOW", violations);

  if (lastRefreshedAt !== null && nextRefreshDueAt !== null) {
    const cadenceMs = (policy.cadenceDays ?? 0) * dayMs;
    if (nextRefreshDueAt.getTime() <= lastRefreshedAt.getTime()) {
      violations.push(
        `${datasetPath}: nextRefreshDueAt must be after lastRefreshedAt`,
      );
    }
    if (nextRefreshDueAt.getTime() - lastRefreshedAt.getTime() > cadenceMs) {
      violations.push(
        `${datasetPath}: refresh window must not exceed ${policy.cadenceDays} days`,
      );
    }
  }

  if (checkedAt !== null && nextRefreshDueAt !== null && checkedAt > nextRefreshDueAt) {
    violations.push(
      `${datasetPath}: silver dataset refresh is overdue since ${nextRefreshDueAt.toISOString()}`,
    );
  }

  requireNonEmpty(policy.owner, "refreshPolicy.owner", violations);
  requireNonEmpty(policy.refreshRunbook, "refreshPolicy.refreshRunbook", violations);
  validateBacklogArtifact(policy.feedbackBacklogArtifact, violations);
  validateSourceCoverage(policy, dataset, violations);
}

function validateBacklogArtifact(path: string | undefined, violations: string[]): void {
  if (path === undefined || path.trim().length === 0) {
    violations.push(`${datasetPath}: refreshPolicy.feedbackBacklogArtifact is required`);
    return;
  }
  if (!existsSync(path)) {
    violations.push(`${datasetPath}: feedback backlog artifact ${path} must exist`);
    return;
  }

  const artifact = readJson<{
    readonly blockingPassed?: boolean;
    readonly artifactFormat?: string;
    readonly qualityGates?: { readonly allFeedbackCategoriesMapped?: boolean };
  }>(path);
  if (artifact.artifactFormat !== "summary-feedback-eval-backlog-v1") {
    violations.push(`${path}: artifactFormat must be summary-feedback-eval-backlog-v1`);
  }
  if (artifact.blockingPassed !== true) {
    violations.push(`${path}: blockingPassed must be true`);
  }
  if (artifact.qualityGates?.allFeedbackCategoriesMapped !== true) {
    violations.push(`${path}: all feedback categories must be mapped`);
  }
}

function validateSourceCoverage(
  policy: SourceRankingEvalRefreshPolicy,
  dataset: SourceRankingEvalDataset,
  violations: string[],
): void {
  const cases = dataset.cases ?? [];
  const observedSourceKeys = new Set(cases.flatMap((item) => item.sourceKeys ?? []));
  for (const sourceKey of policy.requiredSourceKeys ?? []) {
    if (!observedSourceKeys.has(sourceKey)) {
      violations.push(`${datasetPath}: missing required sourceKey ${sourceKey}`);
    }
  }

  const caseKinds = new Set<string>(
    cases.map((item) => {
      const sourceKeys = new Set(item.sourceKeys ?? []);
      if (sourceKeys.has("reddit") && sourceKeys.has("x-twitter")) {
        return "mixed";
      }
      if (sourceKeys.has("reddit")) {
        return "reddit-only";
      }
      if (sourceKeys.has("x-twitter")) {
        return "x-twitter-only";
      }

      return "unknown";
    }),
  );

  for (const caseKind of policy.requiredCaseKinds ?? []) {
    if (!caseKinds.has(caseKind)) {
      violations.push(`${datasetPath}: missing required case kind ${caseKind}`);
    }
  }
}

function parseDate(
  value: string | undefined,
  label: string,
  violations: string[],
): Date | null {
  if (value === undefined || value.trim().length === 0) {
    violations.push(`${datasetPath}: ${label} is required`);
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    violations.push(`${datasetPath}: ${label} must be an ISO timestamp`);
    return null;
  }

  return parsed;
}

function requireNonEmpty(
  value: string | undefined,
  label: string,
  violations: string[],
): void {
  if (value === undefined || value.trim().length === 0) {
    violations.push(`${datasetPath}: ${label} must be non-empty`);
  }
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}
