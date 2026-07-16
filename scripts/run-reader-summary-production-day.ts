import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { Pool } from "pg";

import {
  nextDate,
  noRawSecretFragments,
  readOption,
  yesterdaySocialQualityDatabaseUrl,
} from "./lib/yesterday-social-replay-support";
import { loadDotenvIfPresent } from "./lib/env-file";
import { READER_SUMMARY_PRODUCTION_RUNTIME_POLICY } from "./lib/reader-summary-production-runtime-policy";
import {
  blockedProductionDaySteps,
  collectionIsReadyForProductionSummary,
} from "./lib/reader-summary-production-day-collection-barrier";

type StepStatus = "passed" | "failed" | "skipped";

type StepReport = {
  readonly id: string;
  readonly command: string;
  readonly status: StepStatus;
  readonly durationMs: number;
  readonly exitCode: number | null;
};

const degradedQualityStepIds = new Set([
  "collection-quality",
  "quality-dashboard",
  "source-quality-trace",
]);

loadDotenvIfPresent(".env");

type ProductionDayReport = {
  readonly schemaVersion: 1;
  readonly artifactFormat: "reader-summary-production-day-run-v1";
  readonly generatedBy: string;
  readonly requestedDate: string;
  readonly collectionDate: string;
  readonly model: {
    readonly liveCollection: boolean;
    readonly summaryModel:
      "agent-runtime" | "openai-responses" | "deterministic";
    readonly physicalModel: "gpt-5.5";
    readonly reasoningEffort: "xhigh";
    readonly topicLabeler: "agent-runtime" | "deterministic";
    readonly writesProductionData: true;
    readonly allowDegraded: boolean;
    readonly allowHistorical: boolean;
    readonly rawProviderPayloadPersistedInReport: false;
    readonly rawPostTextPersistedInReport: false;
  };
  readonly inputs: {
    readonly periodStartedAt: string;
    readonly periodEndedAt: string;
    readonly tenantFingerprint: string | null;
    readonly workspaceFingerprint: string | null;
    readonly evidencePath: string;
    readonly frontendFixturePath: string;
  };
  readonly run: {
    readonly startedAt: string;
    readonly completedAt: string;
  };
  readonly failure: {
    readonly code: "collection_quality_failed";
    readonly safeMessage: string;
  } | null;
  readonly summary: {
    readonly evidenceArtifactId: string | null;
    readonly readerSummaryId: string | null;
    readonly readerSummaryJobId: string | null;
    readonly headline: string | null;
  };
  readonly steps: readonly StepReport[];
  readonly stats: {
    readonly collectedFeedItemCount: number | null;
    readonly publishedInsideWindowFeedItemCount: number | null;
    readonly observedButPublishedOutsideWindowFeedItemCount: number | null;
    readonly duplicateFeedItemCount: number | null;
    readonly lowRelevanceFeedItemCount: number | null;
    readonly summaryCandidateFeedItemCount: number | null;
    readonly selectedFeedItemCount: number | null;
    readonly topReadCount: number | null;
    readonly providerCounts: Record<string, number>;
    readonly xAccountCount: number | null;
    readonly xAccountTotalCount: number | null;
    readonly xAccountEligibleCount: number | null;
    readonly xAccountUsageEventCount: number | null;
    readonly xAccounts: readonly {
      readonly accountFingerprint: string;
      readonly priorityRank: number;
      readonly prioritySource: string;
      readonly eligible: boolean;
      readonly ineligibilityReasonCodes: readonly string[];
      readonly dailyRequests: number;
      readonly dailyTweets: number;
      readonly passSucceededCount: number;
      readonly passFailedCount: number;
      readonly rateLimitCount: number;
      readonly cooldownObservedCount: number;
      readonly lastUsedAt: string | null;
      readonly cooldownUntil: string | null;
    }[];
  };
  readonly qualityGates: Record<string, boolean>;
  readonly blockingPassed: boolean;
};

const outputPath = "ops/evals/reader-summary-production-day-run.v1.json";
const update = process.argv.includes("--update");
const artifactOnly = process.argv.includes("--artifact-only");
const reuseExistingArtifacts = process.argv.includes(
  "--reuse-existing-artifacts",
);
const skipLiveCollection =
  process.argv.includes("--skip-live-collection") || reuseExistingArtifacts;
