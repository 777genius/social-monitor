import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

import { Pool } from "pg";

import { readerSummaryArtifactFromPrisma } from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-records";
import {
  topReadPrimaryMinimumForLimit,
  topReadProviderCapForLimit,
} from "@social-monitor/summary/domain/policies/top-read-provider-diversity-policy";
import {
  isFallbackReaderReason,
  isUnpolishedReaderTitle,
} from "@social-monitor/summary/domain/policies/reader-summary-reader-facing-text-policy";
import {
  presentReaderSummaryArtifact,
  readerSummaryContentForArtifact,
} from "@social-monitor/summary/features/shared/reader-summary-artifact-presenter";
import { readerSummaryProviderIdentity } from "@social-monitor/summary/domain/value-objects/reader-summary-provider-identity";

import {
  collectionDateOptionOrDefault,
  defaultYesterdaySocialQualityDatabaseUrl,
  fingerprint,
  noRawSecretFragments,
  normalizeLineEndings,
  readDominantFeedScope,
  yesterdaySocialQualityDatabaseUrl,
} from "./lib/yesterday-social-replay-support";
import {
  dailyPeriodKey,
  dayEnd,
  dayStart,
  isLocalDataSourceUnavailable,
  readLatestReaderSummaryArtifact,
} from "./lib/reader-summary-quality-eval-support";
import {
  type MissedSameProviderCandidate,
  type RankingAuditTopRead,
  materialSameProviderMissedCandidates,
  rankingItemFingerprint,
  rankingSupportScore,
  severeSameProviderMissedCandidates,
  isEditorialSafetyExplainedLeadInversion,
} from "./lib/reader-summary-ranking-audit";

type TopReadRankingReport = {
  readonly schemaVersion: 1;
  readonly artifactFormat: "reader-summary-top-read-ranking-v1";
  readonly collectionDate: string;
  readonly generatedBy: string;
  readonly model: {
    readonly liveNetwork: false;
    readonly reportBuilder: "persisted-top-read-ranking-gate";
    readonly rawPostTextPersistedInReport: false;
  };
  readonly artifact: {
    readonly artifactFingerprint: string;
    readonly periodStartedAt: string;
    readonly periodEndedAt: string;
    readonly status: string;
  };
  readonly ranking: {
    readonly topReadCount: number;
    readonly topReadWithCitationCount: number;
    readonly topReadWithinWindowCount: number;
    readonly unknownCitationCount: number;
    readonly unsupportedConfirmedProviderCount: number;
    readonly crossSourceTopReadCount: number;
    readonly dominantProviderTopReadCount: number;
    readonly providerDiversityCap: number;
    readonly materialSignalInversionCount: number;
    readonly unexplainedSignalInversionCount: number;
    readonly unexplainedSignalInversions: readonly SignalInversion[];
    readonly materialSameProviderMissedCandidateCount: number;
    readonly severeSameProviderMissedCandidateCount: number;
    readonly materialSameProviderMissedCandidates: readonly MissedSameProviderCandidate[];
    readonly unpolishedTopReadTitleCount: number;
    readonly fallbackTopReadReasonCount: number;
  };
  readonly qualityGates: Record<string, boolean>;
  readonly blockingPassed: boolean;
};

type SignalInversion = {
  readonly earlierRank: number;
  readonly laterRank: number;
  readonly signalDelta: number;
  readonly earlierSupportScore: number;
  readonly laterSupportScore: number;
  readonly earlierFingerprint: string;
  readonly laterFingerprint: string;
};

export type AtomicTopReadRankingReportOperations = {
  readonly makeDirectory: (path: string) => void;
  readonly writeFile: (path: string, value: string) => void;
  readonly renameFile: (sourcePath: string, targetPath: string) => void;
  readonly removeFile: (path: string) => void;
};

const outputPath = "ops/evals/reader-summary-top-read-ranking.v1.json";
const update = process.argv.includes("--update");
const writeFailedReport = process.argv.includes("--write-failed-report");
const artifactOnly = process.argv.includes("--artifact-only");
const { collectionDate } = collectionDateOptionOrDefault(previousUtcDate());
const materialSignalGap = 0.3;
const supportExplanationMargin = 0.4;
const configuredTopReadLimit = 10;

if (require.main === module) {
  void main();
}

