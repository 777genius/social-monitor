import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { Pool } from "pg";

import { readerSummaryArtifactFromPrisma } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-records";
import {
  evaluateReaderSummaryMultiDayQuality,
  isReaderFacingQualityTopRead,
  type ReaderSummaryMultiDayActualDay,
  type ReaderSummaryMultiDayGenerationProfile,
  type ReaderSummaryMultiDayGoldDay,
  type ReaderSummaryMultiDayQualityThresholds,
} from "@social-monitor/summary/domain";

import {
  isLocalDataSourceUnavailable,
  readDominantReaderSummaryQualityScope,
  readLatestReaderSummaryArtifact,
} from "./lib/reader-summary-quality-eval-support";
import {
  message,
  noRawSecretFragments,
  normalizeLineEndings,
  yesterdaySocialQualityDatabaseUrl,
} from "./lib/yesterday-social-replay-support";

type GoldFile = {
  readonly schemaVersion: 1;
  readonly artifactFormat: "reader-summary-multi-day-quality-gold-v1";
  readonly thresholds: ReaderSummaryMultiDayQualityThresholds;
  readonly generationProfile: ReaderSummaryMultiDayGenerationProfile;
  readonly days: readonly ReaderSummaryMultiDayGoldDay[];
};

const outputPath = "ops/evals/reader-summary-multi-day-quality-report.v1.json";
const goldPath = "ops/evals/reader-summary-multi-day-quality-gold.v1.json";
const update = process.argv.includes("--update");
const artifactOnly = process.argv.includes("--artifact-only");
const allowDegraded = process.argv.includes("--allow-degraded");

void main();

async function main(): Promise<void> {
  if (artifactOnly) {
    validateExistingReport();
    return;
  }
  const gold = readGold();
  const actualDays = await tryReadActualDays(gold.days);
  if (actualDays === undefined) {
    validateExistingReport();
    return;
  }
  const evaluation = evaluateReaderSummaryMultiDayQuality({
    actualDays,
    goldDays: gold.days,
    thresholds: gold.thresholds,
    expectedGenerationProfile: gold.generationProfile,
  });
  const reportWithoutSecretGate = {
    schemaVersion: 1,
    artifactFormat: "reader-summary-multi-day-quality-report-v1",
    generatedBy: "npm run check:reader-summary-multi-day-quality",
    model: {
      liveNetwork: false,
      persistedArtifacts: true,
      rawPostTextPersistedInReport: false,
      rawProviderPayloadPersistedInReport: false,
    },
    inputs: {
      database: "local-postgres",
      goldPath,
      collectionDates: gold.days.map((day) => day.collectionDate),
    },
    thresholds: gold.thresholds,
    ...evaluation,
    qualityGates: {
      ...evaluation.qualityGates,
      noRawSecretFragments: true,
    },
    blockingPassed: false,
  } as const;
  const qualityGates = {
    ...reportWithoutSecretGate.qualityGates,
    noRawSecretFragments: noRawSecretFragments(reportWithoutSecretGate),
  };
  const report = {
    ...reportWithoutSecretGate,
    qualityGates,
    blockingPassed: Object.values(qualityGates).every(Boolean),
  };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;

  if (update) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, serialized);
    console.log(`Updated ${outputPath}`);
  } else if (existsSync(outputPath)) {
    const expected = normalizeLineEndings(readFileSync(outputPath, "utf8"));
    if (expected !== serialized) {
      throw new Error(
        `${outputPath} is stale. Re-run with --update after reviewing the gold results.`,
      );
    }
  }

  if (!report.blockingPassed && !allowDegraded) {
    console.error(serialized);
    throw new Error("Reader summary multi-day quality gates failed");
  }
  console.log(
    `Reader summary multi-day quality ${report.blockingPassed ? "OK" : "DEGRADED"} (${report.metrics.dayCount} real days)`,
  );
}