const allowDegraded = process.argv.includes("--allow-degraded");
const allowHistorical = process.argv.includes("--allow-historical");
const collectionDate = artifactOnly ? "1970-01-01" : resolveCollectionDate();
const summaryModel = resolveSummaryModel();
if (!artifactOnly && summaryModel !== "agent-runtime") {
  throw new Error(
    "Production reader summaries must use subscription runtime (agent-runtime)",
  );
}
const topicLabeler = resolveTopicLabeler();
const periodStartedAt = `${collectionDate}T00:00:00.000Z`;
const periodEndedAt = nextDate(collectionDate);
const runtimeArtifactDirectory = resolve(
  process.env.READER_SUMMARY_PRODUCTION_DAY_ARTIFACT_DIR ??
    join(
      tmpdir(),
      "social-monitor",
      "reader-summary-production-day",
      collectionDate,
    ),
);
const evidencePath = join(
  runtimeArtifactDirectory,
  `durable-reader-summary-${collectionDate}.v1.json`,
);
const frontendFixturePath = join(
  runtimeArtifactDirectory,
  `frontend-reader-summary-${collectionDate}.fixture.v1.json`,
);
const nextEvidencePath = evidencePath.replace(/\.json$/u, ".next.json");
const nextFrontendFixturePath = frontendFixturePath.replace(
  /\.json$/u,
  ".next.json",
);
const datedOutputPath = `ops/evals/reader-summary-production-day-run.${collectionDate}.v1.json`;

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  if (artifactOnly) {
    validateExistingReport();
    return;
  }

  const startedAt = new Date();
  const steps: StepReport[] = [];

  steps.push(runNpm("migrate", ["run", "migrate:deploy"]));
  const scope = await readProductionDayScope();

  const collectionStep: StepReport = skipLiveCollection
    ? {
        id: "collect",
        command:
          "npm run run:reader-summary-clean-real-day-collection -- skipped",
        status: "skipped",
        durationMs: 0,
        exitCode: null,
      }
    : runNpm("collect", [
        "run",
        "run:reader-summary-clean-real-day-collection",
        "--",
        "--update",
        "--date",
        collectionDate,
        ...(allowHistorical ? [] : ["--wait-for-x-readiness"]),
      ]);
  steps.push(collectionStep);

  mkdirSync(runtimeArtifactDirectory, { recursive: true });
  rmSync(nextEvidencePath, { force: true });
  rmSync(nextFrontendFixturePath, { force: true });

  const collectionQualityStep = runNpm("collection-quality", [
    "run",
    "check:yesterday-social-collection-quality",
    "--",
    "--update",
    "--date",
    collectionDate,
    "--write-failed-report",
    ...(allowHistorical ? ["--allow-historical"] : []),
  ]);
  steps.push(collectionQualityStep);
  if (
    !collectionIsReadyForProductionSummary({
      liveCollection: !skipLiveCollection,
      collectionStepStatus: collectionStep.status,
      collectionQualityStepStatus: collectionQualityStep.status,
    })
  ) {
    const safeMessage =
      "Production collection quality failed; AI summary was not started";
    steps.push(...blockedProductionDaySteps(safeMessage));
    persistProductionDayReport({
      startedAt,
      completedAt: new Date(),
      steps,
      scope,
      includeSummaryEvidence: false,
      failure: {
        code: "collection_quality_failed",
        safeMessage,
      },
    });
    throw new Error(safeMessage);
  }

  const summaryStep = reuseExistingArtifacts
    ? existingSummaryArtifactStep()
    : runNpm(
        "durable-reader-summary",
        ["run", "capture:durable-reader-summary"],
        {
          DATABASE_URL: yesterdaySocialQualityDatabaseUrl(),
          DURABLE_READER_SUMMARY_MODEL: summaryModel,
          AGENT_RUNTIME_READER_SUMMARY_MODEL: "gpt-5.5",
          AGENT_RUNTIME_READER_SUMMARY_REASONING_EFFORT: "xhigh",
          AGENT_RUNTIME_READER_SUMMARY_TIMEOUT_MS: String(
            READER_SUMMARY_PRODUCTION_RUNTIME_POLICY.summaryModelTimeoutMs,
          ),
          AGENT_RUNTIME_READER_SUMMARY_STORY_RELATION_VERIFIER_TIMEOUT_MS:
            String(
              READER_SUMMARY_PRODUCTION_RUNTIME_POLICY.storyRelationTimeoutMs,
            ),
          AGENT_RUNTIME_READER_SUMMARY_TOPIC_LABELER_TIMEOUT_MS: String(
            READER_SUMMARY_PRODUCTION_RUNTIME_POLICY.topicLabelerTimeoutMs,
          ),
          AGENT_RUNTIME_READER_SUMMARY_TOPIC_RELATION_VERIFIER_TIMEOUT_MS:
            String(
              READER_SUMMARY_PRODUCTION_RUNTIME_POLICY.topicRelationTimeoutMs,
            ),
          AGENT_RUNTIME_READER_SUMMARY_TOPIC_LABELER_MAX_CANDIDATES: "18",
          DURABLE_READER_SUMMARY_TOPIC_LABELER: topicLabeler,
          DURABLE_READER_SUMMARY_TENANT_ID: scope.tenantId,
          DURABLE_READER_SUMMARY_WORKSPACE_ID: scope.workspaceId,
          DURABLE_READER_SUMMARY_CADENCE: "daily",
          DURABLE_READER_SUMMARY_PERIOD_STARTED_AT: periodStartedAt,
          DURABLE_READER_SUMMARY_PERIOD_ENDED_AT: periodEndedAt,
          DURABLE_READER_SUMMARY_MAX_EVIDENCE_ITEMS: "120",
          DURABLE_READER_SUMMARY_MAX_STORIES: "15",
          DURABLE_READER_SUMMARY_EVIDENCE_PATH: nextEvidencePath,
          DURABLE_READER_SUMMARY_FRONTEND_FIXTURE_PATH: nextFrontendFixturePath,
          DURABLE_READER_SUMMARY_REJECTED_TOPIC_MAP_PATH: join(
            runtimeArtifactDirectory,
            `rejected-topic-map-${collectionDate}.v1.json`,
          ),
        },
      );
  steps.push(summaryStep);
  if (!reuseExistingArtifacts && summaryStep.status === "passed") {
    replaceArtifact(nextEvidencePath, evidencePath);
    replaceArtifact(nextFrontendFixturePath, frontendFixturePath);
  } else {
    rmSync(nextEvidencePath, { force: true });
    rmSync(nextFrontendFixturePath, { force: true });
  }

  steps.push(
    runNpm("artifact-quality", [
      "run",
      "check:yesterday-reader-summary-artifact-quality",
      "--",
      "--update",
      "--date",
      collectionDate,
      ...(allowDegraded ? ["--allow-dirty-collection"] : []),
      ...(allowHistorical ? ["--allow-historical"] : []),
    ]),
  );
  steps.push(
    runNpm("quality-dashboard", [
      "run",
      "check:reader-summary-quality-dashboard",
      "--",
      "--update",
      "--date",
      collectionDate,
      ...(allowDegraded ? ["--allow-degraded"] : []),
      ...(allowHistorical ? ["--allow-historical"] : []),
    ]),
  );
  steps.push(
    runNpm("top-read-ranking", [
      "run",
      "check:reader-summary-top-read-ranking",
      "--",
      "--update",
      "--date",
      collectionDate,
      "--write-failed-report",
    ]),
  );
  steps.push(
    runNpm("source-quality-trace", [
      "run",
      "check:reader-summary-source-quality-trace",
      "--",
      "--update",
      "--date",
      collectionDate,
    ]),
  );
  if (shouldRunCleanDayE2e()) {
    steps.push(
      runNpm("clean-day-e2e", [
        "run",
        "check:reader-summary-clean-real-day-e2e",
        "--",
        "--update",
        ...(allowDegraded ? ["--allow-degraded"] : []),
        ...(allowHistorical ? ["--allow-historical"] : []),
      ]),
    );
  } else {
    steps.push({
      id: "clean-day-e2e",
      command:
        "npm run check:reader-summary-clean-real-day-e2e -- skipped for historical production-day date",
      status: "skipped",
      durationMs: 0,
      exitCode: null,
    });
  }

  const report = persistProductionDayReport({
    startedAt,
    completedAt: new Date(),
    steps,
    scope,
    includeSummaryEvidence: true,
    failure: null,
  });

  if (!report.blockingPassed) {
    throw new Error("Reader summary production day run gates failed");
  }
}

