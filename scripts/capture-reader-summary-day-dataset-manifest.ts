import { chmodSync, writeFileSync } from "node:fs";

import { defaultPostgresRuntimePoolConfig } from "@social-monitor/platform-persistence";
import { PrismaSummaryConnection } from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-connection";

import { captureReaderSummaryDayDatasetManifest } from "./lib/reader-summary-day-dataset-manifest";
import { loadDotenvIfPresent } from "./lib/env-file";
import { assertRecoveryOutputPath } from "./lib/reader-summary-recovery-files";
import { readProductionDayScope } from "./lib/reader-summary-production-day-scope";
import {
  nextDate,
  readOption,
  yesterdaySocialQualityDatabaseUrl,
} from "./lib/yesterday-social-replay-support";

loadDotenvIfPresent(".env");

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Manifest capture failed");
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const date = requiredOption("--date");
  const recoveryRoot = requiredOption("--recovery-root");
  const outputPath = assertRecoveryOutputPath({
    recoveryRoot,
    outputPath: requiredOption("--out"),
  });
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
    });
    writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o400,
    });
    chmodSync(outputPath, 0o400);
    console.log(
      `Dataset manifest captured: rows=${manifest.dataset.feedRowCount} digest=${manifest.dataset.aggregateSha256}`,
    );
  } finally {
    await connection.close();
  }
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
