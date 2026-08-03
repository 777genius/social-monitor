import { resolve } from "node:path";

import { GrpcAgentRuntimeClient } from "@social-monitor/summary/adapters/model/grpc-agent-runtime-client";
import { SystemClock } from "@social-monitor/shared-kernel";
import {
  defaultPostgresRuntimePoolConfig,
  runWithTenantDatabaseAccess,
} from "@social-monitor/platform-persistence";
import { Pool } from "pg";

import { PrismaReaderSummaryWeeklyCertificationSealAuthority } from "../libs/summary/adapters/persistence/prisma/prisma-reader-summary-weekly-certification-seal-authority";
import { PrismaReaderSummaryWeeklyReviewManifest } from "../libs/summary/adapters/persistence/prisma/prisma-reader-summary-weekly-review-manifest";
import { PrismaReaderSummaryWeeklyStoryAuthority } from "../libs/summary/adapters/persistence/prisma/prisma-reader-summary-weekly-story-authority";
import { PrismaReaderSummaryArtifactRepository } from "../libs/summary/adapters/persistence/prisma/prisma-reader-summary-artifact.repository";
import { PrismaSummaryConnection } from "../libs/summary/adapters/persistence/prisma/prisma-summary-connection";
import { PublishReaderSummaryWeeklyCertifiedArtifactUseCase } from "../libs/summary/features/publish-reader-summary-weekly-certified-artifact/publish-reader-summary-weekly-certified-artifact.use-case";
import type { ReaderSummaryWeeklyModelPort } from "../libs/summary/ports/reader-summary-weekly-model.port";
import type { AgentRuntimeClientPort } from "../libs/summary/ports/agent-runtime-client.port";
import type { ReaderSummaryWeeklyReviewManifestPort } from "../libs/summary/ports/reader-summary-weekly-review-manifest.port";

import { loadDotenvIfPresent } from "./lib/env-file";
import {
  AgentRuntimeReaderSummaryWeeklyTextModel,
  buildModelInputFromDbState,
  runReaderSummaryWeeklyProduction,
  type ReaderSummaryWeeklyProductionPublisher,
} from "./lib/reader-summary-weekly-production-runner";
import { admitReaderSummaryWeeklyReviewManifest } from "./lib/reader-summary-weekly-review-admission";
import {
  acquireReaderSummaryWeeklyExecutionReceipt,
  claimReaderSummaryWeeklyExecutionReceiptPair,
  completeReaderSummaryWeeklyExecutionReceipt,
  failReaderSummaryWeeklyExecutionReceiptAfterDurableOutput,
  failReaderSummaryWeeklyExecutionReceiptBeforeDurableOutput,
  reconcileReaderSummaryWeeklyExecutionReceiptPublication,
  releaseReaderSummaryWeeklyExecutionReceiptPair,
  ReaderSummaryWeeklySubscriptionRuntimeFailureError,
  terminalizeReaderSummaryWeeklyExecutionReceiptStaleModelFence,
  type ReaderSummaryWeeklyExecutionReceipt,
  type ReaderSummaryWeeklyExecutionReceiptPair,
} from "./lib/reader-summary-weekly-execution-receipt";
import {
  assertReaderSummaryWeeklyProductionPostgresContract,
  loadReaderSummaryWeeklyProductionDbState,
  previousCompletedReaderSummaryWeeklyProductionWindow,
  resolveCompletedReaderSummaryWeeklyProductionWindow,
  withReaderSummaryWeeklyProductionDatabaseAccess,
  type ReaderSummaryWeeklyProductionScope,
  type ReaderSummaryWeeklyProductionWindow,
} from "./lib/reader-summary-weekly-production-postgres-contract";
import { loadReaderSummaryWeeklyScheduleObservations } from "./lib/reader-summary-weekly-schedule-postgres";
import {
  ReaderSummaryWeeklyScheduledExecutionError,
  runReaderSummaryWeeklyProductionSchedule,
  type ReaderSummaryWeeklyScheduledFailure,
  type ReaderSummaryWeeklyScheduledSlotOutcome,
} from "./lib/reader-summary-weekly-production-scheduler";

