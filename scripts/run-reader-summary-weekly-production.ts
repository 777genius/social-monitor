import { resolve } from "node:path";

import { GrpcAgentRuntimeClient } from "@social-monitor/summary/adapters/model/grpc-agent-runtime-client";
import { SystemClock } from "@social-monitor/shared-kernel";
import { Pool } from "pg";

import { loadDotenvIfPresent } from "./lib/env-file";
import {
  AgentRuntimeReaderSummaryWeeklyTextModel,
  runReaderSummaryWeeklyProduction,
} from "./lib/reader-summary-weekly-production-runner";
import {
  assertReaderSummaryWeeklyProductionPostgresContract,
  loadReaderSummaryWeeklyProductionDbState,
  previousCompletedReaderSummaryWeeklyProductionWindow,
  resolveReaderSummaryWeeklyProductionWindow,
  type ReaderSummaryWeeklyProductionScope,
} from "./lib/reader-summary-weekly-production-postgres-contract";

loadDotenvIfPresent(".env");

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const pool = new Pool({
    connectionString: requireEnv("DATABASE_URL"),
    min: 0,
    max: 1,
    connectionTimeoutMillis: 5_000,
  });
  try {
    await assertReaderSummaryWeeklyProductionPostgresContract(pool);
    const window =
      options.weekStartedOn === undefined
        ? previousCompletedReaderSummaryWeeklyProductionWindow(new Date())
        : resolveReaderSummaryWeeklyProductionWindow(options.weekStartedOn);
    const dbState = await loadReaderSummaryWeeklyProductionDbState(
      pool,
      readScope(),
      window,
    );
    const model = new AgentRuntimeReaderSummaryWeeklyTextModel({
      client: GrpcAgentRuntimeClient.connect({
        address: requireEnv("AGENT_RUNTIME_GRPC_ADDRESS"),
        clock: new SystemClock(),
        options: {
          timeoutMs: options.modelTimeoutMs,
          serviceToken: process.env.AGENT_RUNTIME_SERVICE_TOKEN,
        },
      }),
      provider: "codex",
      model: "gpt-5.5",
      reasoningEffort: "xhigh",
      timeoutMs: options.modelTimeoutMs,
    });
    const result = await runReaderSummaryWeeklyProduction({
      dbState,
      outputDirectory: options.outputDirectory,
      model,
      replay: options.replay,
      generatedAt: new Date(),
    });
    printResult(result);
    if (result.status !== "complete") {
      process.exitCode = result.status === "unavailable" ? 78 : 75;
    }
  } finally {
    await pool.end().catch(() => undefined);
  }
}

type CliOptions = Readonly<{
  weekStartedOn?: string;
  outputDirectory: string;
  replay: boolean;
  modelTimeoutMs: number;
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
    } else {
      throw new Error(`Unknown reader summary weekly production option: ${arg}`);
    }
  }
  return Object.freeze({
    ...(weekStartedOn === undefined ? {} : { weekStartedOn }),
    outputDirectory: resolve(outputDirectory),
    replay,
    modelTimeoutMs,
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
      `model_call=${result.modelCallPerformed ? "true" : "false"}`,
      `write=${result.writePerformed ? "true" : "false"}`,
      `replay=${result.replayed ? "true" : "false"}`,
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
