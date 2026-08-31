import { resolve } from "node:path";

import { loadDotenvIfPresent } from "./lib/env-file";
import {
  FileHistoricalPromotionReceiptStore,
  assertHistoricalPromotionOutputIsolation,
  loadHistoricalPromotionEvidenceManifest,
} from "./lib/reader-summary-promotion-v2-historical-files";
import {
  HttpHistoricalPromotionApiVisibilityVerifier,
  PostgresHistoricalPromotionAdapter,
} from "./lib/reader-summary-promotion-v2-historical-postgres";
import { ReaderSummaryPromotionV2HistoricalRunner } from
  "./lib/reader-summary-promotion-v2-historical-runner";
import { ProductionDayHistoricalPromotionMutation } from
  "./lib/reader-summary-promotion-v2-historical-subprocess";
import { readerSummaryProductionDayScope } from
  "./lib/reader-summary-production-day-scope";
import { assertClosedUtcDate } from
  "./lib/reader-summary-promotion-v2-historical-classification";
import { yesterdaySocialQualityDatabaseUrl } from
  "./lib/yesterday-social-replay-support";

export type HistoricalPromotionCliOptions = Readonly<{
  dates: readonly string[];
  batchSize: number;
  dryRun: boolean;
  resume: boolean;
  artifactOutput: string;
  artifactManifest?: string;
}>;

if (require.main === module) {
  loadDotenvIfPresent(".env");
  void main().catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : "Historical promotion rebuild failed",
    );
    process.exitCode = 1;
  });
}

async function main(): Promise<void> {
  const options = parseHistoricalPromotionCliOptions(process.argv.slice(2));
  const now = new Date();
  options.dates.forEach((date) => assertClosedUtcDate(date, now));
  const loadedEvidence = options.artifactManifest === undefined
    ? {
        bundles: new Map<string, never>(),
        problems: new Map<string, string>(),
        inputPaths: [] as readonly string[],
      }
    : loadHistoricalPromotionEvidenceManifest({
        path: options.artifactManifest,
        dates: options.dates,
      });
  if (!options.dryRun && options.artifactManifest === undefined) {
    throw new Error("--artifact-manifest is required with --execute");
  }
  assertHistoricalPromotionOutputIsolation({
    outputDirectory: options.artifactOutput,
    manifestPath: options.artifactManifest,
    bundles: loadedEvidence.bundles,
    inputPaths: loadedEvidence.inputPaths,
  });
  const apiBaseUrl = options.dryRun
    ? readEnv("READER_SUMMARY_PROMOTION_REBUILD_API_BASE_URL") ??
      "http://127.0.0.1"
    : requiredEnv("READER_SUMMARY_PROMOTION_REBUILD_API_BASE_URL");
  assertHttpUrl(apiBaseUrl);
  const postgres = new PostgresHistoricalPromotionAdapter({
    databaseUrl: yesterdaySocialQualityDatabaseUrl(),
    tenantId: readerSummaryProductionDayScope.tenantId,
    workspaceId: readerSummaryProductionDayScope.workspaceId,
    api: new HttpHistoricalPromotionApiVisibilityVerifier({
      baseUrl: apiBaseUrl,
      apiKey: readEnv("READER_SUMMARY_PROMOTION_REBUILD_API_KEY"),
    }),
  });
  const receipts = new FileHistoricalPromotionReceiptStore(
    options.artifactOutput,
  );
  const mutation = new ProductionDayHistoricalPromotionMutation({
    artifactOutput: options.artifactOutput,
    dailyRunLockPath: options.dryRun
      ? "/tmp/reader-summary-dry-run-unused.lock"
      : requiredAbsoluteEnv("READER_SUMMARY_PROMOTION_REBUILD_DAILY_LOCK_PATH"),
    dateLockDirectory: options.dryRun
      ? "/tmp/reader-summary-dry-run-unused-date-locks"
      : requiredAbsoluteEnv("READER_SUMMARY_PROMOTION_REBUILD_DATE_LOCK_DIR"),
    fenceDirectory: options.dryRun
      ? "/tmp/reader-summary-dry-run-unused-date-fences"
      : requiredAbsoluteEnv("READER_SUMMARY_PROMOTION_REBUILD_FENCE_DIR"),
    lockWaitSeconds: integerEnv(
      "READER_SUMMARY_PROMOTION_REBUILD_LOCK_WAIT_SECONDS",
      7500,
    ),
    durableState: postgres,
    verifier: postgres,
    environment: process.env,
  });
  const runner = new ReaderSummaryPromotionV2HistoricalRunner({
    authority: postgres,
    durableState: postgres,
    mutation,
    receipts,
    clock: () => new Date(),
  });
  try {
    const outcomes = await runner.run({
      dates: options.dates,
      batchSize: options.batchSize,
      dryRun: options.dryRun,
      resume: options.resume,
      now,
      evidence: loadedEvidence.bundles,
      evidenceProblems: loadedEvidence.problems,
    });
    const path = receipts.saveRunReceipt({
      generatedAt: new Date().toISOString(),
      dryRun: options.dryRun,
      requestedDates: options.dates,
      receipts: outcomes,
    });
    console.log(`historical_promotion_receipt=${path}`);
    for (const outcome of outcomes) {
      console.log(
        `date=${outcome.date} classification=${outcome.classification?.kind ?? "unavailable"} status=${outcome.status} reason=${outcome.reason}`,
      );
    }
    if (!options.dryRun && outcomes.some((outcome) =>
      outcome.status === "pending" || outcome.status === "unrebuildable")) {
      process.exitCode = 2;
    }
  } finally {
    await postgres.close();
  }
}