function persistProductionDayReport(params: {
  readonly startedAt: Date;
  readonly completedAt: Date;
  readonly steps: readonly StepReport[];
  readonly scope: { readonly tenantId: string; readonly workspaceId: string };
  readonly includeSummaryEvidence: boolean;
  readonly failure: ProductionDayReport["failure"];
}): ProductionDayReport {
  const report = buildReport(params);
  const serialized = `${JSON.stringify(report, null, 2)}\n`;

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, serialized);
  writeFileSync(datedOutputPath, serialized);
  if (update) {
    console.log(`Updated ${outputPath}`);
    console.log(`Updated ${datedOutputPath}`);
  }
  printStats(report);
  return report;
}

function runNpm(
  id: string,
  args: readonly string[],
  extraEnv: Record<string, string> = {},
): StepReport {
  const startedAt = Date.now();
  const result = spawnSync("npm", [...args], {
    cwd: process.cwd(),
    env: { ...process.env, ...extraEnv },
    stdio: "inherit",
  });

  return {
    id,
    command: `npm ${args.join(" ")}`,
    status: result.status === 0 ? "passed" : "failed",
    durationMs: Date.now() - startedAt,
    exitCode: result.status,
  };
}

function replaceArtifact(sourcePath: string, targetPath: string): void {
  if (!existsSync(sourcePath)) {
    return;
  }

  rmSync(targetPath, { force: true });
  renameSync(sourcePath, targetPath);
}