loadDotenvIfPresent(".env");

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const databaseUrl = requireEnv("DATABASE_URL");
  const pool = new Pool({
    connectionString: databaseUrl,
    min: 0,
    max: 1,
    connectionTimeoutMillis: 5_000,
  });
  const scope = readScope();
  const now = new Date();
  const connection = await PrismaSummaryConnection.create(
    defaultPostgresRuntimePoolConfig(databaseUrl, "daily-runner"),
  );
  const reviewManifestStore: ReaderSummaryWeeklyReviewManifestPort =
    new PrismaReaderSummaryWeeklyReviewManifest(connection);
  if (options.replay) {
    try {
      const window = options.weekStartedOn === undefined
        ? previousCompletedReaderSummaryWeeklyProductionWindow(now)
        : resolveCompletedReaderSummaryWeeklyProductionWindow(
            options.weekStartedOn,
            now,
          );
      const outcome = await executeWindow({
        pool,
        scope,
        window,
        options,
        model: replayModel,
        publisher: replayPublisher,
        manifestStore: reviewManifestStore,
        attemptNumber: 1,
      });
      if (outcome.status !== "completed") process.exitCode = 75;
    } finally {
      await connection.close().catch(() => undefined);
      await pool.end().catch(() => undefined);
    }
    return;
  }
  try {
    const repository = new PrismaReaderSummaryArtifactRepository(connection);
    const publisherUseCase = new PublishReaderSummaryWeeklyCertifiedArtifactUseCase(
      new PrismaReaderSummaryWeeklyCertificationSealAuthority(connection),
      new PrismaReaderSummaryWeeklyStoryAuthority(connection),
      repository,
    );
    const agentRuntime = lazyAgentRuntime(options.modelTimeoutMs);
    const model = new AgentRuntimeReaderSummaryWeeklyTextModel({
      client: agentRuntime,
      provider: "codex",
      model: "gpt-5.6-sol",
      reasoningEffort: "xhigh",
      timeoutMs: options.modelTimeoutMs,
    });
    const publisher: ReaderSummaryWeeklyProductionPublisher = {
      publish: async (command) => {
        const published = await publisherUseCase.execute(command);
        if (!published.ok) throw published.error;
        return published.value;
      },
    };
    if (options.weekStartedOn !== undefined) {
      const window = resolveCompletedReaderSummaryWeeklyProductionWindow(
        options.weekStartedOn,
        now,
      );
      const outcome = await executeWindow({
        pool,
        scope,
        window,
        options,
        model,
        publisher,
        manifestStore: reviewManifestStore,
        reviewAgentRuntime: agentRuntime,
        attemptNumber: 1,
      });
      if (outcome.status !== "completed") process.exitCode = 75;
      return;
    }
    const observedSlots = await weeklyDatabaseOperation(pool, scope, (client) =>
      loadReaderSummaryWeeklyScheduleObservations(
        client,
        scope,
        options.firstWeekStartedOn,
        now,
      ),
    );
    const schedule = await runReaderSummaryWeeklyProductionSchedule({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      firstWeekStartedUtcDate: options.firstWeekStartedOn,
      now,
      catchUpLimit: options.catchUpLimit,
      observedSlots,
      execute: async (slot, attemptNumber) => executeWindow({
          pool,
          scope,
          window: resolveCompletedReaderSummaryWeeklyProductionWindow(
            slot.weekStartedUtcDate,
            now,
          ),
          options,
          model,
          publisher,
          manifestStore: reviewManifestStore,
          reviewAgentRuntime: agentRuntime,
          attemptNumber,
        }),
      wait: waitForRetry,
    });
    console.log(
      `schedule_planned=${schedule.planned} completed=${schedule.completed} terminal=${schedule.terminal} deferred=${schedule.deferred}`,
    );
    for (const diagnostic of schedule.terminalDiagnostics) {
      console.log(
        `terminal_slot=${diagnostic.slotIdentity} category=${diagnostic.category} retryable=${diagnostic.retryable} code=${diagnostic.code} cause=${diagnostic.cause} final_retry=${diagnostic.finalRetryDecision}`,
      );
    }
    if (schedule.terminal > 0) process.exitCode = 75;
  } finally {
    await connection.close().catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
}

