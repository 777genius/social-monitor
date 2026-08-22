import { defaultPostgresRuntimePoolConfig } from "@social-monitor/platform-persistence";
import { PrismaSummaryConnection } from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-connection";
import type { ReaderSummaryTimestampPolicy } from "@social-monitor/summary/ports";

import { captureReaderSummaryDayDatasetManifest } from "./lib/reader-summary-day-dataset-manifest";
import { loadDotenvIfPresent } from "./lib/env-file";
import {
  historicalDegradedRecoveryEvidencePath,
  installHistoricalDegradedRecoveryEvidence,
} from "./lib/reader-summary-historical-degraded-recovery-authority";
import { readProductionDayScope } from "./lib/reader-summary-production-day-scope";
import {
  nextDate,
  readOption,
  yesterdaySocialQualityDatabaseUrl,
} from "./lib/yesterday-social-replay-support";

if (require.main === module) {
  loadDotenvIfPresent(".env");
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Manifest capture failed");
    process.exitCode = 1;
  });
}

async function main(): Promise<void> {
  assertCaptureReaderSummaryDatasetManifestArguments(process.argv.slice(2));
  const date = requiredOption("--date");
  const timestampPolicy = recoveryTimestampPolicy();
  const outputPath = historicalDegradedRecoveryEvidencePath(
    date,
    "dataset-manifest",
  );
  const startedAt = exactDate(`${date}T00:00:00.000Z`, "--date");
  const endedAt = exactDate(nextDate(date), "--date");
  const databaseUrl = yesterdaySocialQualityDatabaseUrl();
  const scope = await readProductionDayScope({
    connectionString: databaseUrl,
    periodStartedAt: startedAt.toISOString(),
    periodEndedAt: endedAt.toISOString(),
    collectionDate: date,
  });
  const connection = await PrismaSummaryConnection.create(
    defaultPostgresRuntimePoolConfig(databaseUrl, "daily-runner"),
  );
  try {
    const manifest = await captureReaderSummaryDayDatasetManifest({
      client: connection,
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      startedAt,
      endedAt,
      generatedAt: new Date(),
      timestampPolicy,
    });
    const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    const outcome = installHistoricalDegradedRecoveryEvidence({
      requestedUtcDate: date,
      artifact: "dataset-manifest",
      bytes,
    });
    console.log(
      `Dataset manifest ${outcome}: rows=${manifest.dataset.feedRowCount} digest=${manifest.dataset.aggregateSha256}`,
    );
    console.log(
      `artifact_path=${outputPath}`,
    );
  } finally {
    await connection.close();
  }
}

export function assertCaptureReaderSummaryDatasetManifestArguments(
  args: readonly string[],
): void {
  const allowed = new Set(["--date", "--recovery-timestamp-policy"]);
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    if (
      option === undefined ||
      !allowed.has(option) ||
      value === undefined ||
      value.startsWith("--") ||
      args.indexOf(option) !== index
    ) {
      throw new Error(
        "Only --date and --recovery-timestamp-policy may be supplied exactly once",
      );
    }
  }
}

function recoveryTimestampPolicy(): ReaderSummaryTimestampPolicy {
  const value = readOption("--recovery-timestamp-policy") ?? "published_at";
  if (value !== "published_at" && value !== "observed_at") {
    throw new Error(
      "--recovery-timestamp-policy must be published_at or observed_at",
    );
  }
  return value;
}

function requiredOption(name: string): string {
  const value = readOption(name)?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function exactDate(value: string, label: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    throw new Error(`${label} must identify one exact UTC date`);
  }
  return date;
}