function shouldRunCleanDayE2e(): boolean {
  if (reuseExistingArtifacts) {
    return true;
  }
  if (skipLiveCollection) {
    return false;
  }
  if (!allowHistorical) {
    return true;
  }
  return collectionDate >= new Date().toISOString().slice(0, 10);
}

function existingSummaryArtifactStep(): StepReport {
  const artifactExists = existsSync(evidencePath);

  return {
    id: "durable-reader-summary",
    command: "reuse persisted durable reader summary artifact",
    status: artifactExists ? "skipped" : "failed",
    durationMs: 0,
    exitCode: artifactExists ? null : 1,
  };
}

function buildReport(params: {
  readonly startedAt: Date;
  readonly completedAt: Date;
  readonly steps: readonly StepReport[];
  readonly scope: { readonly tenantId: string; readonly workspaceId: string };
  readonly includeSummaryEvidence: boolean;
  readonly failure: ProductionDayReport["failure"];
}): ProductionDayReport {
  const collectionQuality = readJsonIfExists<{
    readonly dayWindowAudit?: {
      readonly observedInsideWindowFeedItemCount?: number;
      readonly publishedInsideWindowFeedItemCount?: number;
      readonly observedButPublishedOutsideWindowFeedItemCount?: number;
      readonly duplicateFeedItemCount?: number;
      readonly lowRelevanceFeedItemCount?: number;
      readonly summaryCandidateFeedItemCount?: number;
      readonly providerBreakdown?: readonly {
        readonly providerKey: string;
        readonly publishedInsideWindowFeedItemCount?: number;
      }[];
    };
    readonly xAccountPool?: {
      readonly accountCount?: number;
      readonly totalAccountCount?: number;
      readonly eligibleAccountCount?: number;
      readonly eventCount?: number;
      readonly accounts?: readonly {
        readonly accountFingerprint?: string;
        readonly priorityRank?: number;
        readonly prioritySource?: string;
        readonly eligible?: boolean;
        readonly ineligibilityReasonCodes?: readonly string[];
        readonly dailyRequests?: number;
        readonly dailyTweets?: number;
        readonly passSucceededCount?: number;
        readonly passFailedCount?: number;
        readonly rateLimitCount?: number;
        readonly cooldownObservedCount?: number;
        readonly lastUsedAt?: string | null;
        readonly cooldownUntil?: string | null;
      }[];
    };
  }>("ops/evals/yesterday-social-collection-quality-report.v1.json");
  const durableEvidence = params.includeSummaryEvidence
    ? readJsonIfExists<{
        readonly artifactId?: string;
        readonly result?: {
          readonly readerSummaryId?: string;
          readonly readerSummaryJobId?: string;
          readonly headline?: string;
          readonly selectedFeedItemCount?: number;
          readonly topReadCount?: number;
        };
      }>(evidencePath)
    : null;
  const providerCounts = Object.fromEntries(
    collectionQuality?.dayWindowAudit?.providerBreakdown?.map((provider) => [
      provider.providerKey,
      provider.publishedInsideWindowFeedItemCount ?? 0,
    ]) ?? [],
  );
  const qualityGates = {
    allRequiredStepsPassed: params.steps.every((step) =>
      stepPassedOrAllowedDegraded(step),
    ),
    degradedFailuresAreExplicitlyAllowed: params.steps.every(
      (step) =>
        step.status !== "failed" ||
        (allowDegraded && degradedQualityStepIds.has(step.id)),
    ),
    collectionQualityReported:
      collectionQuality?.dayWindowAudit?.publishedInsideWindowFeedItemCount !==
      undefined,
    durableSummaryCaptured:
      durableEvidence?.result?.selectedFeedItemCount !== undefined,
    durableSummaryPersisted:
      typeof durableEvidence?.result?.readerSummaryId === "string" &&
      durableEvidence.result.readerSummaryId.length > 0,
    xAccountPoolReported:
      collectionQuality?.xAccountPool?.totalAccountCount !== undefined &&
      collectionQuality.xAccountPool.eligibleAccountCount !== undefined,
    reportDateMatchesRequestedDate:
      collectionDate === periodStartedAt.slice(0, 10),
    noRawSecretFragments: true,
    productionFailureAbsent: params.failure === null,
  };
  const reportWithoutSecretGate = {
    schemaVersion: 1,
    artifactFormat: "reader-summary-production-day-run-v1",
    generatedBy: "npm run run:reader-summary-production-day",
    requestedDate: collectionDate,
    collectionDate,
    model: {
      liveCollection: !skipLiveCollection,
      summaryModel,
      physicalModel: "gpt-5.5",
      reasoningEffort: "xhigh",
      topicLabeler,
      writesProductionData: true,
      allowDegraded,
      allowHistorical,
      rawProviderPayloadPersistedInReport: false,
      rawPostTextPersistedInReport: false,
    },
    inputs: {
      periodStartedAt,
      periodEndedAt,
      tenantFingerprint: shortFingerprint(params.scope.tenantId),
      workspaceFingerprint: shortFingerprint(params.scope.workspaceId),
      evidencePath,
      frontendFixturePath,
    },
    run: {
      startedAt: params.startedAt.toISOString(),
      completedAt: params.completedAt.toISOString(),
    },
    failure: params.failure,
    summary: {
      evidenceArtifactId: durableEvidence?.artifactId ?? null,
      readerSummaryId: durableEvidence?.result?.readerSummaryId ?? null,
      readerSummaryJobId: durableEvidence?.result?.readerSummaryJobId ?? null,
      headline: durableEvidence?.result?.headline ?? null,
    },
    steps: params.steps,
    stats: {
      collectedFeedItemCount:
        collectionQuality?.dayWindowAudit?.publishedInsideWindowFeedItemCount ??
        null,
      publishedInsideWindowFeedItemCount:
        collectionQuality?.dayWindowAudit?.publishedInsideWindowFeedItemCount ??
        null,
      observedButPublishedOutsideWindowFeedItemCount:
        collectionQuality?.dayWindowAudit
          ?.observedButPublishedOutsideWindowFeedItemCount ?? null,
      duplicateFeedItemCount:
        collectionQuality?.dayWindowAudit?.duplicateFeedItemCount ?? null,
      lowRelevanceFeedItemCount:
        collectionQuality?.dayWindowAudit?.lowRelevanceFeedItemCount ?? null,
      summaryCandidateFeedItemCount:
        collectionQuality?.dayWindowAudit?.summaryCandidateFeedItemCount ??
        null,
      selectedFeedItemCount:
        durableEvidence?.result?.selectedFeedItemCount ?? null,
      topReadCount: durableEvidence?.result?.topReadCount ?? null,
      providerCounts,
      xAccountCount: collectionQuality?.xAccountPool?.totalAccountCount ?? null,
      xAccountTotalCount:
        collectionQuality?.xAccountPool?.totalAccountCount ?? null,
      xAccountEligibleCount:
        collectionQuality?.xAccountPool?.eligibleAccountCount ?? null,
      xAccountUsageEventCount:
        collectionQuality?.xAccountPool?.eventCount ?? null,
      xAccounts:
        collectionQuality?.xAccountPool?.accounts?.flatMap((account) =>
          account.accountFingerprint === undefined ||
          account.priorityRank === undefined
            ? []
            : [
                {
                  accountFingerprint: account.accountFingerprint,
                  priorityRank: account.priorityRank,
                  prioritySource: account.prioritySource ?? "unknown",
                  eligible: account.eligible === true,
                  ineligibilityReasonCodes:
                    account.ineligibilityReasonCodes ?? [],
                  dailyRequests: account.dailyRequests ?? 0,
                  dailyTweets: account.dailyTweets ?? 0,
                  passSucceededCount: account.passSucceededCount ?? 0,
                  passFailedCount: account.passFailedCount ?? 0,
                  rateLimitCount: account.rateLimitCount ?? 0,
                  cooldownObservedCount: account.cooldownObservedCount ?? 0,
                  lastUsedAt: account.lastUsedAt ?? null,
                  cooldownUntil: account.cooldownUntil ?? null,
                },
              ],
        ) ?? [],
    },
    qualityGates,
    blockingPassed: false,
  } satisfies ProductionDayReport;
  const finalQualityGates = {
    ...qualityGates,
    noRawSecretFragments: noRawSecretFragments(reportWithoutSecretGate),
  };

  return {
    ...reportWithoutSecretGate,
    qualityGates: finalQualityGates,
    blockingPassed: Object.values(finalQualityGates).every(Boolean),
  };
}

