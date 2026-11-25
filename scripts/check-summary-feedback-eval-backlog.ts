import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import {
  buildSummaryFeedbackEvalBacklog,
  summaryFeedbackCategories,
  summaryFeedbackEvalBacklogPolicyCoverage,
  type SummaryFeedbackCategory,
  type SummaryFeedbackEvalBacklogLabel,
  type SummaryFeedbackEvalBacklogSignal,
} from "../libs/summary/domain";

type RedactedFeedbackSampleArtifact = {
  readonly artifactFormat?: string;
  readonly samples?: readonly RedactedFeedbackSample[];
};

type RedactedFeedbackSample = {
  readonly feedbackId?: string;
  readonly category?: string;
  readonly triageOwner?: string;
  readonly eligibleForEvalFixture?: boolean;
  readonly releaseBlocking?: boolean;
  readonly summaryEvidence?: {
    readonly summaryId?: string;
    readonly interestId?: string;
    readonly citationId?: string;
    readonly feedItemId?: string;
    readonly sourceItemId?: string;
    readonly providerKey?: string;
  };
  readonly hardeningAction?: {
    readonly actionType?: string;
    readonly command?: string;
    readonly artifact?: string;
    readonly fixtureIds?: readonly string[];
    readonly exitCondition?: string;
  };
};

const inputPath =
  process.env.SUMMARY_FEEDBACK_EVAL_BACKLOG_INPUT_PATH ??
  "ops/release/fixtures/redacted-summary-feedback-samples-examples.json";
const outputPath =
  process.env.SUMMARY_FEEDBACK_EVAL_BACKLOG_OUTPUT_PATH ??
  "ops/evals/summary-feedback-eval-backlog.v1.json";
const update = process.argv.includes("--update");
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
  const artifact = readRedactedFeedbackSampleArtifact(inputPath);
  const signals = toBacklogSignals(artifact, inputPath);
  const items = buildSummaryFeedbackEvalBacklog(signals);
  const policyCoverage = summaryFeedbackEvalBacklogPolicyCoverage();
  const coveredCategories = new Set(policyCoverage.map((item) => item.category));
  const missingPolicyCategories = summaryFeedbackCategories.filter(
    (category) => !coveredCategories.has(category),
  );
  const labels = new Set(policyCoverage.map((item) => item.label));
  const requiredBlockingLabels: readonly SummaryFeedbackEvalBacklogLabel[] = [
    "factuality_regression",
    "citation_regression",
    "evidence_recall_regression",
    "relevance_regression",
  ];
  const missingBlockingLabels = requiredBlockingLabels.filter(
    (label) => !labels.has(label),
  );
  const releaseBlockingItemsMissingAction = items
    .filter((item) => item.releaseBlocking)
    .filter(
      (item) =>
        item.recommendedAction.command.trim().length === 0 ||
        item.recommendedAction.artifact.trim().length === 0 ||
        item.recommendedAction.exitCondition.trim().length === 0,
    )
    .map((item) => item.itemId);
  const evalFixtureItemsMissingTarget = items
    .filter((item) => item.evalFixtureEligible)
    .filter((item) => item.targetEvalSuites.length === 0)
    .map((item) => item.itemId);
  const itemsMissingRequiredEvidence = items
    .filter((item) => item.missingEvidence.length > 0)
    .map((item) => ({
      itemId: item.itemId,
      missingEvidence: item.missingEvidence,
    }));
  const rollup = buildRollup(items);
  const report = {
    schemaVersion: 1,
    artifactFormat: "summary-feedback-eval-backlog-v1",
    evalRunId: "summary-feedback-eval-backlog-v1",
    generatedBy: "npm run check:summary-feedback-eval-backlog",
    gitShaPolicy:
      "release pipeline records the exact git sha next to this deterministic report",
    model: {
      judge: "none",
      mapper: "summary-feedback-eval-backlog-policy",
      liveNetwork: false,
    },
    source: {
      inputPath,
      inputArtifactFormat: artifact.artifactFormat ?? "unknown",
      sampleCount: signals.length,
    },
    qualityGates: {
      allFeedbackCategoriesMapped: missingPolicyCategories.length === 0,
      missingPolicyCategories,
      requiredBlockingLabels,
      missingBlockingLabels,
      releaseBlockingItemsHaveAction:
        releaseBlockingItemsMissingAction.length === 0,
      releaseBlockingItemsMissingAction,
      evalFixtureItemsHaveTarget: evalFixtureItemsMissingTarget.length === 0,
      evalFixtureItemsMissingTarget,
      requiredEvidenceComplete: itemsMissingRequiredEvidence.length === 0,
      itemsMissingRequiredEvidence,
      noRawSecretFragments: true,
    },
    blockingPassed: false,
    policyCoverage,
    rollup,
    items,
  };
  const reportWithGate = {
    ...report,
    qualityGates: {
      ...report.qualityGates,
      noRawSecretFragments: noRawSecretFragments(report),
    },
  };
  const finalReport = {
    ...reportWithGate,
    blockingPassed: Object.entries(reportWithGate.qualityGates)
      .filter(([, value]) => typeof value === "boolean")
      .every(([, value]) => value === true),
  };
  const serialized = `${JSON.stringify(finalReport, null, 2)}\n`;

  if (!finalReport.blockingPassed) {
    console.error(serialized);
    throw new Error("Summary feedback eval backlog gates failed");
  }

  if (update) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, serialized);
    console.log(`Updated ${outputPath}`);
    return;
  }

  if (!existsSync(outputPath)) {
    throw new Error(
      `${outputPath} is missing. Run npm run check:summary-feedback-eval-backlog -- --update`,
    );
  }

  const expected = normalizeLineEndings(readFileSync(outputPath, "utf8"));

  if (expected !== serialized) {
    throw new Error(
      `${outputPath} is stale. Run npm run check:summary-feedback-eval-backlog -- --update`,
    );
  }

  console.log(
    `Summary feedback eval backlog OK (${items.length} items, git ${readGitSha()})`,
  );
}