async function tryReadActualDays(
  goldDays: readonly ReaderSummaryMultiDayGoldDay[],
): Promise<readonly ReaderSummaryMultiDayActualDay[] | undefined> {
  const pool = new Pool({
    connectionString: yesterdaySocialQualityDatabaseUrl(),
    max: 2,
    connectionTimeoutMillis: 2_000,
  });

  try {
    const days: ReaderSummaryMultiDayActualDay[] = [];
    for (const gold of goldDays) {
      const scope = await readDominantReaderSummaryQualityScope(
        pool,
        gold.collectionDate,
      );
      const record = await readLatestReaderSummaryArtifact(
        pool,
        scope,
        gold.collectionDate,
      );
      if (record === null) {
        continue;
      }
      const snapshot = readerSummaryArtifactFromPrisma(record).toSnapshot();
      const citationById = new Map(
        snapshot.citationMap.map((citation) => [citation.citationId, citation]),
      );
      const topReads = snapshot.content?.topReads ?? [];
      const topReadFeedItemIds = [
        ...new Set(
          topReads.flatMap((topRead) =>
            topRead.citationIds
              .map((citationId) => citationById.get(citationId)?.feedItemId)
              .filter((value): value is string => value !== undefined),
          ),
        ),
      ];
      days.push({
        collectionDate: gold.collectionDate,
        modelVersion: record.modelVersion,
        promptVersion: record.promptVersion,
        rankingPolicyVersion:
          snapshot.lineage.rankingPolicyVersion ?? "unknown",
        storyClusters: snapshot.storyClusters.map((cluster) => ({
          id: cluster.id,
          representativeFeedItemId: cluster.representativeFeedItemId,
          duplicateFeedItemIds: cluster.duplicateFeedItemIds,
          providerKeys: cluster.providerKeys,
        })),
        topReadFeedItemIds,
        topReadQualityEligibility: topReads.map((topRead) =>
          isReaderFacingQualityTopRead(topRead),
        ),
        narrativeSections: (snapshot.content?.narrativeSections ?? []).map(
          (section) => ({
            kind: section.kind,
            ...(section.storyClusterId === undefined
              ? {}
              : { storyClusterId: section.storyClusterId }),
            citationFeedItemIds: section.citationIds
              .map((citationId) => citationById.get(citationId)?.feedItemId)
              .filter(
                (feedItemId): feedItemId is string => feedItemId !== undefined,
              ),
          }),
        ),
      });
    }

    return days;
  } catch (error) {
    if (!isLocalDataSourceUnavailable(error)) {
      throw error;
    }
    console.warn(`Multi-day quality source unavailable: ${message(error)}`);
    return undefined;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

function readGold(): GoldFile {
  const parsed: unknown = JSON.parse(readFileSync(goldPath, "utf8"));
  if (!isRecord(parsed) || !Array.isArray(parsed.days)) {
    throw new Error(`${goldPath} is invalid`);
  }
  if (
    parsed.schemaVersion !== 1 ||
    parsed.artifactFormat !== "reader-summary-multi-day-quality-gold-v1" ||
    !isRecord(parsed.thresholds) ||
    !isRecord(parsed.generationProfile)
  ) {
    throw new Error(`${goldPath} has an unsupported contract`);
  }

  return parsed as unknown as GoldFile;
}

function validateExistingReport(): void {
  if (!existsSync(outputPath)) {
    throw new Error(`${outputPath} is missing`);
  }
  const parsed: unknown = JSON.parse(readFileSync(outputPath, "utf8"));
  if (
    !isRecord(parsed) ||
    parsed.artifactFormat !== "reader-summary-multi-day-quality-report-v1" ||
    parsed.blockingPassed !== true ||
    !noRawSecretFragments(parsed)
  ) {
    throw new Error(`${outputPath} failed artifact validation`);
  }
  console.log("Reader summary multi-day quality artifact OK");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
