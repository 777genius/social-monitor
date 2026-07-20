import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
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

import { GrpcAgentRuntimeClient } from "@social-monitor/summary/adapters/model/grpc-agent-runtime-client";
import { SystemClock } from "@social-monitor/shared-kernel";

import {
  nextDate,
  noRawSecretFragments,
  readOption,
  yesterdaySocialQualityDatabaseUrl,
} from "./lib/yesterday-social-replay-support";
import { loadDotenvIfPresent } from "./lib/env-file";
import { READER_SUMMARY_PRODUCTION_RUNTIME_POLICY } from "./lib/reader-summary-production-runtime-policy";
import {
  artifactQualityIsReadyForCleanDayE2e,
  blockedCleanDayE2eStep,
  blockedProductionDaySteps,
  collectionIsReadyForProductionSummary,
  type ProductionDayStepReport,
} from "./lib/reader-summary-production-day-collection-barrier";
import {
  buildProductionDayReport,
  validateLiveProductionDayReport,
  type HistoricalReuseProvenance,
  type ProductionDayCollectionQuality,
  type ProductionDayDurableEvidence,
  type ProductionDayReport,
} from "./lib/reader-summary-production-day-report";
import {
  attachCaptureExecutionEvidence,
  inspectDurableEvidenceArtifact,
  isRecord,
  readRequiredFreshCaptureCandidates,
  type DurableEvidenceBinding,
  type ProductionDayCaptureExecution,
  type ProductionDayRuntimeHealth,
} from "./lib/reader-summary-production-day-provenance";
import {
  loadHistoricalReuseProvenance,
  resolveProductionDayExecutionRequest,
} from "./lib/reader-summary-production-day-reuse-provenance";
import {
  probeProductionRuntimeLiveIdentity,
  runtimeLiveIdentityProofRequired,
  serializeProductionRuntimeLiveIdentity,
} from "./lib/reader-summary-runtime-live-identity";

type StepReport = ProductionDayStepReport;

loadDotenvIfPresent(".env");

