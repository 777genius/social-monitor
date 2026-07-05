import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

import { Pool } from "pg";

import { isDefaultReaderSummaryEvidenceProvider } from "@social-monitor/summary/adapters/evidence/reader-summary-evidence-provider-filter";
import {
  readerSummaryArtifactFromPrisma,
  type PrismaReaderSummaryArtifactRecord,
} from "@social-monitor/summary/adapters/persistence/prisma/prisma-reader-summary-records";
import { presentReaderSummaryArtifact } from "@social-monitor/summary/features/shared/reader-summary-artifact-presenter";
import type {
  ReaderSummaryCollectedFeedItemCoverage,
  ReaderSummaryFreshness,
} from "@social-monitor/summary/ports";

import {
  collectionDateOptionOrDefault,
  type CollectionIntegrityStatus,
  fingerprint,
  message,
  nextDate,
  noRawSecretFragments,
  normalizeLineEndings,
  readCollectionIntegrityStatus,
  readDominantFeedScope,
  roundMetric,
  yesterdaySocialQualityDatabaseUrl,
} from "./lib/yesterday-social-replay-support";
import { isLocalDataSourceUnavailable } from "./lib/reader-summary-quality-eval-support";

type ProviderCountRow = {
  readonly providerKey: string;
  readonly collectedFeedItemCount: string;
};

type ArtifactQualityReport = {
  readonly schemaVersion: 1;
  readonly artifactFormat: "yesterday-reader-summary-artifact-quality-v1";
  readonly collectionDate: string;
  readonly generatedBy: string;
  readonly model: {
    readonly liveNetwork: false;
    readonly reportBuilder: "persisted-reader-summary-artifact-quality-gate";
    readonly rawPostTextPersistedInReport: false;
  };
  readonly inputs: {
    readonly database: "local-postgres";
    readonly period: {
      readonly startInclusive: string;
      readonly endExclusive: string;
    };
    readonly scope: {
      readonly tenantFingerprint: string;
      readonly workspaceFingerprint: string;
      readonly scopeType: "workspace";
    };
  };
  readonly artifact: {
    readonly artifactFingerprint: string;
    readonly status: string;
    readonly createdAt: string;
    readonly periodStartedAt: string;
    readonly periodEndedAt: string;
    readonly latestVisiblePeriodStartedAt: string;
    readonly latestVisiblePeriodEndedAt: string;
    readonly headlineFingerprint: string;
    readonly confidenceLevel: string;
    readonly confidenceScore: number;
    readonly qualityFlagCount: number;
  };
  readonly collectionIntegrity: CollectionIntegrityStatus;
  readonly coverage: {
    readonly collectedFeedItemCount: number;
    readonly selectedFeedItemCount: number;
    readonly selectedPostsCount: number;
    readonly storyClusterCount: number;
    readonly topReadCount: number;
    readonly citationCount: number;
    readonly providerCount: number;
    readonly interestCount: number;
    readonly duplicateFeedItemCount: number;
    readonly crossSourceClusterCount: number;
    readonly providerBreakdown: readonly {
      readonly providerKey: string;
      readonly collectedFeedItemCount?: number;
      readonly selectedFeedItemCount: number;
      readonly topReadCount: number;
      readonly citationCount: number;
    }[];
  };
  readonly citations: {
    readonly topReadsWithCanonicalUrl: number;
    readonly topReadsWithCitation: number;
    readonly unknownTopReadCitationIdCount: number;
    readonly citationsWithCanonicalUrl: number;
    readonly selectedPostsWithCanonicalUrl: number;
    readonly selectedPostDuplicateCanonicalUrlCount: number;
    readonly selectedPostsRepresentTopReadPreview: boolean;
    readonly selectedPostsMismatchDocumented: boolean;
  };
  readonly summaryStructure: {
    readonly bulletCount: number;
    readonly claimCount: number;
    readonly riskCount: number;
    readonly reliabilityRiskCount: number;
    readonly openQuestionCount: number;
    readonly nextActionCount: number;
    readonly lowConfidenceTopReadCount: number;
    readonly mediumOrHighConfidenceTopReadCount: number;
  };
  readonly technicalLeakage: {
    readonly userFacingTechnicalLeakCount: number;
    readonly userFacingTechnicalLeakFingerprints: readonly string[];
    readonly uiPayloadTechnicalTagCount: number;
  };
  readonly shadowRankingMetrics: {
    readonly selectedProviderDiversity: number;
    readonly topReadProviderDiversity: number;
    readonly duplicateRate: number;
    readonly crossSourceClusterRate: number;
    readonly lowConfidenceTopReadRate: number;
    readonly primarySelectedRepresentation: Record<string, number>;
    readonly primaryTopReadRepresentation: Record<string, number>;
    readonly providerSkewRatio: number;
    readonly sourceWindowHours: number;
    readonly highEngagementLowConfidenceTopReadCount: number;
  };
  readonly qualityGates: Record<string, boolean>;
  readonly warningSignals: Record<string, boolean>;
  readonly infoSignals: Record<string, boolean>;
  readonly blockingPassed: boolean;
};

