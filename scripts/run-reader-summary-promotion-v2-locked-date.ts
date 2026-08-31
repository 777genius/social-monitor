import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { defaultPostgresRuntimePoolConfig } from
  "@social-monitor/platform-persistence";
import { PrismaSummaryConnection } from
  "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-connection";

import { loadDotenvIfPresent } from "./lib/env-file";
import {
  ReaderSummaryDayDatasetGuard,
  readReaderSummaryDayDatasetManifest,
} from "./lib/reader-summary-day-dataset-guard";
import { parseReaderSummaryDayDatasetManifest } from
  "./lib/reader-summary-day-dataset-manifest";
import { resolveProductionDayPromotionRebuild } from
  "./lib/reader-summary-production-day-promotion-rebuild";
import { readerSummaryProductionDayScope } from
  "./lib/reader-summary-production-day-scope";
import {
  assertHistoricalPromotionInputCurrentBeforeMutation,
  historicalPromotionRevalidationFailurePathEnv,
} from "./lib/reader-summary-promotion-v2-input-guard";
import { yesterdaySocialQualityDatabaseUrl } from
  "./lib/yesterday-social-replay-support";

const datasetManifestPathEnv = "DURABLE_READER_SUMMARY_DATASET_MANIFEST_PATH";
const datasetManifestSha256Env =
  "DURABLE_READER_SUMMARY_DATASET_MANIFEST_SHA256";

if (require.main === module) {
  loadDotenvIfPresent(".env");
  void main().catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : "Historical promotion locked preflight failed",
    );
    process.exitCode = 1;
  });
}

export const runHistoricalPromotionLockedPreflight = async (input: {
  readonly revalidate: () => Promise<void>;
  readonly runProductionDay: () => number | null;
}): Promise<number | null> => {
  await input.revalidate();
  return input.runProductionDay();
};

export const historicalPromotionLockedChildCommand = (
  args: readonly string[],
): readonly string[] => args[0] === "--" ? args.slice(1) : args;

async function main(): Promise<void> {
  // ts-node consumes its `--` separator; direct Node execution retains it.
  const command = historicalPromotionLockedChildCommand(process.argv.slice(2));
  if (command.length === 0) {
    throw new Error("Locked historical promotion command is required");
  }
  const manifestPath = requiredEnv(datasetManifestPathEnv);
  const manifestBytes = readFileSync(manifestPath);
  const parsed = parseReaderSummaryDayDatasetManifest(manifestBytes);
  const date = parsed.period.startedAt.slice(0, 10);
  const promotion = resolveProductionDayPromotionRebuild({
    env: process.env,
    recoveryActive: true,
    date,
  });
  if (promotion === undefined) {
    throw new Error("Locked historical promotion authority is required");
  }
  const now = new Date();
  const { manifest, fileSha256 } = readReaderSummaryDayDatasetManifest({
    path: manifestPath,
    expectedFileSha256: requiredEnv(datasetManifestSha256Env),
    tenantId: readerSummaryProductionDayScope.tenantId,
    workspaceId: readerSummaryProductionDayScope.workspaceId,
    startedAt: new Date(parsed.period.startedAt),
    endedAt: new Date(parsed.period.endedAt),
    now,
    expectedTimestampPolicy: parsed.policy.timestampPolicy,
  });
  const connection = await PrismaSummaryConnection.create(
    defaultPostgresRuntimePoolConfig(
      yesterdaySocialQualityDatabaseUrl(),
      "daily-runner",
    ),
  );
  let status: number | null;
  try {
    const guard = new ReaderSummaryDayDatasetGuard(
      connection,
      manifest,
      fileSha256,
      () => new Date(),
    );
    status = await runHistoricalPromotionLockedPreflight({
      revalidate: () => assertHistoricalPromotionInputCurrentBeforeMutation({
        datasetGuard: guard,
        client: connection,
        tenantId: readerSummaryProductionDayScope.tenantId,
        workspaceId: readerSummaryProductionDayScope.workspaceId,
        date,
        sourcePublication: {
          publicationId: promotion.sourcePublicationId,
          artifactId: promotion.sourceArtifactId,
          reportSha256: promotion.sourcePublicationReportSha256,
          proofSha256: promotion.sourcePublicationProofSha256,
        },
        failureMarkerPath: requiredEnv(
          historicalPromotionRevalidationFailurePathEnv,
        ),
      }),
      runProductionDay: () => spawnSync(command[0]!, command.slice(1), {
        cwd: process.cwd(),
        env: process.env,
        stdio: "inherit",
      }).status,
    });
  } finally {
    await connection.close();
  }
  if (status !== 0) process.exitCode = status ?? 1;
}

const requiredEnv = (name: string): string => {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
};