function stepPassedOrAllowedDegraded(step: StepReport): boolean {
  if (step.status === "passed" || step.status === "skipped") {
    return true;
  }

  return allowDegraded && degradedQualityStepIds.has(step.id);
}

async function readProductionDayScope(): Promise<{
  readonly tenantId: string;
  readonly workspaceId: string;
}> {
  const pool = new Pool({
    connectionString: yesterdaySocialQualityDatabaseUrl(),
    min: 0,
    max: 1,
    connectionTimeoutMillis: 2_000,
  });

  try {
    const result = await pool.query<{
      readonly tenantId: string;
      readonly workspaceId: string;
      readonly itemCount: string;
    }>(
      `
        select
          tenant_id::text as "tenantId",
          workspace_id::text as "workspaceId",
          count(*)::text as "itemCount"
        from feed_items
        where published_at >= $1::timestamptz
          and published_at < $2::timestamptz
        group by tenant_id, workspace_id
        order by count(*) desc
        limit 1
      `,
      [periodStartedAt, periodEndedAt],
    );
    const row = result.rows[0];
    if (row !== undefined && Number.parseInt(row.itemCount, 10) > 0) {
      return {
        tenantId: row.tenantId,
        workspaceId: row.workspaceId,
      };
    }

    return await readDominantConfiguredScope(pool);
  } finally {
    await pool.end().catch(() => undefined);
  }
}