const { collectionDate } = collectionDateOptionOrDefault(previousUtcDate());
const update = process.argv.includes("--update");
const artifactOnly = process.argv.includes("--artifact-only");
const allowHistorical = process.argv.includes("--allow-historical");
const allowDirtyCollection = process.argv.includes("--allow-dirty-collection");
const printJson = process.argv.includes("--print-json");
const outputPath =
  "ops/evals/yesterday-reader-summary-artifact-quality.v1.json";
const databaseUrl = yesterdaySocialQualityDatabaseUrl();
const primarySources = ["reddit", "x-twitter"] as const;

void main();

async function main(): Promise<void> {
  if (artifactOnly) {
    validateExistingReport();
    return;
  }

  const report = await tryBuildReport();

  if (report === undefined) {
    if (update) {
      throw new Error(
        "Local reader summary artifact quality source is unavailable; cannot update report.",
      );
    }
    validateExistingReport();
    return;
  }

  const serialized = `${JSON.stringify(report, null, 2)}\n`;

  if (!report.blockingPassed) {
    console.error(serialized);
    throw new Error("Persisted reader summary artifact quality gates failed");
  }

  if (printJson) {
    console.log(serialized);
    return;
  }

  if (update) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, serialized);
    console.log(`Updated ${outputPath}`);
    return;
  }

  if (!existsSync(outputPath)) {
    throw new Error(
      `${outputPath} is missing. Run npm run check:yesterday-reader-summary-artifact-quality -- --update`,
    );
  }

  const expected = normalizeLineEndings(readFileSync(outputPath, "utf8"));
  if (expected !== serialized) {
    throw new Error(
      `${outputPath} is stale. Run npm run check:yesterday-reader-summary-artifact-quality -- --update`,
    );
  }

  console.log(
    `Persisted reader summary artifact quality OK (${report.collectionDate})`,
  );
}

async function tryBuildReport(): Promise<ArtifactQualityReport | undefined> {
  try {
    return await buildReport();
  } catch (error) {
    if (!isLocalDataSourceUnavailable(error)) {
      throw error;
    }
    console.warn(
      `Reader summary artifact quality local source unavailable: ${message(error)}`,
    );
    return undefined;
  }
}