function readRedactedFeedbackSampleArtifact(
  path: string,
): RedactedFeedbackSampleArtifact {
  const artifact = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!isRecord(artifact)) {
    throw new Error(`${path} must contain a JSON object`);
  }

  return artifact as RedactedFeedbackSampleArtifact;
}

function toBacklogSignals(
  artifact: RedactedFeedbackSampleArtifact,
  sourceArtifact: string,
): readonly SummaryFeedbackEvalBacklogSignal[] {
  if (!Array.isArray(artifact.samples)) {
    throw new Error(`${sourceArtifact} must include a samples array`);
  }

  return artifact.samples.map((sample, index) => {
    if (!isSummaryFeedbackCategoryValue(sample.category)) {
      throw new Error(
        `${sourceArtifact} sample ${index} has unsupported feedback category`,
      );
    }
    if (typeof sample.feedbackId !== "string" || sample.feedbackId.length === 0) {
      throw new Error(`${sourceArtifact} sample ${index} must include feedbackId`);
    }
    if (sample.summaryEvidence === undefined) {
      throw new Error(
        `${sourceArtifact} sample ${sample.feedbackId} must include summaryEvidence`,
      );
    }

    return {
      feedbackId: sample.feedbackId,
      category: sample.category,
      triageOwner: sample.triageOwner,
      eligibleForEvalFixture: sample.eligibleForEvalFixture === true,
      releaseBlocking: sample.releaseBlocking === true,
      summaryEvidence: {
        summaryId: sample.summaryEvidence.summaryId ?? "",
        interestId: sample.summaryEvidence.interestId ?? "",
        citationId: sample.summaryEvidence.citationId,
        feedItemId: sample.summaryEvidence.feedItemId,
        sourceItemId: sample.summaryEvidence.sourceItemId,
        providerKey: sample.summaryEvidence.providerKey,
      },
      hardeningAction: sample.hardeningAction,
      sourceArtifact,
    };
  });
}

function buildRollup(
  items: ReturnType<typeof buildSummaryFeedbackEvalBacklog>,
): {
  readonly itemCount: number;
  readonly labelCounts: Record<string, number>;
  readonly priorityCounts: Record<string, number>;
  readonly targetEvalSuiteCounts: Record<string, number>;
  readonly evalFixtureEligibleItems: number;
  readonly releaseBlockingItems: number;
} {
  const labelCounts: Record<string, number> = {};
  const priorityCounts: Record<string, number> = {};
  const targetEvalSuiteCounts: Record<string, number> = {};

  for (const item of items) {
    increment(labelCounts, item.label);
    increment(priorityCounts, item.priority);
    for (const target of item.targetEvalSuites) {
      increment(targetEvalSuiteCounts, target);
    }
  }

  return {
    itemCount: items.length,
    labelCounts,
    priorityCounts,
    targetEvalSuiteCounts,
    evalFixtureEligibleItems: items.filter((item) => item.evalFixtureEligible)
      .length,
    releaseBlockingItems: items.filter((item) => item.releaseBlocking).length,
  };
}

function isSummaryFeedbackCategoryValue(
  value: string | undefined,
): value is SummaryFeedbackCategory {
  return summaryFeedbackCategories.includes(value as SummaryFeedbackCategory);
}

function noRawSecretFragments(value: unknown): boolean {
  const serialized = JSON.stringify(value).toLowerCase();

  return forbiddenSerializedFragments.every(
    (fragment) => !serialized.includes(fragment.toLowerCase()),
  );
}

function increment(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