async function main(): Promise<void> {
  if (artifactOnly) {
    validateExistingReport();
    return;
  }

  const report = await tryBuildReport();
  if (report === undefined) {
    if (update) {
      throw new Error(
        "Local reader summary ranking source is unavailable; cannot update report.",
      );
    }
    validateExistingReport();
    return;
  }

  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (!report.blockingPassed) {
    console.error(serialized);
    failTopReadRankingReport({
      update,
      writeFailedReport,
      persistFailedReport: () => {
        writeSanitizedReportAtomically(report, serialized);
        console.log(`Updated failed report ${outputPath}`);
      },
    });
  }

  if (update) {
    writeSanitizedReportAtomically(report, serialized);
    console.log(`Updated ${outputPath}`);
    return;
  }

  if (!existsSync(outputPath)) {
    throw new Error(
      `${outputPath} is missing. Run npm run check:reader-summary-top-read-ranking -- --update`,
    );
  }

  const expected = normalizeLineEndings(readFileSync(outputPath, "utf8"));
  if (expected !== serialized) {
    throw new Error(
      `${outputPath} is stale. Run npm run check:reader-summary-top-read-ranking -- --update`,
    );
  }

  console.log(`Reader summary top-read ranking OK (${collectionDate})`);
}

async function tryBuildReport(): Promise<TopReadRankingReport | undefined> {
  const databaseUrl = yesterdaySocialQualityDatabaseUrl();
  let fallbackError: unknown;
  for (const candidateUrl of candidateDatabaseUrls(databaseUrl)) {
    try {
      return await buildReportFromDatabase(candidateUrl);
    } catch (error) {
      fallbackError = error;
      if (!shouldTryNextDatabaseUrl(error)) {
        throw error;
      }
    }
  }

  if (isLocalDataSourceUnavailable(fallbackError)) {
    console.warn(
      `Reader summary top-read ranking local source unavailable: ${String(fallbackError)}`,
    );
    return undefined;
  }
  throw fallbackError;
}