const replayModel: ReaderSummaryWeeklyModelPort = Object.freeze({
  generate: async () => {
    throw new Error("Reader summary weekly replay attempted a model call");
  },
});

const replayPublisher: ReaderSummaryWeeklyProductionPublisher = Object.freeze({
  publish: async () => {
    throw new Error("Reader summary weekly replay attempted a provider write");
  },
});

const lazyAgentRuntime = (
  timeoutMs: number,
): AgentRuntimeClientPort => {
  let client: GrpcAgentRuntimeClient | undefined;
  const resolve = (): GrpcAgentRuntimeClient => {
    client ??= GrpcAgentRuntimeClient.connect({
      address: requireEnv("AGENT_RUNTIME_GRPC_ADDRESS"),
      clock: new SystemClock(),
      options: {
        timeoutMs,
        serviceToken: process.env.AGENT_RUNTIME_SERVICE_TOKEN,
      },
    });
    return client;
  };
  return Object.freeze({
    runTask: (command: Parameters<AgentRuntimeClientPort["runTask"]>[0]) =>
      resolve().runTask(command),
    checkHealth: (service: Parameters<AgentRuntimeClientPort["checkHealth"]>[0]) =>
      resolve().checkHealth(service),
  });
};

const completedOutcome: ReaderSummaryWeeklyScheduledSlotOutcome = Object.freeze({
  status: "completed",
});

const recoveryOnlyModel: ReaderSummaryWeeklyModelPort = Object.freeze({
  generate: async () => {
    throw new ReaderSummaryWeeklyScheduledExecutionError(
      "Reader summary weekly running receipt has no durable artifact pair",
      receiptFailure(
        "schema",
        "receipt_running_without_durable_pair",
        "receipt_fence",
      ),
    );
  },
});