async function readDominantConfiguredScope(pool: Pool): Promise<{
  readonly tenantId: string;
  readonly workspaceId: string;
}> {
  const result = await pool.query<{
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly bindingCount: string;
  }>(
    `
      select
        tenant_id::text as "tenantId",
        workspace_id::text as "workspaceId",
        count(*)::text as "bindingCount"
      from source_bindings
      where deleted_at is null
        and status = 'ENABLED'
      group by tenant_id, workspace_id
      order by count(*) desc
      limit 1
    `,
  );
  const row = result.rows[0];
  if (row === undefined || Number.parseInt(row.bindingCount, 10) === 0) {
    throw new Error(
      `No published feed items or enabled source bindings found for ${collectionDate}`,
    );
  }

  console.warn(
    `No published feed items found for ${collectionDate}; using enabled source binding scope before live collection.`,
  );
  return {
    tenantId: row.tenantId,
    workspaceId: row.workspaceId,
  };
}

function printStats(report: ProductionDayReport): void {
  console.log(
    [
      `production-day=${report.collectionDate}`,
      `collected=${report.stats.collectedFeedItemCount ?? "n/a"}`,
      `published=${report.stats.publishedInsideWindowFeedItemCount ?? "n/a"}`,
      `outside=${report.stats.observedButPublishedOutsideWindowFeedItemCount ?? "n/a"}`,
      `duplicates=${report.stats.duplicateFeedItemCount ?? "n/a"}`,
      `lowRelevance=${report.stats.lowRelevanceFeedItemCount ?? "n/a"}`,
      `candidates=${report.stats.summaryCandidateFeedItemCount ?? "n/a"}`,
      `selected=${report.stats.selectedFeedItemCount ?? "n/a"}`,
      `topReads=${report.stats.topReadCount ?? "n/a"}`,
      `xAccountsEligible=${report.stats.xAccountEligibleCount ?? "n/a"}/${report.stats.xAccountTotalCount ?? "n/a"}`,
      `xAccountEvents=${report.stats.xAccountUsageEventCount ?? "n/a"}`,
    ].join(" | "),
  );
  for (const account of report.stats.xAccounts ?? []) {
    console.log(
      [
        `xAccount=${account.accountFingerprint}`,
        `priority=${account.priorityRank}`,
        `prioritySource=${account.prioritySource}`,
        `eligible=${account.eligible ?? "n/a"}`,
        `ineligibleReasons=${account.ineligibilityReasonCodes?.join(",") || "none"}`,
        `requests=${account.dailyRequests}`,
        `tweets=${account.dailyTweets}`,
        `success=${account.passSucceededCount}`,
        `failed=${account.passFailedCount}`,
        `rateLimit=${account.rateLimitCount}`,
        `cooldown=${account.cooldownObservedCount}`,
        `lastUsed=${account.lastUsedAt ?? "n/a"}`,
        `cooldownUntil=${account.cooldownUntil ?? "n/a"}`,
      ].join(" | "),
    );
  }
}

function shortFingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function resolveCollectionDate(): string {
  const explicit = readOption("--date");
  if (explicit !== undefined) {
    assertCollectionDate(explicit);
    return explicit;
  }
  if (process.argv.includes("--today")) {
    return new Date().toISOString().slice(0, 10);
  }
  if (process.argv.includes("--yesterday")) {
    return new Date(Date.now() - 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
  }

  throw new Error("Provide --date YYYY-MM-DD, --today or --yesterday");
}

function resolveSummaryModel(): ProductionDayReport["model"]["summaryModel"] {
  const value = readOption("--summary-model") ?? "agent-runtime";
  if (
    value === "agent-runtime" ||
    value === "openai-responses" ||
    value === "deterministic"
  ) {
    return value;
  }

  throw new Error(
    "--summary-model must be agent-runtime, openai-responses or deterministic",
  );
}

function resolveTopicLabeler(): ProductionDayReport["model"]["topicLabeler"] {
  const value = readOption("--topic-labeler") ?? "agent-runtime";
  if (value === "agent-runtime" || value === "deterministic") {
    return value;
  }

  throw new Error("--topic-labeler must be agent-runtime or deterministic");
}

function validateExistingReport(): void {
  if (!existsSync(outputPath)) {
    throw new Error(`${outputPath} is missing`);
  }

  const report = readJsonIfExists<ProductionDayReport>(outputPath);
  if (report === null) {
    throw new Error(`${outputPath} is missing`);
  }
  const valid =
    report.schemaVersion === 1 &&
    report.artifactFormat === "reader-summary-production-day-run-v1" &&
    report.blockingPassed === true &&
    noRawSecretFragments(report);

  if (!valid) {
    throw new Error(`${outputPath} failed validation`);
  }

  printStats(report);
}

function readJsonIfExists<TValue>(path: string): TValue | null {
  if (!existsSync(path)) {
    return null;
  }

  return JSON.parse(readFileSync(path, "utf8")) as TValue;
}

function assertCollectionDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Collection date must use YYYY-MM-DD format: ${value}`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`Collection date is invalid: ${value}`);
  }
}