async function buildReportFromDatabase(
  connectionString: string,
): Promise<TopReadRankingReport> {
  const pool = new Pool({
    connectionString,
    min: 0,
    max: 1,
    connectionTimeoutMillis: 2_000,
  });

  try {
    const scope = await readDominantFeedScope({
      databaseUrl: connectionString,
      collectionDate,
    });
    const record = await readLatestReaderSummaryArtifact(
      pool,
      scope,
      collectionDate,
    );
    if (record === null) {
      throw new Error(
        `No persisted reader summary artifact for ${collectionDate}`,
      );
    }

    const artifact = readerSummaryArtifactFromPrisma(record);
    const view = presentReaderSummaryArtifact(
      artifact,
      { status: "fresh", checkedAt: new Date() },
    );
    const domainContent = readerSummaryContentForArtifact(artifact);
    const topReads = domainContent.topReads;
    const selectedPosts = domainContent.selectedPosts ?? domainContent.topReads;
    const providerCounts = topReadProviderCounts(topReads);
    const dominantProviderTopReadCount = Math.max(
      0,
      ...providerCounts.values(),
    );
    const providerDiversityCap = topReadProviderCapForLimit({
      limit: configuredTopReadLimit,
      activeProviderCount: providerCounts.size,
      primaryMinimum: topReadPrimaryMinimumForLimit(configuredTopReadLimit),
    });
    const citationIds = new Set(view.citations.map((item) => item.citationId));
    const citationProviderById = new Map(
      view.citations.map((citation) => [
        citation.citationId,
        readerSummaryProviderIdentity(citation).providerKey,
      ]),
    );
    const windowStart = dayStart(collectionDate);
    const windowEnd = dayEnd(collectionDate);
    const unexplainedSignalInversions =
      unexplainedMaterialSignalInversions(topReads);
    const missedSameProviderCandidates = materialSameProviderMissedCandidates({
      topReads,
      selectedPosts,
    });
    const unknownCitationCount = topReads.reduce(
      (count, item) =>
        count +
        item.citationIds.filter((citationId) => !citationIds.has(citationId))
          .length,
      0,
    );
    const unsupportedConfirmedProviderCount = topReads.reduce((count, item) => {
      const visibleProviders = new Set(
        item.citationIds
          .map((citationId) => citationProviderById.get(citationId))
          .filter((providerKey): providerKey is string => Boolean(providerKey)),
      );

      return (
        count +
        item.confirmedProviderKeys.filter(
          (providerKey) => !visibleProviders.has(providerKey),
        ).length
      );
    }, 0);
    const reportWithoutSecretGate = {
      schemaVersion: 1,
      artifactFormat: "reader-summary-top-read-ranking-v1",
      collectionDate,
      generatedBy: "npm run check:reader-summary-top-read-ranking",
      model: {
        liveNetwork: false,
        reportBuilder: "persisted-top-read-ranking-gate",
        rawPostTextPersistedInReport: false,
      },
      artifact: {
        artifactFingerprint: fingerprint(record.id),
        periodStartedAt: record.periodStartedAt.toISOString(),
        periodEndedAt: record.periodEndedAt.toISOString(),
        status: record.status,
      },
      ranking: {
        topReadCount: topReads.length,
        topReadWithCitationCount: topReads.filter(
          (item) => item.citationIds.length > 0,
        ).length,
        topReadWithinWindowCount: topReads.filter((item) =>
          isPublishedInsideWindow(item, windowStart, windowEnd),
        ).length,
        unknownCitationCount,
        unsupportedConfirmedProviderCount,
        crossSourceTopReadCount: topReads.filter(
          (item) => item.confirmedProviderKeys.length > 1,
        ).length,
        dominantProviderTopReadCount,
        providerDiversityCap,
        materialSignalInversionCount: materialSignalInversions(topReads).length,
        unexplainedSignalInversionCount: unexplainedSignalInversions.length,
        unexplainedSignalInversions,
        materialSameProviderMissedCandidateCount:
          missedSameProviderCandidates.length,
        severeSameProviderMissedCandidateCount:
          severeSameProviderMissedCandidates(missedSameProviderCandidates)
            .length,
        materialSameProviderMissedCandidates:
          missedSameProviderCandidates.slice(0, 20),
        unpolishedTopReadTitleCount: topReads.filter((item) =>
          isUnpolishedReaderTitle(item.title),
        ).length,
        fallbackTopReadReasonCount: topReads.filter((item) =>
          isFallbackReaderReason(item.reason),
        ).length,
      },
      qualityGates: {
        artifactPeriodMatchesRequestedDate:
          record.periodKey === dailyPeriodKey(collectionDate),
        artifactStatusIsVisible:
          record.status === "COMPLETED" || record.status === "NO_SIGNAL",
        topReadsExist: topReads.length > 0,
        topReadsHaveCitations: topReads.every(
          (item) => item.citationIds.length > 0,
        ),
        topReadCitationsResolve: unknownCitationCount === 0,
        confirmedProvidersHaveVisibleCitations:
          unsupportedConfirmedProviderCount === 0,
        topReadsStayInsideRequestedWindow: topReads.every((item) =>
          isPublishedInsideWindow(item, windowStart, windowEnd),
        ),
        materialSignalInversionsAreExplained:
          unexplainedSignalInversions.length === 0,
        dominantProviderWithinDiversityCap:
          dominantProviderTopReadCount <= providerDiversityCap,
        severeSameProviderMissedCandidatesAreAbsent:
          severeSameProviderMissedCandidates(missedSameProviderCandidates)
            .length === 0,
        topReadTitlesAreReaderFacing: topReads.every(
          (item) => !isUnpolishedReaderTitle(item.title),
        ),
        topReadReasonsAreReaderFacing: topReads.every(
          (item) => !isFallbackReaderReason(item.reason),
        ),
        noRawSecretFragments: true,
      },
      blockingPassed: false,
    } satisfies TopReadRankingReport;
    const qualityGates = {
      ...reportWithoutSecretGate.qualityGates,
      noRawSecretFragments: noRawSecretFragments(reportWithoutSecretGate),
    };

    return {
      ...reportWithoutSecretGate,
      qualityGates,
      blockingPassed: Object.values(qualityGates).every(
        (value) => value === true,
      ),
    };
  } finally {
    await pool.end().catch(() => undefined);
  }
}

function candidateDatabaseUrls(databaseUrl: string): readonly string[] {
  return [...new Set([databaseUrl, defaultYesterdaySocialQualityDatabaseUrl])];
}

function shouldTryNextDatabaseUrl(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);

  return (
    isLocalDataSourceUnavailable(error) ||
    message.includes("No feed items found") ||
    message.includes("No persisted reader summary artifact")
  );
}

function validateExistingReport(): void {
  if (!existsSync(outputPath)) {
    throw new Error(
      `${outputPath} is missing and local data source is unavailable.`,
    );
  }

  const report = JSON.parse(
    readFileSync(outputPath, "utf8"),
  ) as TopReadRankingReport;
  const valid =
    report.schemaVersion === 1 &&
    report.artifactFormat === "reader-summary-top-read-ranking-v1" &&
    report.generatedBy === "npm run check:reader-summary-top-read-ranking" &&
    report.model.liveNetwork === false &&
    report.model.rawPostTextPersistedInReport === false &&
    report.blockingPassed === true &&
    report.qualityGates.noRawSecretFragments === true &&
    report.qualityGates.materialSignalInversionsAreExplained === true &&
    report.qualityGates.severeSameProviderMissedCandidatesAreAbsent === true &&
    report.qualityGates.topReadTitlesAreReaderFacing === true &&
    report.qualityGates.topReadReasonsAreReaderFacing === true &&
    report.qualityGates.confirmedProvidersHaveVisibleCitations === true &&
    noRawSecretFragments(report);

  if (!valid) {
    throw new Error(`${outputPath} failed existing artifact validation`);
  }

  console.log(
    `Reader summary top-read ranking artifact OK (${report.collectionDate})`,
  );
}