const executeWindow = async (params: Readonly<{
  pool: Pool;
  scope: ReaderSummaryWeeklyProductionScope;
  window: ReaderSummaryWeeklyProductionWindow;
  options: CliOptions;
  model: ReaderSummaryWeeklyModelPort;
  publisher: ReaderSummaryWeeklyProductionPublisher;
  manifestStore: ReaderSummaryWeeklyReviewManifestPort;
  reviewAgentRuntime?: AgentRuntimeClientPort;
  attemptNumber: number;
}>): Promise<ReaderSummaryWeeklyScheduledSlotOutcome> => {
  let receipt: ReaderSummaryWeeklyExecutionReceipt | undefined;
  let durablePair: ReaderSummaryWeeklyExecutionReceiptPair | undefined;
  let publishingReceipt: ReaderSummaryWeeklyExecutionReceipt | undefined;
  let completionAttempted = false;
  try {
    const dbState = await weeklyDatabaseOperation(
      params.pool,
      params.scope,
      async (client) => {
        await assertReaderSummaryWeeklyProductionPostgresContract(client);
        return loadReaderSummaryWeeklyProductionDbState(
          client,
          params.scope,
          params.window,
        );
      },
    );
    if (dbState.status !== "complete") {
      const result = await runWithTenantDatabaseAccess(params.scope, () =>
        runReaderSummaryWeeklyProduction({
          dbState,
          reviewManifest: null,
          outputDirectory: params.options.outputDirectory,
          model: params.model,
          replay: params.options.replay,
          generatedAt: new Date(),
        }),
      );
      printResult(result);
      return result.status === "complete"
        ? completedOutcome
        : terminalOutcome("schema", "certification_state_incomplete", "database_authority");
    }
    const reviewAdmission = await runWithTenantDatabaseAccess(params.scope, () =>
      admitReaderSummaryWeeklyReviewManifest({
        dbState,
        replay: params.options.replay,
        manifestStore: params.manifestStore,
        ...(params.reviewAgentRuntime === undefined
          ? {}
          : { agentRuntime: params.reviewAgentRuntime }),
      }),
    );
    if (reviewAdmission.status === "partial") {
      const result = await runWithTenantDatabaseAccess(params.scope, () =>
        runReaderSummaryWeeklyProduction({
          dbState,
          reviewManifest: null,
          outputDirectory: params.options.outputDirectory,
          model: params.model,
          replay: params.options.replay,
          generatedAt: new Date(),
        }),
      );
      printResult(result);
      for (const reason of reviewAdmission.reasons) {
        console.log(`blocking_reason=${reason}`);
      }
      return terminalOutcome("schema", "review_manifest_admission_failed", "review_authority");
    }
    const inputAdmission = buildModelInputFromDbState(
      dbState,
      reviewAdmission.manifest,
    );
    if (inputAdmission.status === "partial") {
      const result = await runWithTenantDatabaseAccess(params.scope, () =>
        runReaderSummaryWeeklyProduction({
          dbState,
          reviewManifest: reviewAdmission.manifest,
          outputDirectory: params.options.outputDirectory,
          model: params.model,
          replay: params.options.replay,
          generatedAt: new Date(),
        }),
      );
      printResult(result);
      return terminalOutcome("schema", "review_manifest_validation_failed", "review_authority");
    }
    if (params.options.replay) {
      const result = await runWithTenantDatabaseAccess(params.scope, () =>
        runReaderSummaryWeeklyProduction({
          dbState,
          reviewManifest: reviewAdmission.manifest,
          outputDirectory: params.options.outputDirectory,
          model: params.model,
          replay: true,
          generatedAt: new Date(),
        }),
      );
      printResult(result);
      return result.status === "complete"
        ? completedOutcome
        : terminalOutcome("schema", "weekly_artifact_replay_failed", "artifact_proof");
    }
    const seal = dbState.weeklyCertificationSeal;
    const anchorJobId = dbState.certifications[0]?.jobId;
    if (seal === null || anchorJobId === undefined) {
      throw new Error("Reader summary weekly execution authority is incomplete");
    }
    receipt = await weeklyDatabaseOperation(
      params.pool,
      params.scope,
      (client) => acquireReaderSummaryWeeklyExecutionReceipt(client, {
        scope: params.scope,
        window: params.window,
        sealId: seal.sealId,
        sealSha256: seal.sealSha256,
        anchorJobId,
        now: new Date(),
        attemptNumber: params.attemptNumber,
      }),
    );
    if (receipt.state === "completed") {
      console.log(
        `status=completed week=${params.window.weekStartedOn}..${params.window.weekEndedOn} model_call=false write=false`,
      );
      return completedOutcome;
    }
    if (await weeklyDatabaseOperation(params.pool, params.scope, (client) =>
      reconcileReaderSummaryWeeklyExecutionReceiptPublication(client, receipt!, {
        scope: params.scope,
        window: params.window,
      }),
    )) {
      console.log(
        `status=reconciled week=${params.window.weekStartedOn}..${params.window.weekEndedOn} model_call=false write=false`,
      );
      return completedOutcome;
    }
    if (receipt.state === "failed") {
      return terminalOutcome("domain", "receipt_terminal_failure", "receipt_fence");
    }
    const executionModel = receipt.state === "running"
      ? recoveryOnlyModel
      : params.model;
    const result = await runWithTenantDatabaseAccess(params.scope, () =>
      runReaderSummaryWeeklyProduction({
        dbState,
        reviewManifest: reviewAdmission.manifest,
        outputDirectory: params.options.outputDirectory,
        model: executionModel,
        replay: false,
        generatedAt: new Date(),
        publisher: params.publisher,
        onDurableArtifactPair: async (pair) => {
          durablePair = Object.freeze({
            artifactSha256: pair.artifactSha256,
            proofSha256: pair.proofSha256,
          });
          publishingReceipt = await weeklyDatabaseOperation(
            params.pool,
            params.scope,
            (client) => claimReaderSummaryWeeklyExecutionReceiptPair(
              client,
              receipt!,
              { ...durablePair!, now: new Date() },
            ),
          );
        },
      }),
    );
    printResult(result);
    if (result.status !== "complete" || !result.databasePublicationVerified) {
      if (
        receipt.state === "running" &&
        durablePair === undefined &&
        await weeklyDatabaseOperation(params.pool, params.scope, (client) =>
          terminalizeReaderSummaryWeeklyExecutionReceiptStaleModelFence(
            client,
            receipt!,
            new Date(),
          ),
        )
      ) {
        return terminalOutcome("schema", "stale_model_fence", "receipt_fence");
      }
      const failure = receiptFailure(
        "domain",
        "publication_not_verified",
        "database_publication",
      );
      if (publishingReceipt !== undefined) {
        await weeklyDatabaseOperation(params.pool, params.scope, (client) =>
          failReaderSummaryWeeklyExecutionReceiptAfterDurableOutput(
            client,
            publishingReceipt!,
            failure,
          ),
        );
      } else if (receipt.state === "acquired" && durablePair === undefined) {
        await weeklyDatabaseOperation(params.pool, params.scope, (client) =>
          failReaderSummaryWeeklyExecutionReceiptBeforeDurableOutput(
            client,
            receipt!,
            failure,
          ),
        );
      }
      return Object.freeze({ status: "terminal", failure });
    }
    if (publishingReceipt === undefined) {
      throw new Error("Reader summary weekly publication lacks a durable pair fence");
    }
    completionAttempted = true;
    await weeklyDatabaseOperation(params.pool, params.scope, (client) =>
      completeReaderSummaryWeeklyExecutionReceipt(client, publishingReceipt!),
    );
    return completedOutcome;
  } catch (error: unknown) {
    if (error instanceof ReaderSummaryWeeklyScheduledExecutionError) {
      if (
        receipt?.state === "running" &&
        error.failure.code === "receipt_running_without_durable_pair" &&
        await weeklyDatabaseOperation(params.pool, params.scope, (client) =>
          terminalizeReaderSummaryWeeklyExecutionReceiptStaleModelFence(
            client,
            receipt!,
            new Date(),
          ),
        )
      ) {
        return terminalOutcome("schema", "stale_model_fence", "receipt_fence");
      }
      if (receipt !== undefined) {
        throw new ReaderSummaryWeeklyScheduledExecutionError(
          error.message,
          error.failure,
          receipt.attemptNumber,
        );
      }
      throw error;
    }
    if (error instanceof ReaderSummaryWeeklySubscriptionRuntimeFailureError) {
      const failure = receiptFailure(
        "infrastructure",
        safeDiagnosticToken(error.failure.code, "agent_runtime_failure"),
        safeDiagnosticToken(error.failure.causeCategory, "agent_runtime"),
        error.failure.retryable,
      );
      if (receipt?.state === "acquired" && durablePair === undefined) {
        await weeklyDatabaseOperation(params.pool, params.scope, (client) =>
          failReaderSummaryWeeklyExecutionReceiptBeforeDurableOutput(
            client,
            receipt!,
            {
              ...failure,
              retryable:
                error.failure.retryable && receipt!.attemptNumber < 3,
            },
          ),
        );
      }
      throw new ReaderSummaryWeeklyScheduledExecutionError(
        error.message,
        failure,
        receipt?.attemptNumber,
      );
    }
    if (durablePair !== undefined) {
      const retryable =
        publishingReceipt !== undefined &&
        !completionAttempted &&
        publishingReceipt.attemptNumber < 3 &&
        isRetryableExactPairPublicationError(error);
      const failure = receiptFailure(
        "infrastructure",
        safeDiagnosticToken(errorCode(error), "publication_failure"),
        "database_publication",
        retryable,
      );
      if (publishingReceipt !== undefined && !completionAttempted) {
        await weeklyDatabaseOperation(params.pool, params.scope, (client) =>
          retryable
            ? releaseReaderSummaryWeeklyExecutionReceiptPair(
                client,
                publishingReceipt!,
              )
            : failReaderSummaryWeeklyExecutionReceiptAfterDurableOutput(
                client,
                publishingReceipt!,
                failure,
              ),
        );
      }
      throw new ReaderSummaryWeeklyScheduledExecutionError(
        error instanceof Error
          ? error.message
          : "Reader summary weekly durable publication failed",
        failure,
        publishingReceipt?.attemptNumber ?? receipt?.attemptNumber,
      );
    }
    if (receipt?.state === "acquired") {
      await weeklyDatabaseOperation(params.pool, params.scope, (client) =>
        failReaderSummaryWeeklyExecutionReceiptBeforeDurableOutput(
          client,
          receipt!,
          receiptFailure("domain", "pre_durable_output_failure", "execution"),
        ),
      );
    }
    if (
      receipt?.state === "running" &&
      await weeklyDatabaseOperation(params.pool, params.scope, (client) =>
        terminalizeReaderSummaryWeeklyExecutionReceiptStaleModelFence(
          client,
          receipt!,
          new Date(),
        ),
      )
    ) {
      return terminalOutcome("schema", "stale_model_fence", "receipt_fence");
    }
    throw new ReaderSummaryWeeklyScheduledExecutionError(
      error instanceof Error
        ? error.message
        : "Reader summary weekly execution failed",
      receiptFailure(
        receipt === undefined ? "infrastructure" : "domain",
        safeDiagnosticToken(errorCode(error), "execution_failure"),
        receipt === undefined ? "pre_receipt" : "execution",
        receipt === undefined && isRetryablePreReceiptInfrastructureError(error),
      ),
      receipt?.attemptNumber,
    );
  }
};

