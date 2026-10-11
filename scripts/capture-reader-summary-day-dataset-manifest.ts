import { installSecureRecoveryEvidenceFile, resolveRecoveryEvidencePath } from "./lib/reader-summary-recovery-evidence-secure-file";
import { captureFirstPublicationInventory, firstPublicationBytesSha256 } from "./lib/reader-summary-first-publication-inventory";
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
  const firstPublication = readOption("--first-publication-inventory") === "true";
  const inventoryRelativePath = "reader-summary/historical-first-publication/2026-09-29/inventory-manifest.json";
  const outputPath = firstPublication ? resolveRecoveryEvidencePath(inventoryRelativePath)
    : historicalDegradedRecoveryEvidencePath(date, "dataset-manifest");
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
    const input = { client: connection, tenantId: scope.tenantId, workspaceId: scope.workspaceId,
      startedAt, endedAt, generatedAt: new Date(), timestampPolicy };
    const output = firstPublication ? await captureFirstPublicationInventory(input)
      : await captureReaderSummaryDayDatasetManifest(input);
    const manifest = "datasetManifest" in output ? output.datasetManifest : output;
    const bytes = Buffer.from(`${JSON.stringify(output, null, 2)}\n`, "utf8");
    const outcome = firstPublication ? installSecureRecoveryEvidenceFile({ relativePath: inventoryRelativePath,
      label: "historical first publication inventory", bytes }) : installHistoricalDegradedRecoveryEvidence({
      requestedUtcDate: date,
      artifact: "dataset-manifest",
      bytes,
    });
    console.log(
      `Dataset manifest ${outcome}: rows=${manifest.dataset.feedRowCount} digest=${manifest.dataset.aggregateSha256}`,
    );
    console.log(`artifact_path=${outputPath}`);
    if (firstPublication) console.log(`manifest_file_sha256=${firstPublicationBytesSha256(bytes)} asof=${manifest.generatedAt} provider_coverage=UNPROVEN`);
  } finally {
    await connection.close();
  }
}

export function assertCaptureReaderSummaryDatasetManifestArguments(
  args: readonly string[],
): void {
  const inventoryFlag = args.indexOf("--first-publication-inventory");
  if (inventoryFlag !== -1 && (args[inventoryFlag + 1] !== "true" ||
      args[args.indexOf("--date") + 1] !== "2026-09-29" ||
      (args.includes("--recovery-timestamp-policy") && args[args.indexOf("--recovery-timestamp-policy") + 1] !== "published_at"))) {
    throw new Error("First publication inventory is bounded to Sep29 published_at");
  }
  const allowed = new Set(["--date", "--recovery-timestamp-policy", "--first-publication-inventory"]);
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