function unexplainedMaterialSignalInversions(
  topReads: readonly RankingAuditTopRead[],
): readonly SignalInversion[] {
  return materialSignalInversions(topReads).filter(
    (inversion) =>
      inversion.earlierSupportScore + supportExplanationMargin <
        inversion.laterSupportScore &&
      !isEditorialSafetyExplainedLeadInversion({
        earlierRank: inversion.earlierRank,
        laterRank: inversion.laterRank,
        earlier: topReads[inversion.earlierRank - 1],
        later: topReads[inversion.laterRank - 1],
      }),
  );
}

function materialSignalInversions(
  topReads: readonly RankingAuditTopRead[],
): readonly SignalInversion[] {
  const inversions: SignalInversion[] = [];
  for (
    let earlierIndex = 0;
    earlierIndex < topReads.length;
    earlierIndex += 1
  ) {
    for (
      let laterIndex = earlierIndex + 1;
      laterIndex < topReads.length;
      laterIndex += 1
    ) {
      const earlier = topReads[earlierIndex];
      const later = topReads[laterIndex];
      if (earlier === undefined || later === undefined) {
        continue;
      }
      const signalDelta = later.signalScore - earlier.signalScore;
      if (signalDelta < materialSignalGap) {
        continue;
      }

      inversions.push({
        earlierRank: earlierIndex + 1,
        laterRank: laterIndex + 1,
        signalDelta: rounded(signalDelta),
        earlierSupportScore: rankingSupportScore(earlier),
        laterSupportScore: rankingSupportScore(later),
        earlierFingerprint: rankingItemFingerprint(earlier),
        laterFingerprint: rankingItemFingerprint(later),
      });
    }
  }

  return inversions;
}

function topReadProviderCounts(
  topReads: readonly RankingAuditTopRead[],
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const item of topReads) {
    counts.set(item.providerKey, (counts.get(item.providerKey) ?? 0) + 1);
  }

  return counts;
}

function isPublishedInsideWindow(
  item: RankingAuditTopRead,
  startInclusive: string,
  endExclusive: string,
): boolean {
  const publishedAt =
    item.publishedAt instanceof Date
      ? item.publishedAt.toISOString()
      : item.publishedAt;
  if (publishedAt === undefined || publishedAt.trim().length === 0) {
    return false;
  }

  return publishedAt >= startInclusive && publishedAt < endExclusive;
}

export const shouldPersistFailedTopReadRankingReport = (params: {
  readonly update: boolean;
  readonly writeFailedReport: boolean;
}): boolean => params.update && params.writeFailedReport;

export function failTopReadRankingReport(params: {
  readonly update: boolean;
  readonly writeFailedReport: boolean;
  readonly persistFailedReport: () => void;
}): never {
  if (shouldPersistFailedTopReadRankingReport(params)) {
    params.persistFailedReport();
  }

  throw new Error("Reader summary top-read ranking gates failed");
}

function writeSanitizedReportAtomically(
  report: TopReadRankingReport,
  serialized: string,
): void {
  if (
    report.model.rawPostTextPersistedInReport !== false ||
    !noRawSecretFragments(report)
  ) {
    throw new Error(
      "Reader summary top-read ranking report failed sanitization; refusing to persist it.",
    );
  }

  writeTopReadRankingReportAtomically({ outputPath, serialized });
}

export function writeTopReadRankingReportAtomically(params: {
  readonly outputPath: string;
  readonly serialized: string;
  readonly operations?: AtomicTopReadRankingReportOperations;
}): void {
  const operations = params.operations ?? defaultAtomicReportOperations;
  operations.makeDirectory(dirname(params.outputPath));
  const temporaryPath = `${params.outputPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    operations.writeFile(temporaryPath, params.serialized);
    operations.renameFile(temporaryPath, params.outputPath);
  } finally {
    operations.removeFile(temporaryPath);
  }
}

const defaultAtomicReportOperations: AtomicTopReadRankingReportOperations = {
  makeDirectory: (path) => mkdirSync(path, { recursive: true }),
  writeFile: (path, value) => writeFileSync(path, value, { flag: "wx" }),
  renameFile: (sourcePath, targetPath) =>
    renameSync(sourcePath, targetPath),
  removeFile: (path) => rmSync(path, { force: true }),
};

function rounded(value: number): number {
  return Number(value.toFixed(3));
}

function previousUtcDate(): string {
  const now = new Date();
  const startOfTodayUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );

  return new Date(startOfTodayUtc - 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}