const weeklyDatabaseOperation = <T>(
  pool: Pool,
  scope: ReaderSummaryWeeklyProductionScope,
  operation: Parameters<
    typeof withReaderSummaryWeeklyProductionDatabaseAccess<T>
  >[2],
): Promise<T> => withReaderSummaryWeeklyProductionDatabaseAccess(
  pool,
  {
    kind: "tenant",
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
  },
  operation,
);

const terminalOutcome = (
  category: ReaderSummaryWeeklyScheduledFailure["category"],
  code: string,
  cause: string,
): ReaderSummaryWeeklyScheduledSlotOutcome =>
  Object.freeze({ status: "terminal", failure: receiptFailure(category, code, cause) });

const receiptFailure = (
  category: ReaderSummaryWeeklyScheduledFailure["category"],
  code: string,
  cause: string,
  retryable = false,
): ReaderSummaryWeeklyScheduledFailure => Object.freeze({
  category,
  retryable,
  code: safeDiagnosticToken(code, "execution_failure"),
  cause: safeDiagnosticToken(cause, "execution"),
});

const isRetryablePreReceiptInfrastructureError = (error: unknown): boolean => {
  const code = errorCode(error);
  return code.startsWith("08") || [
    "40001",
    "40P01",
    "57P01",
    "ECONNREFUSED",
    "ECONNRESET",
    "ETIMEDOUT",
  ].includes(code);
};