export const parseHistoricalPromotionCliOptions = (
  args: readonly string[],
): HistoricalPromotionCliOptions => {
  const flags = new Set(["--dry-run", "--execute", "--resume"]);
  const valued = new Set([
    "--dates",
    "--batch-size",
    "--artifact-output",
    "--artifact-manifest",
  ]);
  const values = new Map<string, string>();
  const seenFlags = new Set<string>();
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index]!;
    if (flags.has(option)) {
      if (seenFlags.has(option)) throw new Error(`${option} may appear once`);
      seenFlags.add(option);
      continue;
    }
    if (!valued.has(option) || values.has(option)) {
      throw new Error(`Unknown or duplicate option ${option}`);
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`${option} requires a value`);
    }
    values.set(option, value);
    index += 1;
  }
  if (seenFlags.has("--dry-run") && seenFlags.has("--execute")) {
    throw new Error("--dry-run and --execute are mutually exclusive");
  }
  const dates = requiredValue(values, "--dates")
    .split(",")
    .map((date) => date.trim())
    .filter((date) => date.length > 0);
  const batchSize = Number(values.get("--batch-size") ?? "2");
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 2) {
    throw new Error("--batch-size must be 1 or 2");
  }
  return {
    dates,
    batchSize,
    dryRun: !seenFlags.has("--execute"),
    resume: seenFlags.has("--resume"),
    artifactOutput: resolve(requiredValue(values, "--artifact-output")),
    ...(values.get("--artifact-manifest") === undefined
      ? {}
      : { artifactManifest: resolve(values.get("--artifact-manifest")!) }),
  };
};

const requiredValue = (values: ReadonlyMap<string, string>, name: string): string => {
  const value = values.get(name)?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
};

const requiredAbsoluteEnv = (name: string): string => {
  const value = requiredEnv(name);
  if (!value.startsWith("/")) throw new Error(`${name} must be absolute`);
  return resolve(value);
};

const requiredEnv = (name: string): string => {
  const value = readEnv(name);
  if (value === undefined) throw new Error(`${name} is required`);
  return value;
};

const readEnv = (name: string): string | undefined => {
  const value = process.env[name]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
};

const integerEnv = (name: string, fallback: number): number => {
  const raw = readEnv(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 20_000) {
    throw new Error(`${name} must be an integer between 0 and 20000`);
  }
  return value;
};

const assertHttpUrl = (value: string): void => {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Promotion rebuild API base URL must use HTTP(S)");
  }
};
