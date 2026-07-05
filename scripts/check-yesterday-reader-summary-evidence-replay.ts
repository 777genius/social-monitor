import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { PrismaFeedConnection } from "../libs/feed/adapters/persistence/prisma/prisma-feed-connection";
import { PrismaFeedItemReadRepository } from "../libs/feed/adapters/persistence/prisma/prisma-feed-item-read.repository";
import { InMemoryUserRelevanceProfileRepository } from "../libs/relevance/adapters/persistence/in-memory-user-relevance-profile.repository";
import { RankFeedItemsUseCase } from "../libs/relevance/features/rank-feed-items/rank-feed-items.use-case";
import { RelevanceReaderSummaryEvidenceSelector } from "../libs/summary/adapters/evidence/relevance-reader-summary-evidence.selector";
import { buildSummaryEvidencePack } from "../libs/summary/domain/policies/summary-evidence-pack-policy";
import { buildReaderSummaryPeriod } from "../libs/summary/domain/value-objects/reader-summary-period";
import {
  collectionDateOptionOrDefault,
  type CollectionIntegrityStatus,
  fingerprint,
  message,
  nextDate,
  normalizeLineEndings,
  noRawSecretFragments,
  readCollectionIntegrityStatus,
  readDominantFeedScope,
  roundMetric,
  yesterdaySocialQualityDatabaseUrl,
} from "./lib/yesterday-social-replay-support";
import { FixedClock } from "@social-monitor/shared-kernel";

type Report = {
  readonly schemaVersion: 1;
  readonly artifactFormat: "yesterday-reader-summary-evidence-replay-v1";
  readonly collectionDate: string;
  readonly generatedBy: string;
  readonly model: {
    readonly liveNetwork: false;
    readonly replayTarget: "workspace-reader-summary-evidence";
    readonly rawPostTextPersistedInReport: false;
  };
  readonly inputs: {
    readonly period: {
      readonly startedAt: string;
      readonly endedAt: string;
      readonly timezone: "UTC";
    };
    readonly maxEvidenceItems: number;
  };
  readonly collectionIntegrity: CollectionIntegrityStatus;
  readonly replay: {
    readonly tenantFingerprint: string;
    readonly workspaceFingerprint: string;
    readonly selectedEvidenceCount: number;
    readonly clusterCount: number;
    readonly duplicateClusterCount: number;
    readonly providerCounts: readonly {
      readonly providerKey: string;
      readonly count: number;
    }[];
    readonly selectedInterestFingerprintCount: number;
    readonly primaryProviderCounts: Record<string, number>;
    readonly citationReadyEvidenceCount: number;
    readonly textReadyEvidenceCount: number;
    readonly minScore: number;
    readonly maxScore: number;
  };
  readonly evidencePack: {
    readonly confidence: {
      readonly level: "none" | "low" | "medium" | "high";
      readonly score: number;
    };
    readonly topCommunitySignalCount: number;
    readonly officialSignalCount: number;
    readonly emergingSignalCount: number;
    readonly dissentingViewCount: number;
    readonly highEngagementLowConfidenceCount: number;
    readonly sourceCoverage: {
      readonly selectedEvidenceCount: number;
      readonly providerCount: number;
      readonly crossProviderClusterCount: number;
    };
  };
  readonly qualityGates: Record<string, boolean>;
  readonly blockingPassed: boolean;
};

const { collectionDate } = collectionDateOptionOrDefault("2026-07-03");
const update = process.argv.includes("--update");
const allowDirtyCollection = process.argv.includes("--allow-dirty-collection");
const outputPath = "ops/evals/yesterday-reader-summary-evidence-replay.v1.json";
const maxEvidenceItems = 40;
const primarySources = ["reddit", "x-twitter"];
const localDatabaseUrl = yesterdaySocialQualityDatabaseUrl();

void main();