const isRetryableExactPairPublicationError = (error: unknown): boolean => {
  const code = errorCode(error).toLowerCase();
  const text = error instanceof Error
    ? `${code}:${error.message}`.toLowerCase()
    : code;
  return ![
    "authorization.denied",
    "resource.not_found",
    "validation.failed",
  ].includes(code) && !/(ambigu|fenc|identity|hash|consum|complet)/u.test(text);
};

const errorCode = (error: unknown): string =>
  typeof error === "object" && error !== null && "code" in error
    ? String((error as Readonly<{ code?: unknown }>).code ?? "")
    : "";

const safeDiagnosticToken = (value: string, fallback: string): string =>
  /^[A-Za-z0-9._:-]{1,128}$/u.test(value) ? value : fallback;

const waitForRetry = (milliseconds: number): Promise<void> =>
  new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));

type CliOptions = Readonly<{
  weekStartedOn?: string;
  outputDirectory: string;
  replay: boolean;
  modelTimeoutMs: number;
  firstWeekStartedOn: string;
  catchUpLimit: number;
}>;

function parseArgs(args: readonly string[]): CliOptions {
  let weekStartedOn: string | undefined;
  let outputDirectory =
    process.env.READER_SUMMARY_WEEKLY_PRODUCTION_ARTIFACT_DIR ??
    "/var/lib/social-monitor/artifacts/reader-summary-weekly-production";
  let replay = false;
  let modelTimeoutMs = parsePositiveInt(
    process.env.READER_SUMMARY_WEEKLY_PRODUCTION_MODEL_TIMEOUT_MS,
    "READER_SUMMARY_WEEKLY_PRODUCTION_MODEL_TIMEOUT_MS",
    600_000,
  );
  let firstWeekStartedOn =
    process.env.READER_SUMMARY_WEEKLY_PRODUCTION_FIRST_WEEK_START ??
    previousCompletedReaderSummaryWeeklyProductionWindow(new Date())
      .weekStartedOn;
  let catchUpLimit = parsePositiveInt(
    process.env.READER_SUMMARY_WEEKLY_PRODUCTION_CATCH_UP_LIMIT,
    "READER_SUMMARY_WEEKLY_PRODUCTION_CATCH_UP_LIMIT",
    4,
  );

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--replay") {
      replay = true;
    } else if (arg === "--week-start") {
      weekStartedOn = readArgValue(args, ++index, arg);
    } else if (arg === "--output-dir") {
      outputDirectory = readArgValue(args, ++index, arg);
    } else if (arg === "--model-timeout-ms") {
      modelTimeoutMs = parsePositiveInt(
        readArgValue(args, ++index, arg),
        arg,
        modelTimeoutMs,
      );
    } else if (arg === "--first-week-start") {
      firstWeekStartedOn = readArgValue(args, ++index, arg);
    } else if (arg === "--catch-up-limit") {
      catchUpLimit = parsePositiveInt(
        readArgValue(args, ++index, arg),
        arg,
        catchUpLimit,
      );
    } else {
      throw new Error(`Unknown reader summary weekly production option: ${arg}`);
    }
  }
  return Object.freeze({
    ...(weekStartedOn === undefined ? {} : { weekStartedOn }),
    outputDirectory: resolve(outputDirectory),
    replay,
    modelTimeoutMs,
    firstWeekStartedOn,
    catchUpLimit,
  });
}