async function buildReport(): Promise<ArtifactQualityReport> {
  const collectionIntegrity = readCollectionIntegrityStatus(collectionDate);
  const scope = await readDominantFeedScope({
    databaseUrl,
    collectionDate,
  });
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 2_000,
  });

  try {
    const record = await readLatestArtifact(pool, {
      tenantId: String(scope.tenantId),
      workspaceId: String(scope.workspaceId),
    });
    const latestVisible = await readLatestVisibleArtifact(pool, {
      tenantId: String(scope.tenantId),
      workspaceId: String(scope.workspaceId),
    });
    const collectedCoverage = await readCollectedCoverage(pool, {
      tenantId: String(scope.tenantId),
      workspaceId: String(scope.workspaceId),
    });
    const artifact = readerSummaryArtifactFromPrisma(record);
    const freshness: ReaderSummaryFreshness = {
      status: "fresh",
      checkedAt: new Date(),
    };
    const view = presentReaderSummaryArtifact(artifact, freshness, {
      collectedCoverage,
    });
    const content = view.content;
    const coverage = view.coverage;
    const citationIds = new Set(view.citations.map((item) => item.citationId));
    const selectedPosts = content.selectedPosts;
    const topReads = content.topReads;
    const lowConfidenceTopReadCount = topReads.filter(
      (item) => item.confidence.level === "low",
    ).length;
    const mediumOrHighConfidenceTopReadCount =
      topReads.length - lowConfidenceTopReadCount;
    const selectedPostCanonicalUrls = selectedPosts
      .map((item) => item.canonicalUrl?.trim() ?? "")
      .filter((value) => value.length > 0);
    const selectedPostDuplicateCanonicalUrlCount =
      selectedPostCanonicalUrls.length -
      new Set(selectedPostCanonicalUrls).size;
    const selectedPostsRepresentTopReadPreview =
      selectedPosts.length > 0 &&
      selectedPosts.length === topReads.length &&
      selectedPosts.length === coverage.topReadCount &&
      selectedPosts.every(hasCanonicalUrl) &&
      coverage.citationCount === coverage.selectedFeedItemCount;
    const selectedPostsMismatchDocumented =
      selectedPosts.length === coverage.selectedFeedItemCount ||
      selectedPostsRepresentTopReadPreview ||
      reliabilityMentionsDedupeOrFilter(content.reliabilityReport);
    const userFacingTechnicalLeaks = collectUserFacingTechnicalLeaks(content);
    const uiPayloadTechnicalTagCount = countUiPayloadTechnicalTags([
      ...topReads,
      ...selectedPosts,
    ]);
    const providerSelectedCounts = Object.fromEntries(
      coverage.providerBreakdown.map((item) => [
        item.providerKey,
        item.selectedFeedItemCount,
      ]),
    );
    const providerTopReadCounts = Object.fromEntries(
      coverage.providerBreakdown.map((item) => [
        item.providerKey,
        item.topReadCount,
      ]),
    );
    const maxProviderSelectedCount = Math.max(
      0,
      ...coverage.providerBreakdown.map((item) => item.selectedFeedItemCount),
    );
    const shadowRankingMetrics = {
      selectedProviderDiversity: ratio(
        coverage.providerBreakdown,
        (item) => item.selectedFeedItemCount > 0,
      ),
      topReadProviderDiversity: ratio(
        coverage.providerBreakdown,
        (item) => item.topReadCount > 0,
      ),
      duplicateRate:
        coverage.selectedFeedItemCount === 0
          ? 0
          : roundMetric(
              coverage.duplicateFeedItemCount / coverage.selectedFeedItemCount,
            ),
      crossSourceClusterRate:
        coverage.storyClusterCount === 0
          ? 0
          : roundMetric(
              coverage.crossSourceClusterCount / coverage.storyClusterCount,
            ),
      lowConfidenceTopReadRate:
        topReads.length === 0
          ? 0
          : roundMetric(lowConfidenceTopReadCount / topReads.length),
      primarySelectedRepresentation: primarySourceCounts(
        providerSelectedCounts,
      ),
      primaryTopReadRepresentation: primarySourceCounts(providerTopReadCounts),
      providerSkewRatio:
        coverage.selectedFeedItemCount === 0
          ? 0
          : roundMetric(
              maxProviderSelectedCount / coverage.selectedFeedItemCount,
            ),
      sourceWindowHours: roundMetric(
        (new Date(view.sourceWindow.endedAt).getTime() -
          new Date(view.sourceWindow.startedAt).getTime()) /
          3_600_000,
      ),
      highEngagementLowConfidenceTopReadCount: topReads.filter(
        (item) =>
          item.confidence.level === "low" && hasHighEngagementMetric(item),
      ).length,
    };
    const coverageSelectedProviderSum = coverage.providerBreakdown.reduce(
      (sum, item) => sum + item.selectedFeedItemCount,
      0,
    );
    const reportWithoutSecretGate = {
      schemaVersion: 1,
      artifactFormat: "yesterday-reader-summary-artifact-quality-v1",
      collectionDate,
      generatedBy: "npm run check:yesterday-reader-summary-artifact-quality",
      model: {
        liveNetwork: false,
        reportBuilder: "persisted-reader-summary-artifact-quality-gate",
        rawPostTextPersistedInReport: false,
      },
      inputs: {
        database: "local-postgres",
        period: feedWindow(),
        scope: {
          tenantFingerprint: fingerprint(String(scope.tenantId)),
          workspaceFingerprint: fingerprint(String(scope.workspaceId)),
          scopeType: "workspace",
        },
      },
      artifact: {
        artifactFingerprint: fingerprint(record.id),
        status: record.status,
        createdAt: record.createdAt.toISOString(),
        periodStartedAt: record.periodStartedAt.toISOString(),
        periodEndedAt: record.periodEndedAt.toISOString(),
        latestVisiblePeriodStartedAt:
          latestVisible.periodStartedAt.toISOString(),
        latestVisiblePeriodEndedAt: latestVisible.periodEndedAt.toISOString(),
        headlineFingerprint: fingerprint(record.headline),
        confidenceLevel: view.confidence.level,
        confidenceScore: view.confidence.score,
        qualityFlagCount: view.qualityFlags.length,
      },
      collectionIntegrity,
      coverage: {
        collectedFeedItemCount: coverage.collectedFeedItemCount ?? 0,
        selectedFeedItemCount: coverage.selectedFeedItemCount,
        selectedPostsCount: selectedPosts.length,
        storyClusterCount: coverage.storyClusterCount,
        topReadCount: coverage.topReadCount,
        citationCount: coverage.citationCount,
        providerCount: coverage.providerCount,
        interestCount: coverage.interestCount,
        duplicateFeedItemCount: coverage.duplicateFeedItemCount,
        crossSourceClusterCount: coverage.crossSourceClusterCount,
        providerBreakdown: coverage.providerBreakdown,
      },
      citations: {
        topReadsWithCanonicalUrl: topReads.filter(hasCanonicalUrl).length,
        topReadsWithCitation: topReads.filter(
          (item) => item.citationIds.length > 0,
        ).length,
        unknownTopReadCitationIdCount: topReads.reduce(
          (count, item) =>
            count +
            item.citationIds.filter(
              (citationId) => !citationIds.has(citationId),
            ).length,
          0,
        ),
        citationsWithCanonicalUrl:
          view.citations.filter(hasCanonicalUrl).length,
        selectedPostsWithCanonicalUrl:
          selectedPosts.filter(hasCanonicalUrl).length,
        selectedPostDuplicateCanonicalUrlCount,
        selectedPostsRepresentTopReadPreview,
        selectedPostsMismatchDocumented,
      },
      summaryStructure: {
        bulletCount: content.bullets.length,
        claimCount: content.claimBoard.length,
        riskCount: content.risks.length,
        reliabilityRiskCount: content.reliabilityReport.risks.length,
        openQuestionCount: content.openQuestions.length,
        nextActionCount: content.nextActions.length,
        lowConfidenceTopReadCount,
        mediumOrHighConfidenceTopReadCount,
      },
      technicalLeakage: {
        userFacingTechnicalLeakCount: userFacingTechnicalLeaks.length,
        userFacingTechnicalLeakFingerprints: [
          ...new Set(userFacingTechnicalLeaks.map(fingerprint)),
        ]
          .sort()
          .slice(0, 20),
        uiPayloadTechnicalTagCount,
      },
      shadowRankingMetrics,
      qualityGates: {
        artifactPeriodMatchesRequestedDate:
          record.periodStartedAt.toISOString() ===
            feedWindow().startInclusive &&
          record.periodEndedAt.toISOString() === feedWindow().endExclusive,
        latestVisibleArtifactPeriodMatchesRequestedDate:
          allowHistorical ||
          (latestVisible.periodStartedAt.toISOString() ===
            feedWindow().startInclusive &&
            latestVisible.periodEndedAt.toISOString() ===
              feedWindow().endExclusive),
        artifactStatusIsVisible:
          record.status === "COMPLETED" || record.status === "NO_SIGNAL",
        coverageSelectedMatchesSourceWindow:
          coverage.selectedFeedItemCount ===
          view.sourceWindow.selectedFeedItemIds.length,
        coverageSelectedMatchesProviderBreakdown:
          coverage.selectedFeedItemCount === coverageSelectedProviderSum,
        selectedPostsMismatchIsExplained: selectedPostsMismatchDocumented,
        topReadsHaveCanonicalUrls:
          topReads.length > 0 &&
          topReads.every((item) => hasCanonicalUrl(item)),
        topReadsHaveCitations:
          topReads.length > 0 &&
          topReads.every((item) => item.citationIds.length > 0),
        topReadCitationsResolve: topReads.every((item) =>
          item.citationIds.every((citationId) => citationIds.has(citationId)),
        ),
        citationsHaveCanonicalUrls:
          view.citations.length > 0 &&
          view.citations.every((item) => hasCanonicalUrl(item)),
        lowConfidenceSummaryHasOpenQuestions:
          view.confidence.level !== "low" || content.openQuestions.length > 0,
        lowConfidenceTopReadsAreExplained:
          lowConfidenceTopReadCount === 0 ||
          view.qualityFlags.length > 0 ||
          content.risks.length > 0 ||
          content.reliabilityReport.risks.length > 0 ||
          content.openQuestions.length > 0,
        risksHaveOpenQuestions:
          content.risks.length + content.reliabilityReport.risks.length === 0 ||
          content.openQuestions.length > 0,
        noUserFacingTechnicalLeakage: userFacingTechnicalLeaks.length === 0,
        noUiPayloadTechnicalTags: uiPayloadTechnicalTagCount === 0,
        collectionIntegrityCleanForEval:
          collectionIntegrity.status === "clean" || allowDirtyCollection,
        noRawSecretFragments: true,
      },
      warningSignals: {
        singleInterestEvidence: coverage.interestCount <= 1,
        lowConfidenceTopReadsPresent: lowConfidenceTopReadCount > 0,
        technicalPayloadTagsPresent: uiPayloadTechnicalTagCount > 0,
        redditMissingFromTopReads:
          shadowRankingMetrics.primaryTopReadRepresentation.reddit === 0,
        xTwitterMissingFromTopReads:
          shadowRankingMetrics.primaryTopReadRepresentation["x-twitter"] === 0,
        selectedProviderSkewAboveHalf:
          shadowRankingMetrics.providerSkewRatio > 0.5,
      },
      infoSignals: {
        selectedPostsLessThanSelectedFeedItems:
          selectedPosts.length < coverage.selectedFeedItemCount,
        selectedPostsRepresentTopReadPreview,
        crossSourceEvidencePresent: coverage.crossSourceClusterCount > 0,
        historicalLatestVisibleGateBypassed: allowHistorical,
        dirtyCollectionAllowedForInspection:
          collectionIntegrity.status === "collection_integrity_failed" &&
          allowDirtyCollection,
        reliabilityCalibrationShadowMode:
          content.reliabilityReport.mode === "shadow",
      },
      blockingPassed: false,
    } satisfies ArtifactQualityReport;
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

function validateExistingReport(): void {
  if (!existsSync(outputPath)) {
    throw new Error(
      `${outputPath} is missing and local data source is unavailable.`,
    );
  }

  const report = JSON.parse(
    readFileSync(outputPath, "utf8"),
  ) as ArtifactQualityReport;
  const valid =
    report.schemaVersion === 1 &&
    report.artifactFormat === "yesterday-reader-summary-artifact-quality-v1" &&
    report.generatedBy === "npm run check:yesterday-reader-summary-artifact-quality" &&
    report.model.liveNetwork === false &&
    report.model.rawPostTextPersistedInReport === false &&
    report.blockingPassed === true &&
    report.qualityGates.noRawSecretFragments === true &&
    noRawSecretFragments(report);

  if (!valid) {
    throw new Error(`${outputPath} failed existing artifact validation`);
  }

  console.log(
    `Persisted reader summary artifact quality artifact OK (${report.collectionDate})`,
  );
}

async function readLatestArtifact(
  pool: Pool,
  scope: {
    readonly tenantId: string;
    readonly workspaceId: string;
  },
): Promise<PrismaReaderSummaryArtifactRecord> {
  const result = await pool.query<PrismaReaderSummaryArtifactRecord>(
    `
      select
        id::text as "id",
        tenant_id::text as "tenantId",
        workspace_id::text as "workspaceId",
        scope_type as "scopeType",
        scope_key as "scopeKey",
        interest_id::text as "interestId",
        cadence as "cadence",
        period_started_at as "periodStartedAt",
        period_ended_at as "periodEndedAt",
        period_timezone as "periodTimezone",
        period_key as "periodKey",
        user_id::text as "userId",
        subscription_id::text as "subscriptionId",
        status::text as "status",
        schema_version as "schemaVersion",
        model_version as "modelVersion",
        prompt_version as "promptVersion",
        headline as "headline",
        summary_text as "summaryText",
        artifact_payload as "artifactPayload",
        citations as "citations",
        quality_signals as "qualitySignals",
        created_at as "createdAt",
        updated_at as "updatedAt"
      from reader_summary_artifacts
      where tenant_id = $1::uuid
        and workspace_id = $2::uuid
        and scope_type = 'workspace'
        and cadence = 'daily'
        and period_started_at = $3::timestamptz
        and period_ended_at = $4::timestamptz
      order by created_at desc, id desc
      limit 1
    `,
    [
      scope.tenantId,
      scope.workspaceId,
      feedWindow().startInclusive,
      feedWindow().endExclusive,
    ],
  );
  const row = result.rows[0];

  if (row === undefined) {
    throw new Error(
      `No persisted reader summary artifact found for ${collectionDate}`,
    );
  }

  return row;
}

async function readLatestVisibleArtifact(
  pool: Pool,
  scope: {
    readonly tenantId: string;
    readonly workspaceId: string;
  },
): Promise<PrismaReaderSummaryArtifactRecord> {
  const result = await pool.query<PrismaReaderSummaryArtifactRecord>(
    `
      select
        id::text as "id",
        tenant_id::text as "tenantId",
        workspace_id::text as "workspaceId",
        scope_type as "scopeType",
        scope_key as "scopeKey",
        interest_id::text as "interestId",
        cadence as "cadence",
        period_started_at as "periodStartedAt",
        period_ended_at as "periodEndedAt",
        period_timezone as "periodTimezone",
        period_key as "periodKey",
        user_id::text as "userId",
        subscription_id::text as "subscriptionId",
        status::text as "status",
        schema_version as "schemaVersion",
        model_version as "modelVersion",
        prompt_version as "promptVersion",
        headline as "headline",
        summary_text as "summaryText",
        artifact_payload as "artifactPayload",
        citations as "citations",
        quality_signals as "qualitySignals",
        created_at as "createdAt",
        updated_at as "updatedAt"
      from reader_summary_artifacts
      where tenant_id = $1::uuid
        and workspace_id = $2::uuid
        and scope_type = 'workspace'
        and cadence = 'daily'
        and status in ('COMPLETED', 'NO_SIGNAL')
      order by period_started_at desc, created_at desc, id desc
      limit 1
    `,
    [scope.tenantId, scope.workspaceId],
  );
  const row = result.rows[0];

  if (row === undefined) {
    throw new Error("No persisted latest reader summary artifact found");
  }

  return row;
}

async function readCollectedCoverage(
  pool: Pool,
  scope: {
    readonly tenantId: string;
    readonly workspaceId: string;
  },
): Promise<ReaderSummaryCollectedFeedItemCoverage> {
  const result = await pool.query<ProviderCountRow>(
    `
      select
        provider_key as "providerKey",
        count(*)::text as "collectedFeedItemCount"
      from feed_items
      where tenant_id = $1::uuid
        and workspace_id = $2::uuid
        and observed_at >= $3::timestamptz
        and observed_at < $4::timestamptz
        and published_at >= $3::timestamptz
        and published_at < $4::timestamptz
      group by provider_key
      order by provider_key
    `,
    [
      scope.tenantId,
      scope.workspaceId,
      feedWindow().startInclusive,
      feedWindow().endExclusive,
    ],
  );
  const providerBreakdown = result.rows
    .filter((item) => isDefaultReaderSummaryEvidenceProvider(item.providerKey))
    .map((item) => ({
      providerKey: item.providerKey,
      collectedFeedItemCount: Number.parseInt(item.collectedFeedItemCount, 10),
    }))
    .sort((left, right) => {
      const countDiff =
        right.collectedFeedItemCount - left.collectedFeedItemCount;
      return countDiff === 0
        ? left.providerKey.localeCompare(right.providerKey)
        : countDiff;
    });

  return {
    collectedFeedItemCount: providerBreakdown.reduce(
      (sum, item) => sum + item.collectedFeedItemCount,
      0,
    ),
    providerBreakdown,
  };
}

function feedWindow(): {
  readonly startInclusive: string;
  readonly endExclusive: string;
} {
  return {
    startInclusive: `${collectionDate}T00:00:00.000Z`,
    endExclusive: new Date(nextDate(collectionDate)).toISOString(),
  };
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

function primarySourceCounts(
  counts: Record<string, number>,
): Record<string, number> {
  return Object.fromEntries(
    primarySources.map((source) => [source, counts[source] ?? 0]),
  );
}

function hasCanonicalUrl(item: { readonly canonicalUrl?: string }): boolean {
  return /^https?:\/\//i.test(item.canonicalUrl?.trim() ?? "");
}

function reliabilityMentionsDedupeOrFilter(value: {
  readonly risks: readonly {
    readonly kind: string;
    readonly description: string;
  }[];
}): boolean {
  return value.risks.some((risk) =>
    /\b(duplicate|dedupe|filter|collapse)\b/i.test(
      `${risk.kind} ${risk.description}`,
    ),
  );
}

function collectUserFacingTechnicalLeaks(content: {
  readonly headline: string;
  readonly oneLineTakeaway: string;
  readonly bullets: readonly string[];
  readonly topReads: readonly {
    readonly title: string;
    readonly reason: string;
    readonly whyNow: string;
    readonly whyImportant: readonly string[];
  }[];
  readonly selectedPosts: readonly {
    readonly title: string;
    readonly reason: string;
    readonly whyNow: string;
    readonly whyImportant: readonly string[];
  }[];
  readonly risks: readonly string[];
  readonly openQuestions: readonly string[];
  readonly nextActions: readonly {
    readonly label: string;
    readonly reason: string;
  }[];
}): readonly string[] {
  const values = [
    content.headline,
    content.oneLineTakeaway,
    ...content.bullets,
    ...content.risks,
    ...content.openQuestions,
    ...content.nextActions.flatMap((item) => [item.label, item.reason]),
    ...content.topReads.flatMap((item) => [
      item.title,
      item.reason,
      item.whyNow,
      ...item.whyImportant,
    ]),
    ...content.selectedPosts.flatMap((item) => [
      item.title,
      item.reason,
      item.whyNow,
      ...item.whyImportant,
    ]),
  ];

  return values.filter((value) =>
    technicalLeakPatterns.some((pattern) => pattern.test(value)),
  );
}

function countUiPayloadTechnicalTags(
  items: readonly { readonly matchedRules: readonly string[] }[],
): number {
  return items.reduce(
    (count, item) =>
      count +
      item.matchedRules.filter((rule) =>
        /^(interest|source-binding|sourcebinding|provider|rule|binding|scope):/i.test(
          rule,
        ),
      ).length,
    0,
  );
}

function hasHighEngagementMetric(item: {
  readonly providerMetrics: readonly {
    readonly label: string;
    readonly value: string;
  }[];
}): boolean {
  return item.providerMetrics.some((metric) => {
    const label = metric.label.toLowerCase();
    const numericValue = Number.parseInt(
      metric.value.replace(/[^0-9]/g, ""),
      10,
    );
    if (!Number.isFinite(numericValue)) {
      return false;
    }

    if (/\b(points|score|likes|upvotes)\b/.test(label)) {
      return numericValue >= 50;
    }

    if (/\b(comments|replies|retweets|reposts)\b/.test(label)) {
      return numericValue >= 10;
    }

    return false;
  });
}

function ratio<TValue>(
  values: readonly TValue[],
  predicate: (value: TValue) => boolean,
): number {
  if (values.length === 0) {
    return 0;
  }

  return roundMetric(
    values.filter((value) => predicate(value)).length / values.length,
  );
}

const technicalLeakPatterns = [
  /\bsource item\b/i,
  /\bcanonicalurl\b/i,
  /\bsource-binding\b/i,
  /\bsourcebinding\b/i,
  /\binterest:[0-9a-f-]{8,}\b/i,
  /\bprovider:[a-z0-9_-]+\b/i,
  /\bfeed_item\b/i,
  /\bsource_item\b/i,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
];