async function main(): Promise<void> {
  const report = await tryBuildReport();

  if (report === undefined) {
    if (update) {
      throw new Error(
        "Local yesterday social data source is unavailable; cannot update replay report.",
      );
    }
    validateExistingReport();
    return;
  }

  const serialized = `${JSON.stringify(report, null, 2)}\n`;

  if (!report.blockingPassed) {
    console.error(serialized);
    throw new Error("Yesterday reader summary evidence replay gates failed");
  }

  if (update) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, serialized);
    console.log(`Updated ${outputPath}`);
    return;
  }

  if (!existsSync(outputPath)) {
    throw new Error(
      `${outputPath} is missing. Run npm run check:yesterday-reader-summary-evidence-replay -- --update`,
    );
  }

  const expected = normalizeLineEndings(readFileSync(outputPath, "utf8"));
  if (expected !== serialized) {
    throw new Error(
      `${outputPath} is stale. Run npm run check:yesterday-reader-summary-evidence-replay -- --update`,
    );
  }

  console.log(
    `Yesterday reader summary evidence replay OK (${collectionDate}, workspace scope)`,
  );
}

async function tryBuildReport(): Promise<Report | undefined> {
  const scope = await readDominantFeedScope({
    databaseUrl: localDatabaseUrl,
    collectionDate,
  }).catch((error: unknown) => {
    console.warn(`Reader summary replay scope unavailable: ${message(error)}`);
    return undefined;
  });

  if (scope === undefined) {
    return undefined;
  }

  const connection = new PrismaFeedConnection(localDatabaseUrl);

  try {
    const feedItems = new PrismaFeedItemReadRepository(connection);
    const rankFeedItems = new RankFeedItemsUseCase(
      feedItems,
      new InMemoryUserRelevanceProfileRepository(),
      new FixedClock(new Date(`${collectionDate}T23:59:59.000Z`)),
    );
    const selector = new RelevanceReaderSummaryEvidenceSelector(
      rankFeedItems,
      feedItems,
      new FixedClock(new Date(`${collectionDate}T23:59:59.000Z`)),
    );
    const period = buildReaderSummaryPeriod({
      cadence: "daily",
      startedAt: new Date(`${collectionDate}T00:00:00.000Z`),
      endedAt: new Date(nextDate(collectionDate)),
      timezone: "UTC",
    });
    const selection = await selector.select({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      scope: { type: "workspace" },
      period,
      maxItems: maxEvidenceItems,
    });
    const pack = buildSummaryEvidencePack(selection);
    const providerCounts = countBy(
      selection.selectedEvidence,
      (item) => item.providerKey,
    );
    const primaryProviderCounts = Object.fromEntries(
      primarySources.map((source) => [source, providerCounts[source] ?? 0]),
    );
    const scores = selection.selectedEvidence.map((item) => item.score);
    const replay = {
      tenantFingerprint: fingerprint(scope.tenantId),
      workspaceFingerprint: fingerprint(scope.workspaceId),
      selectedEvidenceCount: selection.selectedEvidence.length,
      clusterCount: selection.clusters.length,
      duplicateClusterCount: selection.clusters.filter(
        (cluster) => cluster.duplicateFeedItemIds.length > 0,
      ).length,
      providerCounts: Object.entries(providerCounts)
        .map(([providerKey, count]) => ({ providerKey, count }))
        .sort(
          (left, right) =>
            right.count - left.count ||
            left.providerKey.localeCompare(right.providerKey),
        ),
      selectedInterestFingerprintCount: new Set(
        selection.selectedEvidence.map((item) => fingerprint(item.interestId)),
      ).size,
      primaryProviderCounts,
      citationReadyEvidenceCount: selection.selectedEvidence.filter((item) =>
        /^https?:\/\//i.test(item.canonicalUrl),
      ).length,
      textReadyEvidenceCount: selection.selectedEvidence.filter(
        (item) => `${item.title} ${item.bodyPreview ?? ""}`.trim().length > 0,
      ).length,
      minScore: roundMetric(Math.min(...scores)),
      maxScore: roundMetric(Math.max(...scores)),
    };
    const evidencePack = {
      confidence: {
        level: pack.confidence.level,
        score: pack.confidence.score,
      },
      topCommunitySignalCount: pack.topCommunitySignals.length,
      officialSignalCount: pack.officialSignals.length,
      emergingSignalCount: pack.emergingSignals.length,
      dissentingViewCount: pack.dissentingViews.length,
      highEngagementLowConfidenceCount: pack.highEngagementLowConfidence.length,
      sourceCoverage: {
        selectedEvidenceCount: pack.sourceCoverage.selectedEvidenceCount,
        providerCount: pack.sourceCoverage.providerCount,
        crossProviderClusterCount:
          pack.sourceCoverage.crossProviderClusterCount,
      },
    };
    const redditSelectedCount = primaryProviderCounts.reddit ?? 0;
    const xTwitterSelectedCount = primaryProviderCounts["x-twitter"] ?? 0;
    const collectionIntegrity = readCollectionIntegrityStatus(collectionDate);
    const qualityGates = {
      collectionIntegrityCleanForEval:
        collectionIntegrity.status === "clean" || allowDirtyCollection,
      selectedEvidenceAtLeast30: replay.selectedEvidenceCount >= 30,
      selectedEvidenceHasAtLeastFourProviders:
        replay.providerCounts.length >= 4,
      redditSelectedAtLeastTwo: redditSelectedCount >= 2,
      xTwitterSelectedAtLeastTwo: xTwitterSelectedCount >= 2,
      selectedEvidenceSpansMultipleInterests:
        replay.selectedInterestFingerprintCount >= 2,
      everySelectedEvidenceHasCanonicalUrl:
        replay.citationReadyEvidenceCount === replay.selectedEvidenceCount,
      everySelectedEvidenceHasText:
        replay.textReadyEvidenceCount === replay.selectedEvidenceCount,
      evidencePackConfidenceAtLeastMedium:
        evidencePack.confidence.level === "medium" ||
        evidencePack.confidence.level === "high",
      topCommunitySignalsAvailable: evidencePack.topCommunitySignalCount > 0,
      noRawSecretFragments: true,
    };
    const reportWithoutSecretGate = {
      schemaVersion: 1,
      artifactFormat: "yesterday-reader-summary-evidence-replay-v1",
      collectionDate,
      generatedBy: "npm run check:yesterday-reader-summary-evidence-replay",
      model: {
        liveNetwork: false,
        replayTarget: "workspace-reader-summary-evidence",
        rawPostTextPersistedInReport: false,
      },
      inputs: {
        period: {
          startedAt: period.startedAt.toISOString(),
          endedAt: period.endedAt.toISOString(),
          timezone: "UTC",
        },
        maxEvidenceItems,
      },
      collectionIntegrity,
      replay,
      evidencePack,
      qualityGates,
      blockingPassed: false,
    } satisfies Report;
    const finalQualityGates = {
      ...reportWithoutSecretGate.qualityGates,
      noRawSecretFragments: noRawSecretFragments(reportWithoutSecretGate),
    };

    return {
      ...reportWithoutSecretGate,
      qualityGates: finalQualityGates,
      blockingPassed: Object.values(finalQualityGates).every(
        (value) => value === true,
      ),
    };
  } catch (error) {
    console.warn(
      `Yesterday reader summary replay local source unavailable: ${message(error)}`,
    );
    return undefined;
  } finally {
    await connection.close().catch(() => undefined);
  }
}

function validateExistingReport(): void {
  if (!existsSync(outputPath)) {
    throw new Error(
      `${outputPath} is missing and local data source is unavailable.`,
    );
  }

  const report = JSON.parse(readFileSync(outputPath, "utf8")) as Report;
  const valid =
    report.schemaVersion === 1 &&
    report.artifactFormat === "yesterday-reader-summary-evidence-replay-v1" &&
    report.blockingPassed === true &&
    primarySources.every(
      (source) => (report.replay.primaryProviderCounts[source] ?? 0) >= 2,
    ) &&
    noRawSecretFragments(report);

  if (!valid) {
    throw new Error(`${outputPath} failed existing artifact validation`);
  }

  console.log(
    `Yesterday reader summary evidence replay artifact OK (${report.collectionDate}; local source unavailable)`,
  );
}

function countBy<TValue>(
  values: readonly TValue[],
  keyOf: (value: TValue) => string,
): Record<string, number> {
  const counts = new Map<string, number>();

  for (const value of values) {
    const key = keyOf(value);

    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Object.fromEntries(
    [...counts.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}