function readScope(): ReaderSummaryWeeklyProductionScope {
  const tenantId = requireEnv("READER_SUMMARY_WEEKLY_PRODUCTION_TENANT_ID");
  const workspaceId = requireEnv("READER_SUMMARY_WEEKLY_PRODUCTION_WORKSPACE_ID");
  const interestId =
    process.env.READER_SUMMARY_WEEKLY_PRODUCTION_INTEREST_ID?.trim();
  return Object.freeze({
    tenantId,
    workspaceId,
    scope:
      interestId === undefined || interestId.length === 0
        ? Object.freeze({ type: "workspace" as const })
        : Object.freeze({ type: "interest" as const, interestId }),
  });
}

function printResult(
  result: Awaited<ReturnType<typeof runReaderSummaryWeeklyProduction>>,
): void {
  console.log(
    [
      `status=${result.status}`,
      `week=${result.weekStartedOn}..${result.weekEndedOn}`,
      `artifact=${result.artifactPath ?? "none"}`,
      `proof=${result.proofPath ?? "none"}`,
      `replay_canary=${result.replayCanaryPath ?? "none"}`,
      `model_call=${result.modelCallPerformed ? "true" : "false"}`,
      `write=${result.writePerformed ? "true" : "false"}`,
      `replay_canary_write=${
        result.replayCanaryWritePerformed ? "true" : "false"
      }`,
      `replay=${result.replayed ? "true" : "false"}`,
      `db_publication_verified=${
        result.databasePublicationVerified ? "true" : "false"
      }`,
    ].join(" "),
  );
  for (const reason of result.blockingReasons) {
    console.log(`blocking_reason=${reason}`);
  }
}

function readArgValue(
  args: readonly string[],
  index: number,
  flag: string,
): string {
  const value = args[index];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function parsePositiveInt(
  value: string | undefined,
  label: string,
  fallback: number,
): number {
  if (value === undefined || value.trim().length === 0) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}
