import { resolve } from "node:path";

import { defaultPostgresRuntimePoolConfig } from
  "@social-monitor/platform-persistence";
import { PrismaSummaryConnection } from
  "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-connection";

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
import {
  ReaderSummaryPromotionV2HistoricalPreparation,
  writeHistoricalPromotionPreparation,
} from "./lib/reader-summary-promotion-v2-historical-preparation";
import { PostgresHistoricalPromotionPreparationReader } from
  "./lib/reader-summary-promotion-v2-historical-preparation-postgres";
import { readerSummaryProductionDayScope } from
  "./lib/reader-summary-production-day-scope";
import { assertClosedUtcDate } from
  "./lib/reader-summary-promotion-v2-historical-classification";
import { requiredHistoricalPromotionSystemDatabaseUrl } from
  "./lib/reader-summary-promotion-v2-system-database";

export type HistoricalPromotionCliOptions = Readonly<{
  dates: readonly string[];
  batchSize: number;
  dryRun: boolean;
  prepare: boolean;
  resume: boolean;
  artifactOutput: string;
  artifactManifest?: string;
  timestampPolicy: "published_at" | "observed_at";
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
  if (options.prepare) {
    await prepareHistoricalPromotionEvidence(options, now);
    return;
  }
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
  const siteUrl = options.dryRun
    ? readEnv("READER_SUMMARY_PROMOTION_REBUILD_SITE_URL") ??
      "http://127.0.0.1"
    : requiredEnv("READER_SUMMARY_PROMOTION_REBUILD_SITE_URL");
  assertHttpUrl(siteUrl);
  const postgres = new PostgresHistoricalPromotionAdapter({
    databaseUrl: requiredHistoricalPromotionSystemDatabaseUrl(process.env),
    tenantId: readerSummaryProductionDayScope.tenantId,
    workspaceId: readerSummaryProductionDayScope.workspaceId,
    artifactOutput: options.artifactOutput,
    api: new HttpHistoricalPromotionApiVisibilityVerifier({
      baseUrl: apiBaseUrl,
      siteUrl,
      siteContractUrl: readEnv(
        "READER_SUMMARY_PROMOTION_REBUILD_SITE_CONTRACT_URL",
      ),
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
    canonicalDailyRunLockPath: options.dryRun
      ? "/tmp/reader-summary-dry-run-unused.lock"
      : requiredAbsoluteEnv(
          "READER_SUMMARY_PROMOTION_REBUILD_CANONICAL_DAILY_LOCK_PATH",
        ),
    canonicalDateLockDirectory: options.dryRun
      ? "/tmp/reader-summary-dry-run-unused-date-locks"
      : requiredAbsoluteEnv(
          "READER_SUMMARY_PROMOTION_REBUILD_CANONICAL_DATE_LOCK_DIR",
        ),
    canonicalFenceDirectory: options.dryRun
      ? "/tmp/reader-summary-dry-run-unused-date-fences"
      : requiredAbsoluteEnv(
          "READER_SUMMARY_PROMOTION_REBUILD_CANONICAL_FENCE_DIR",
        ),
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

const prepareHistoricalPromotionEvidence = async (
  options: HistoricalPromotionCliOptions,
  now: Date,
): Promise<void> => {
  if (options.artifactManifest !== undefined) {
    throw new Error("--prepare creates the artifact manifest; do not supply one");
  }
  const databaseUrl = requiredHistoricalPromotionSystemDatabaseUrl(process.env);
  const postgres = new PostgresHistoricalPromotionAdapter({
    databaseUrl,
    tenantId: readerSummaryProductionDayScope.tenantId,
    workspaceId: readerSummaryProductionDayScope.workspaceId,
    artifactOutput: options.artifactOutput,
    api: { verify: async () => ({
      siteReaderRouteHttp200Verified: true,
      siteFacingContractVerified: "not-exposed",
    }) },
  });
  const connection = await PrismaSummaryConnection.create(
    defaultPostgresRuntimePoolConfig(databaseUrl, "daily-runner"),
  );
  try {
    const preparation = new ReaderSummaryPromotionV2HistoricalPreparation({
      authority: postgres,
      preparation: new PostgresHistoricalPromotionPreparationReader(
        connection,
        readerSummaryProductionDayScope,
      ),
      clock: () => now,
    });
    const results = await preparation.prepare({
      dates: options.dates,
      batchSize: options.batchSize,
      timestampPolicy: options.timestampPolicy,
    });
    const paths = writeHistoricalPromotionPreparation({
      outputDirectory: options.artifactOutput,
      generatedAt: now.toISOString(),
      results,
    });
    console.log(`historical_promotion_preparation=${paths.receiptPath}`);
    console.log(`historical_promotion_manifest=${paths.manifestPath}`);
    for (const result of results) {
      console.log(
        `date=${result.date} preparation=${result.status} reason=${result.reason}`,
      );
    }
    if (results.some((result) =>
      result.status !== "prepared" && result.status !== "verified-noop")) {
      process.exitCode = 2;
    }
  } finally {
    await Promise.all([postgres.close(), connection.close()]);
  }
};

export const parseHistoricalPromotionCliOptions = (
  args: readonly string[],
): HistoricalPromotionCliOptions => {
  const flags = new Set(["--dry-run", "--execute", "--prepare", "--resume"]);
  const valued = new Set([
    "--dates",
    "--batch-size",
    "--artifact-output",
    "--artifact-manifest",
    "--timestamp-policy",
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
  const modes = ["--dry-run", "--execute", "--prepare"].filter((flag) =>
    seenFlags.has(flag));
  if (modes.length > 1) {
    throw new Error("--dry-run, --execute and --prepare are mutually exclusive");
  }
  const dates = requiredValue(values, "--dates")
    .split(",")
    .map((date) => date.trim())
    .filter((date) => date.length > 0);
  const batchSize = Number(values.get("--batch-size") ?? "2");
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 2) {
    throw new Error("--batch-size must be 1 or 2");
  }
  const timestampPolicy = values.get("--timestamp-policy") ?? "published_at";
  if (timestampPolicy !== "published_at" && timestampPolicy !== "observed_at") {
    throw new Error("--timestamp-policy must be published_at or observed_at");
  }
  if (!seenFlags.has("--prepare") && values.has("--timestamp-policy")) {
    throw new Error("--timestamp-policy is restricted to --prepare");
  }
  return {
    dates,
    batchSize,
    dryRun: !seenFlags.has("--execute"),
    prepare: seenFlags.has("--prepare"),
    resume: seenFlags.has("--resume"),
    artifactOutput: resolve(requiredValue(values, "--artifact-output")),
    timestampPolicy,
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
