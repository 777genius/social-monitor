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
import { loadHistoricalRegeneration } from "./lib/reader-summary-production-day-regeneration";
import { buildProductionDayTerminalOutcome } from "./lib/reader-summary-production-day-outcome";
import {
  resolveProductionDayProviderReadiness,
  type ProductionDayDatabaseQualityReport,
  type ProductionDayProviderReadiness,
} from "./lib/reader-summary-production-day-provider-readiness";
import { productionDayQualityDateArgs } from "./lib/reader-summary-production-day-quality-date";
import { resolveProductionDayCollectionDate } from "./lib/reader-summary-production-day-date";
import { collectionQualityRegenerationFreshnessArgs } from "./lib/yesterday-social-collection-quality-regeneration";
import type { CleanRealDayCollectionReport } from "./lib/clean-real-day-collection-report";
import { readerSummaryProductionHistoryScope } from "./lib/reader-summary-daily-maintenance-scope";
import { productionHistoryCollection } from "./lib/reader-summary-production-history-collection";
import { type YesterdaySocialProviderReadiness } from "./lib/yesterday-social-collection-quality";
import { readProductionDayScope } from "./lib/reader-summary-production-day-scope";
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
let executionRequest: ReturnType<typeof resolveProductionDayExecutionRequest>;
let reuseExistingArtifacts: boolean;
let skipLiveCollection: boolean;
let allowDegraded: boolean;
let allowHistorical: boolean;
let allowHistoricalProviderCollection: boolean;
let qualityDateArgs: readonly string[];
let collectionDate: string;
let summaryModel: ReturnType<typeof resolveSummaryModel>;
let topicLabeler: ReturnType<typeof resolveTopicLabeler>;
let periodStartedAt: string;
let periodEndedAt: string;
let runtimeArtifactDirectory: string;
let evidencePath: string;
let frontendFixturePath: string;
let nextEvidencePath: string;
let nextFrontendFixturePath: string;
let runtimeIdentityPath: string;
let nextRuntimeIdentityPath: string;
let datedOutputPath: string;
let terminalOutcomePath: string;
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
  const migrationStep = runNpm("migrate", ["run", "migrate:deploy"]);
  if (migrationStep.status !== "passed") {
    throw new Error(
      `Required database migration failed before production-day admission ` +
        `(exit=${migrationStep.exitCode ?? "unknown"})`,
    );
  }
  steps.push(migrationStep);
  initializeProductionDayRuntime();
  if (summaryModel !== "agent-runtime") {
    throw new Error(
      "Production reader summaries must use subscription runtime (agent-runtime)",
    );
  }
  if (topicLabeler !== "agent-runtime") {
    throw new Error(
      "Production reader summary topics must use subscription runtime (agent-runtime)",
    );
  }
  const historicalReuse =
    executionRequest.mode === "historical-reuse"
      ? loadHistoricalReuseProvenance({
          request: executionRequest,
          evidencePath,
          frontendFixturePath,
          collectionDate,
        })
      : null;
  const scope = await readProductionDayScope({
    connectionString: yesterdaySocialQualityDatabaseUrl(),
    periodStartedAt,
    periodEndedAt,
    collectionDate,
  });
  const historicalRegeneration =
    executionRequest.mode === "historical-regeneration"
      ? loadHistoricalRegeneration({
          request: executionRequest,
          collectionDate,
          githubOmissionReason:
            process.env
              .DURABLE_READER_SUMMARY_HISTORICAL_GITHUB_OMISSION_REASON,
          recoveryRoot:
            process.env.READER_SUMMARY_PRODUCTION_DAY_RECOVERY_DIR ??
            `/var/lib/social-monitor/artifacts/recovery/${collectionDate}`,
          forbiddenOutputPaths: [
            outputPath,
            datedOutputPath,
            evidencePath,
            frontendFixturePath,
            runtimeIdentityPath,
            resolve(
              "ops/evals/yesterday-social-collection-quality-report.v1.json",
            ),
          ],
          tenantId: scope.tenantId,
          workspaceId: scope.workspaceId,
          now: new Date(),
        })
      : null;
  const historicalCollection = allowHistoricalProviderCollection
    ? productionHistoryCollection({
        directory: process.env.READER_SUMMARY_PRODUCTION_HISTORY_COLLECTION_DIR,
        collectionDate,
      })
    : null;
  if (
    historicalCollection !== null &&
    (scope.tenantId !== readerSummaryProductionHistoryScope.tenantId ||
      scope.workspaceId !== readerSummaryProductionHistoryScope.workspaceId)
  ) {
    throw new Error("Production history collection scope is not 6101/6102");
  }

  const collectionStep: StepReport = historicalRegeneration
    ? historicalRegeneration.verifiedCollectionStep
    : skipLiveCollection
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
          "--provider-catch-up",
          ...(allowHistoricalProviderCollection
            ? [
                "--allow-historical-provider-collection",
                ...(historicalCollection?.arguments ?? []),
              ]
            : []),
          ...(allowHistorical ? [] : ["--wait-for-x-readiness"]),
        ]);
  steps.push(collectionStep);

  mkdirSync(runtimeArtifactDirectory, { recursive: true });
  isolateCaptureArtifacts();

  let collectionQualityStep = runNpm("collection-quality", [
    "run",
    "check:yesterday-social-collection-quality",
    "--",
    "--update",
    "--date",
    collectionDate,
    "--write-failed-report",
    ...(historicalRegeneration
      ? collectionQualityRegenerationFreshnessArgs({
          manifestPath:
            executionRequest.mode === "historical-regeneration"
              ? executionRequest.datasetManifestPath
              : "",
          manifestSha256:
            executionRequest.mode === "historical-regeneration"
              ? executionRequest.datasetManifestSha256
              : "",
          tenantId: scope.tenantId,
          workspaceId: scope.workspaceId,
          timestampPolicy:
            executionRequest.mode === "historical-regeneration"
              ? executionRequest.timestampPolicy
              : "published_at",
        })
      : []),
    ...(allowHistorical ? ["--allow-historical"] : []),
  ]);
  const collectionQualityReport =
    readJsonIfExists<ProductionDayDatabaseQualityReport>(
      "ops/evals/yesterday-social-collection-quality-report.v1.json",
    );
  const collectionReport = readJsonIfExists<CleanRealDayCollectionReport>(
    historicalCollection?.path ??
      "ops/evals/reader-summary-clean-real-day-collection.v1.json",
  );
  const providerAdmission =
    executionRequest.mode === "live-production"
      ? resolveProductionDayProviderReadiness({
          collectionDate,
          evaluatedAt: new Date(),
          qualityReport: collectionQualityReport,
          collectionReport,
        })
      : null;
  const providerReadiness = providerAdmission?.readiness ?? null;
  const requiredProvidersReady =
    providerAdmission?.summaryPolicy === "allowed" ||
    executionRequest.mode !== "live-production";
  if (
    executionRequest.mode === "live-production" &&
    providerAdmission?.status !== "complete"
  ) {
    collectionQualityStep = {
      ...collectionQualityStep,
      command:
        `${collectionQualityStep.command} -- ` +
        (providerAdmission?.barrierMessage ??
          `verified provider outcome=${providerAdmission?.status ?? "missing"}`),
      status: "failed",
      exitCode: 1,
    };
  }
  steps.push(collectionQualityStep);
  if (
    providerAdmission?.status === "partial" ||
    providerAdmission?.status === "unavailable"
  ) {
    const safeMessage =
      `Production provider evidence for ${collectionDate} is ` +
      `${providerAdmission.status}; AI summary and publication were not started`;
    steps.push(...blockedProductionDaySteps(safeMessage));
    persistProductionDayReport({
      startedAt,
      completedAt: new Date(),
      steps,
      scope,
      providerReadiness,
      includeSummaryEvidence: false,
      failure: {
        code: "collection_quality_failed",
        safeMessage,
      },
      historicalReuseProvenance: historicalReuse?.provenance ?? null,
      historicalRegenerationProvenance:
        historicalRegeneration?.provenance ?? null,
    });
    persistTerminalOutcome(providerAdmission);
    return;
  }
  if (
    !collectionIsReadyForProductionSummary({
      liveCollection: !skipLiveCollection,
      collectionStepStatus: collectionStep.status,
      collectionQualityStepStatus: collectionQualityStep.status,
      requiredProvidersReady,
    })
  ) {
    const safeMessage =
      providerReadiness?.barrierMessage === null || providerReadiness === null
        ? "Production collection quality failed; AI summary and publication were not started"
        : `${providerReadiness.barrierMessage}; AI summary and publication were not started. Retry not before ${providerReadiness.retrySchedule?.notBefore ?? "the next scheduled run"}; completed providers will not be recollected`;
    steps.push(...blockedProductionDaySteps(safeMessage));
    persistProductionDayReport({
      startedAt,
      completedAt: new Date(),
      steps,
      scope,
      providerReadiness,
      includeSummaryEvidence: false,
      failure: {
        code: "collection_quality_failed",
        safeMessage,
      },
      historicalReuseProvenance: historicalReuse?.provenance ?? null,
      historicalRegenerationProvenance:
        historicalRegeneration?.provenance ?? null,
    });
    throw new Error(safeMessage);
  }

  const captureExecutionId = randomUUID();
  const captureStartedAt = new Date();
  let summaryStep = reuseExistingArtifacts
    ? existingSummaryArtifactStep()
    : runNpm(
        "durable-reader-summary",
        [
          "run",
          "capture:durable-reader-summary",
          ...(executionRequest.mode === "historical-regeneration"
            ? [
                "--",
                "--historical-recovery",
                ...(executionRequest.allowHistoricalGitHubOmission
                  ? ["--allow-historical-github-omission"]
                  : []),
              ]
            : []),
        ],
        {
          DATABASE_URL: yesterdaySocialQualityDatabaseUrl(),
          DURABLE_READER_SUMMARY_MODEL: summaryModel,
          AGENT_RUNTIME_READER_SUMMARY_MODEL: "gpt-5.6-sol",
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
          ...(executionRequest.mode === "historical-regeneration"
            ? {
                DURABLE_READER_SUMMARY_DATASET_MANIFEST_PATH:
                  executionRequest.datasetManifestPath,
                DURABLE_READER_SUMMARY_DATASET_MANIFEST_SHA256:
                  executionRequest.datasetManifestSha256,
                DURABLE_READER_SUMMARY_RECOVERY_ROOT:
                  process.env.READER_SUMMARY_PRODUCTION_DAY_RECOVERY_DIR ??
                  `/var/lib/social-monitor/artifacts/recovery/${collectionDate}`,
                DURABLE_READER_SUMMARY_RECOVERY_TIMESTAMP_POLICY:
                  executionRequest.timestampPolicy,
              }
            : {}),
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
    ...qualityDateArgs,
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
      ...qualityDateArgs,
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
        ...qualityDateArgs,
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
    providerReadiness,
    includeSummaryEvidence: true,
    failure: null,
    historicalReuseProvenance: historicalReuse?.provenance ?? null,
    historicalRegenerationProvenance:
      historicalRegeneration?.provenance ?? null,
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

function initializeProductionDayRuntime(): void {
  executionRequest = resolveProductionDayExecutionRequest(
    process.argv.slice(2),
  );
  reuseExistingArtifacts = executionRequest.mode === "historical-reuse";
  skipLiveCollection = executionRequest.mode !== "live-production";
  allowDegraded = process.argv.includes("--allow-degraded");
  allowHistorical = process.argv.includes("--allow-historical");
  allowHistoricalProviderCollection =
    allowHistorical && executionRequest.mode === "live-production";
  qualityDateArgs = productionDayQualityDateArgs({
    executionMode: executionRequest.mode,
    allowHistorical,
  });
  collectionDate = resolveProductionDayCollectionDate(process.argv.slice(2));
  summaryModel = resolveSummaryModel();
  topicLabeler = resolveTopicLabeler();
  periodStartedAt = `${collectionDate}T00:00:00.000Z`;
  periodEndedAt = nextDate(collectionDate);
  runtimeArtifactDirectory = resolve(
    process.env.READER_SUMMARY_PRODUCTION_DAY_ARTIFACT_DIR ??
      join(
        tmpdir(),
        "social-monitor",
        "reader-summary-production-day",
        collectionDate,
      ),
  );
  evidencePath = join(
    runtimeArtifactDirectory,
    `durable-reader-summary-${collectionDate}.v1.json`,
  );
  frontendFixturePath = join(
    runtimeArtifactDirectory,
    `frontend-reader-summary-${collectionDate}.fixture.v1.json`,
  );
  nextEvidencePath = evidencePath.replace(/\.json$/u, ".next.json");
  nextFrontendFixturePath = frontendFixturePath.replace(
    /\.json$/u,
    ".next.json",
  );
  runtimeIdentityPath = join(
    runtimeArtifactDirectory,
    `runtime-live-identity-${collectionDate}.v1.json`,
  );
  nextRuntimeIdentityPath = runtimeIdentityPath.replace(
    /\.json$/u,
    ".next.json",
  );
  datedOutputPath = `ops/evals/reader-summary-production-day-run.${collectionDate}.v1.json`;
  terminalOutcomePath = `ops/evals/reader-summary-production-day-outcome.${collectionDate}.v1.json`;
}

function persistTerminalOutcome(
  providerReadiness: ProductionDayProviderReadiness,
): void {
  const outcome = buildProductionDayTerminalOutcome({
    generatedAt: new Date(),
    providerReadiness,
  });
  if (!noRawSecretFragments(outcome)) {
    throw new Error("Terminal provider outcome contains a secret fragment");
  }
  mkdirSync(dirname(terminalOutcomePath), { recursive: true });
  writeFileSync(terminalOutcomePath, `${JSON.stringify(outcome, null, 2)}\n`);
  console.log(`Updated ${terminalOutcomePath}`);
}

function persistProductionDayReport(params: {
  readonly startedAt: Date;
  readonly completedAt: Date;
  readonly steps: readonly StepReport[];
  readonly scope: { readonly tenantId: string; readonly workspaceId: string };
  readonly providerReadiness: YesterdaySocialProviderReadiness | null;
  readonly includeSummaryEvidence: boolean;
  readonly failure: ProductionDayReport["failure"];
  readonly historicalReuseProvenance: HistoricalReuseProvenance | null;
  readonly historicalRegenerationProvenance: Parameters<
    typeof buildProductionDayReport
  >[0]["historicalRegenerationProvenance"];
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
  if (
    reuseExistingArtifacts ||
    executionRequest.mode === "historical-regeneration"
  ) {
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
  readonly providerReadiness: YesterdaySocialProviderReadiness | null;
  readonly includeSummaryEvidence: boolean;
  readonly failure: ProductionDayReport["failure"];
  readonly historicalReuseProvenance: HistoricalReuseProvenance | null;
  readonly historicalRegenerationProvenance: Parameters<
    typeof buildProductionDayReport
  >[0]["historicalRegenerationProvenance"];
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
    historicalRegenerationProvenance: params.historicalRegenerationProvenance,
    collectionDate,
    evidencePath,
    frontendFixturePath,
    startedAt: params.startedAt,
    completedAt: params.completedAt,
    steps: params.steps,
    scope: params.scope,
    providerReadiness: params.providerReadiness,
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