const outputPath = "ops/evals/reader-summary-production-day-run.v1.json";
const update = process.argv.includes("--update");
const artifactOnly = process.argv.includes("--artifact-only");
const executionRequest = resolveProductionDayExecutionRequest(
  process.argv.slice(2),
);
const reuseExistingArtifacts = executionRequest.mode === "historical-reuse";
const skipLiveCollection = executionRequest.mode === "historical-reuse";
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
if (!artifactOnly && topicLabeler !== "agent-runtime") {
  throw new Error(
    "Production reader summary topics must use subscription runtime (agent-runtime)",
  );
}
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
const runtimeIdentityPath = join(
  runtimeArtifactDirectory,
  `runtime-live-identity-${collectionDate}.v1.json`,
);
const nextRuntimeIdentityPath = runtimeIdentityPath.replace(
  /\.json$/u,
  ".next.json",
);
const datedOutputPath = `ops/evals/reader-summary-production-day-run.${collectionDate}.v1.json`;
let liveCaptureExecution: ProductionDayCaptureExecution | null = null;

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
  const historicalReuse =
    executionRequest.mode === "historical-reuse"
      ? loadHistoricalReuseProvenance({
          request: executionRequest,
          evidencePath,
          frontendFixturePath,
          collectionDate,
        })
      : null;

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
  isolateCaptureArtifacts();

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
      historicalReuseProvenance: historicalReuse?.provenance ?? null,
    });
    throw new Error(safeMessage);
  }

  const captureExecutionId = randomUUID();
  const captureStartedAt = new Date();
  let summaryStep = reuseExistingArtifacts
    ? existingSummaryArtifactStep()
    : runNpm(
        "durable-reader-summary",
        ["run", "capture:durable-reader-summary"],
        {
          DATABASE_URL: yesterdaySocialQualityDatabaseUrl(),
          DURABLE_READER_SUMMARY_MODEL: summaryModel,
          AGENT_RUNTIME_READER_SUMMARY_MODEL: "gpt-5.5",
          AGENT_RUNTIME_PROVIDER: "codex",
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
  if (!reuseExistingArtifacts && summaryStep.status === "passed") {
    try {
      liveCaptureExecution = await bindAndPromoteFreshCapture({
        executionId: captureExecutionId,
        startedAt: captureStartedAt,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "unknown artifact failure";
      console.error(`Fresh durable capture binding failed: ${message}`);
      summaryStep = {
        ...summaryStep,
        command: `${summaryStep.command} -- fresh artifact binding failed`,
        status: "failed",
        exitCode: 1,
      };
      removeAllLiveCaptureArtifacts();
    }
  } else {
    rmSync(nextEvidencePath, { force: true });
    rmSync(nextFrontendFixturePath, { force: true });
  }
  steps.push(summaryStep);

  const artifactQualityStep = runNpm("artifact-quality", [
    "run",
    "check:yesterday-reader-summary-artifact-quality",
    "--",
    "--update",
    "--date",
    collectionDate,
    ...(allowDegraded ? ["--allow-dirty-collection"] : []),
    ...(allowHistorical ? ["--allow-historical"] : []),
  ]);
  steps.push(artifactQualityStep);
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
  if (!artifactQualityIsReadyForCleanDayE2e(artifactQualityStep.status)) {
    steps.push(
      blockedCleanDayE2eStep(
        "artifact-quality failed; no current-date artifact was written",
      ),
    );
  } else if (shouldRunCleanDayE2e()) {
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
    historicalReuseProvenance: historicalReuse?.provenance ?? null,
  });

  if (
    executionRequest.mode === "historical-reuse" &&
    report.qualityGates.historicalReuseEvaluationPassed
  ) {
    console.log(
      "Historical reader summary reuse verified as non-live; production blocking remains false",
    );
    return;
  }
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
  readonly historicalReuseProvenance: HistoricalReuseProvenance | null;
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

function isolateCaptureArtifacts(): void {
  rmSync(nextEvidencePath, { force: true });
  rmSync(nextFrontendFixturePath, { force: true });
  rmSync(nextRuntimeIdentityPath, { force: true });
  if (!reuseExistingArtifacts) {
    rmSync(evidencePath, { force: true });
    rmSync(frontendFixturePath, { force: true });
    rmSync(runtimeIdentityPath, { force: true });
  }
}

function removeAllLiveCaptureArtifacts(): void {
  for (const path of [
    nextEvidencePath,
    nextFrontendFixturePath,
    evidencePath,
    frontendFixturePath,
    nextRuntimeIdentityPath,
    runtimeIdentityPath,
  ]) {
    rmSync(path, { force: true });
  }
}

async function bindAndPromoteFreshCapture(params: {
  readonly executionId: string;
  readonly startedAt: Date;
}): Promise<ProductionDayCaptureExecution> {
  if (!runtimeLiveIdentityProofRequired(executionRequest.mode)) {
    throw new Error(
      "Historical artifact reuse cannot create live runtime proof",
    );
  }
  const runtimeHealth = await readActualRuntimeHealth();
  writeFileSync(
    nextRuntimeIdentityPath,
    serializeProductionRuntimeLiveIdentity({
      schemaVersion: 1,
      format: "reader-summary-runtime-live-identity-v1",
      checkedAt: runtimeHealth.checkedAt,
      status: "serving",
      runtimeEngine: "subscription-runtime-cli",
      runtimePackageVersion: runtimeHealth.runtimeVersion,
      launcherSha256: runtimeHealth.launcherSha256,
    }),
  );
  const capture = {
    executionId: params.executionId,
    startedAt: params.startedAt.toISOString(),
    completedAt: new Date().toISOString(),
  };
  const candidates = readRequiredFreshCaptureCandidates({
    evidencePath: nextEvidencePath,
    frontendPath: nextFrontendFixturePath,
    capture,
  });
  const attestedEvidence = attachCaptureExecutionEvidence({
    evidence: candidates.evidence,
    frontendArtifact: candidates.frontendArtifact,
    frontendBytes: candidates.frontendBytes,
    capture,
    runtimeHealth,
  });
  const evidenceBytes = Buffer.from(
    `${JSON.stringify(attestedEvidence, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(nextEvidencePath, evidenceBytes);
  const inspection = inspectDurableEvidenceArtifact({
    evidence: attestedEvidence,
    evidenceBytes,
    frontendArtifact: candidates.frontendArtifact,
    frontendBytes: candidates.frontendBytes,
    expectedDate: collectionDate,
    expectedCapture: capture,
  });
  if (inspection.binding === null) {
    throw new Error(inspection.violations.join("; "));
  }
  renameSync(nextEvidencePath, evidencePath);
  renameSync(nextFrontendFixturePath, frontendFixturePath);
  renameSync(nextRuntimeIdentityPath, runtimeIdentityPath);
  return capture;
}

async function readActualRuntimeHealth(): Promise<ProductionDayRuntimeHealth> {
  const address = process.env.AGENT_RUNTIME_GRPC_ADDRESS?.trim();
  if (address === undefined || address.length === 0) {
    throw new Error("AGENT_RUNTIME_GRPC_ADDRESS is required for runtime proof");
  }
  const client = GrpcAgentRuntimeClient.connect({
    address,
    clock: new SystemClock(),
    options: {
      timeoutMs: 5_000,
      serviceToken:
        process.env.AGENT_RUNTIME_SERVICE_TOKEN?.trim() || undefined,
    },
  });
  const checkedAt = new Date().toISOString();
  const identity = await probeProductionRuntimeLiveIdentity({
    client,
    checkedAt,
  });
  return {
    status: identity.status,
    runtimeEngine: identity.runtimeEngine,
    runtimeVersion: identity.runtimePackageVersion,
    launcherSha256: identity.launcherSha256,
    checkedAt,
  };
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
  const artifactExists =
    existsSync(evidencePath) && existsSync(frontendFixturePath);

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
  readonly historicalReuseProvenance: HistoricalReuseProvenance | null;
}): ProductionDayReport {
  const collectionQuality = readJsonIfExists<ProductionDayCollectionQuality>(
    "ops/evals/yesterday-social-collection-quality-report.v1.json",
  );
  const evidenceArtifact = params.includeSummaryEvidence
    ? readEvidenceArtifact()
    : { evidence: null, binding: null };

  return buildProductionDayReport({
    executionMode: executionRequest.mode,
    historicalReuseProvenance: params.historicalReuseProvenance,
    collectionDate,
    evidencePath,
    frontendFixturePath,
    startedAt: params.startedAt,
    completedAt: params.completedAt,
    steps: params.steps,
    scope: params.scope,
    collectionQuality,
    durableEvidence:
      evidenceArtifact.evidence as ProductionDayDurableEvidence | null,
    evidenceBinding: evidenceArtifact.binding,
    liveCaptureExecution,
    allowDegraded,
    allowHistorical,
    failure: params.failure,
  });
}

function readEvidenceArtifact(): {
  readonly evidence: unknown;
  readonly binding: DurableEvidenceBinding | null;
} {
  if (!existsSync(evidencePath) || !existsSync(frontendFixturePath)) {
    return { evidence: null, binding: null };
  }
  const bytes = readFileSync(evidencePath);
  const frontendBytes = readFileSync(frontendFixturePath);
  const evidence = JSON.parse(bytes.toString("utf8")) as unknown;
  const frontendArtifact = JSON.parse(
    frontendBytes.toString("utf8"),
  ) as unknown;
  const inspection = inspectDurableEvidenceArtifact({
    evidence,
    evidenceBytes: bytes,
    frontendArtifact,
    frontendBytes,
    expectedDate: collectionDate,
    ...(liveCaptureExecution === null
      ? {}
      : { expectedCapture: liveCaptureExecution }),
  });
  if (inspection.violations.length > 0) {
    console.error(
      `Durable evidence binding failed: ${inspection.violations.join("; ")}`,
    );
  }
  return { evidence, binding: inspection.binding };
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

function resolveSummaryModel():
  "agent-runtime" | "openai-responses" | "deterministic" {
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

function resolveTopicLabeler(): "agent-runtime" | "deterministic" {
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

  const report = readJsonIfExists<unknown>(outputPath);
  if (
    !isRecord(report) ||
    !isRecord(report.inputs) ||
    typeof report.requestedDate !== "string" ||
    typeof report.inputs.evidencePath !== "string" ||
    !existsSync(report.inputs.evidencePath) ||
    typeof report.inputs.frontendFixturePath !== "string" ||
    !existsSync(report.inputs.frontendFixturePath)
  ) {
    throw new Error(`${outputPath} is missing`);
  }
  const evidenceBytes = readFileSync(report.inputs.evidencePath);
  const frontendBytes = readFileSync(report.inputs.frontendFixturePath);
  const evidence = JSON.parse(evidenceBytes.toString("utf8")) as unknown;
  const frontendArtifact = JSON.parse(
    frontendBytes.toString("utf8"),
  ) as unknown;
  const inspection = inspectDurableEvidenceArtifact({
    evidence,
    evidenceBytes,
    frontendArtifact,
    frontendBytes,
    expectedDate: report.requestedDate,
  });
  const violations =
    inspection.binding === null
      ? inspection.violations
      : validateLiveProductionDayReport({
          report,
          binding: inspection.binding,
          expectedDate: report.requestedDate,
        });
  const valid = violations.length === 0 && noRawSecretFragments(report);

  if (!valid) {
    throw new Error(`${outputPath} failed validation`);
  }

  printStats(report as ProductionDayReport);
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
