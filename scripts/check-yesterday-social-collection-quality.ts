import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { Pool } from "pg";

import { statsForFeedItemMetadata } from "@social-monitor/summary/adapters/evidence/feed-item-collection-stats";
import { isDefaultReaderSummaryEvidenceProvider } from "@social-monitor/summary/adapters/evidence/reader-summary-evidence-provider-filter";

import {
  collectionDateOptionOrDefault,
  type CollectionIntegrityStatus,
  readCollectionIntegrityStatus,
  yesterdaySocialQualityDatabaseUrl,
} from "./lib/yesterday-social-replay-support";
import {
  buildXAccountPoolReport,
  buildXCollectorLedgerReport,
  type XAccountPoolReport,
  type XCollectorLedgerReport,
} from "./lib/x-collector-quality-report-support";
import { productionCollectionThresholds } from "./lib/production-collection-quality-policy";

type FeedRow = {
  readonly interestId: string;
  readonly interestExists: boolean;
  readonly providerKey: string;
  readonly dedupeKey: string;
  readonly sourceItemId: string;
  readonly sourceItemExists: boolean;
  readonly sourceBindingId: string;
  readonly sourceBindingExists: boolean;
  readonly canonicalUrl: string;
  readonly title: string;
  readonly bodyPreview: string;
  readonly observedAt: Date;
  readonly publishedAt: Date;
  readonly hasProviderMetadata: boolean;
  readonly hasEngagementMetadata: boolean;
  readonly hasInterestSnapshot: boolean;
  readonly hasSourceBindingSnapshot: boolean;
  readonly interestQuery: string | null;
  readonly providerMetadata: unknown;
  readonly status: string;
};

type SourceItemCountRow = {
  readonly providerKey: string;
  readonly sourceItemCount: string;
};

type SummaryCountRow = {
  readonly status: string | null;
  readonly count: string;
};

type ProviderReport = {
  readonly providerKey: string;
  readonly feedItemCount: number;
  readonly visibleFeedItemCount: number;
  readonly hiddenFeedItemCount: number;
  readonly sourceItemCount: number;
  readonly distinctDedupeKeyCount: number;
  readonly duplicateRate: number;
  readonly textCoverage: number;
  readonly canonicalUrlCoverage: number;
  readonly providerMetadataCoverage: number;
  readonly engagementMetadataCoverage: number;
  readonly queryTermHitRate: number;
  readonly publishedOnTargetDateRate: number;
  readonly medianObservedAgeHours: number;
  readonly p90ObservedAgeHours: number;
  readonly averageBodyPreviewLength: number;
  readonly rankInputReadinessScore: number;
};

type InterestCoverage = {
  readonly interestFingerprint: string;
  readonly feedItemCount: number;
  readonly providerCounts: Record<string, number>;
  readonly containsAllPrimarySources: boolean;
};

type DataIntegrityReport = {
  readonly feedItemCount: number;
  readonly joinedInterestCount: number;
  readonly orphanInterestCount: number;
  readonly orphanInterestRate: number;
  readonly orphanInterestWithSnapshotCount: number;
  readonly orphanInterestFingerprints: readonly string[];
  readonly joinedSourceItemCount: number;
  readonly orphanSourceItemCount: number;
  readonly orphanSourceItemRate: number;
  readonly orphanSourceItemFingerprints: readonly string[];
  readonly joinedSourceBindingCount: number;
  readonly orphanSourceBindingCount: number;
  readonly orphanSourceBindingRate: number;
  readonly orphanSourceBindingWithSnapshotCount: number;
  readonly orphanSourceBindingFingerprints: readonly string[];
};

type DayWindowAuditProviderReport = {
  readonly providerKey: string;
  readonly observedInsideWindowFeedItemCount: number;
  readonly publishedInsideWindowFeedItemCount: number;
  readonly observedButPublishedOutsideWindowFeedItemCount: number;
  readonly publishedOutsideWindowFeedItemCount: number;
  readonly duplicateFeedItemCount: number;
  readonly lowRelevanceFeedItemCount: number;
  readonly mutedFeedItemCount: number;
  readonly userRatedFeedItemCount: number;
};

type DayWindowAuditReport = {
  readonly observedWindow: {
    readonly startInclusive: string;
    readonly endExclusive: string;
  };
  readonly observedInsideWindowFeedItemCount: number;
  readonly observedOutsideWindowFeedItemCount: 0;
  readonly publishedInsideWindowFeedItemCount: number;
  readonly observedButPublishedOutsideWindowFeedItemCount: number;
  readonly publishedOutsideWindowFeedItemCount: number;
  readonly duplicateFeedItemCount: number;
  readonly lowRelevanceFeedItemCount: number;
  readonly mutedFeedItemCount: number;
  readonly userRatedFeedItemCount: number;
  readonly summaryCandidateFeedItemCount: number;
  readonly providerBreakdown: readonly DayWindowAuditProviderReport[];
};

type Report = {
  readonly schemaVersion: 1;
  readonly artifactFormat: "yesterday-social-collection-quality-report-v1";
  readonly collectionDate: string;
  readonly generatedBy: string;
  readonly model: {
    readonly liveNetwork: false;
    readonly reportBuilder: string;
    readonly rawPostTextPersistedInReport: false;
  };
  readonly inputs: {
    readonly postgresFeedWindow: {
      readonly startInclusive: string;
      readonly endExclusive: string;
    };
    readonly xCollectorLedgerPath: string;
  };
  readonly sourceCoverage: readonly string[];
  readonly primarySourceCoverage: readonly string[];
  readonly providerReports: readonly ProviderReport[];
  readonly dataIntegrity: DataIntegrityReport;
  readonly dayWindowAudit: DayWindowAuditReport;
  readonly collectionIntegrity: CollectionIntegrityStatus;
  readonly interestCoverage: readonly InterestCoverage[];
  readonly summaryReadiness: {
    readonly primarySourcesCoLocatedInSingleInterest: boolean;
    readonly workspaceOrMultiInterestSummaryNeededForPrimarySourceMix: boolean;
  };
  readonly xCollectorLedger: XCollectorLedgerReport;
  readonly xAccountPool: XAccountPoolReport;
  readonly summaryArtifactCoverage: {
    readonly artifactCount: number;
    readonly jobCount: number;
    readonly statusCounts: Record<string, number>;
    readonly verificationStatus:
      | "verified_from_summary_artifacts"
      | "not_verified_missing_summary_artifact";
  };
  readonly operationalWarnings: {
    readonly xCollectorFailedRunCount: number;
    readonly xCollectorPartialUsableRunCount: number;
    readonly xCollectorHardFailedRunCount: number;
    readonly xCollectorNonTerminalOrUnknownRunCount: number;
    readonly xCollectorPartialUsableReturnedTweetCount: number;
    readonly xCollectorTaskFailureCount: number;
    readonly primarySourcesSplitAcrossInterests: boolean;
    readonly summaryArtifactMissing: boolean;
    readonly orphanInterestFeedItemCount: number;
    readonly orphanSourceItemFeedItemCount: number;
    readonly orphanSourceBindingFeedItemCount: number;
    readonly xCollectorInvalidJsonFieldCount: number;
    readonly xAccountPoolUsageEventCount: number;
    readonly xAccountPoolLimitProfileObservedCount: number;
    readonly publishedOutsideWindowFeedItemCount: number;
    readonly lowRelevanceFeedItemCount: number;
  };
  readonly qualityGates: Record<string, boolean>;
  readonly collectionBlockingPassed: boolean;
  readonly summaryQualityVerified: boolean;
  readonly completionStatus:
    | "collection_quality_verified_summary_artifact_missing"
    | "collection_and_summary_quality_verified";
};

const { collectionDate, wasExplicit: collectionDateWasExplicit } =
  collectionDateOptionOrDefault("2026-07-03");
const update = process.argv.includes("--update");
const allowHistorical = process.argv.includes("--allow-historical");
const writeFailedReport = process.argv.includes("--write-failed-report");
const outputPath =
  "ops/evals/yesterday-social-collection-quality-report.v1.json";
const xCollectorLedgerPath =
  process.env.YESTERDAY_SOCIAL_QUALITY_X_LEDGER_PATH ??
  "apps/x-collector/var/x-collector/scweet_state.db";
const localDatabaseUrl = yesterdaySocialQualityDatabaseUrl();
const primarySources = ["reddit", "x-twitter"];
const forbiddenSerializedFragments = [
  "access_token",
  "refresh_token",
  "api_key",
  "client_secret",
  "authorization",
  "cookie",
  "private_key",
  "postgres://",
  "postgresql://",
  "amqp://",
  "bearer ",
  "sk-proj-",
  "sk-live-",
];

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const report = await tryBuildReport();

  if (report === undefined) {
    if (update) {
      throw new Error(
        "Local yesterday social data sources are unavailable; cannot update report.",
      );
    }

    if (collectionDateWasExplicit) {
      throw new Error(
        `Local yesterday social data sources are unavailable for ${collectionDate}; refusing to validate a fallback artifact for an explicit date.`,
      );
    }

    validateExistingReport(collectionDate);
    return;
  }

  const serialized = `${JSON.stringify(report, null, 2)}\n`;

  if (update && (report.collectionBlockingPassed || writeFailedReport)) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, serialized);
    console.log(`Updated ${outputPath}`);
  }

  if (!report.collectionBlockingPassed) {
    console.error(serialized);
    throw new Error("Yesterday social collection quality gates failed");
  }

  if (update) {
    return;
  }

  if (!existsSync(outputPath)) {
    throw new Error(
      `${outputPath} is missing. Run npm run check:yesterday-social-collection-quality -- --update`,
    );
  }

  const expected = normalizeLineEndings(readFileSync(outputPath, "utf8"));
  if (expected !== serialized) {
    throw new Error(
      `${outputPath} is stale. Run npm run check:yesterday-social-collection-quality -- --update`,
    );
  }

  console.log(
    `Yesterday social collection quality OK (${report.collectionDate}, ${report.primarySourceCoverage.join(", ")})`,
  );
}

async function tryBuildReport(): Promise<Report | undefined> {
  const pool = new Pool({
    connectionString: localDatabaseUrl,
    max: 1,
    connectionTimeoutMillis: 2_000,
  });

  try {
    const feedRows = await queryFeedRows(pool);
    const publishedWindowFeedRows = await queryPublishedWindowFeedRows(pool);
    const summaryWindowRows = visibleRows(publishedWindowFeedRows);
    const sourceItemCounts = await querySourceItemCounts(pool);
    const summaryArtifacts = await querySummaryArtifacts(pool);
    const summaryJobs = await querySummaryJobs(pool);
    const providerReports = buildProviderReports(
      summaryWindowRows,
      sourceItemCounts,
    );
    const dataIntegrity = buildDataIntegrityReport(summaryWindowRows);
    const dayWindowAudit = buildDayWindowAudit({
      observedRows: feedRows,
      publishedRows: summaryWindowRows,
    });
    const collectionIntegrity = readCollectionIntegrityStatus(collectionDate);
    const interestCoverage = buildInterestCoverage(summaryWindowRows);
    const primarySourcesCoLocatedInSingleInterest = interestCoverage.some(
      (item: InterestCoverage) => item.containsAllPrimarySources,
    );
    const sourceCoverage = providerReports
      .filter((item) => item.feedItemCount > 0)
      .map((item) => item.providerKey)
      .sort();
    const primarySourceCoverage = primarySources.filter((source) =>
      sourceCoverage.includes(source),
    );
    const xCollectorLedger = buildXCollectorLedgerReport({
      ledgerPath: xCollectorLedgerPath,
      collectionDate,
    });
    const xAccountPool = buildXAccountPoolReport({
      ledgerPath: xCollectorLedgerPath,
      collectionDate,
    });
    const summaryArtifactCoverage = {
      artifactCount: sumCounts(summaryArtifacts),
      jobCount: sumCounts(summaryJobs),
      statusCounts: statusCounts(summaryArtifacts),
      verificationStatus:
        sumCounts(summaryArtifacts) > 0
          ? "verified_from_summary_artifacts"
          : "not_verified_missing_summary_artifact",
    } as const;
    const primaryReports = primarySources.flatMap((source) => {
      const report = providerReports.find(
        (item) => item.providerKey === source,
      );

      return report === undefined ? [] : [report];
    });
    const qualityGates = {
      postgresFeedItemsAvailable: summaryWindowRows.length > 0,
      allExpectedPrimarySourcesPresent:
        primarySourceCoverage.length === primarySources.length,
      redditVisibleFeedItemsAtLeast50: providerFeedItemCountAtLeast(
        providerReports,
        "reddit",
        50,
      ),
      xTwitterVisibleFeedItemsMeetProductionMinimum:
        providerFeedItemCountAtLeast(
          providerReports,
          "x-twitter",
          productionCollectionThresholds.xTwitterVisibleFeedItems,
        ),
      everyPrimaryItemHasText: primaryReports.every(
        (item) => item.textCoverage === 1,
      ),
      everyPrimaryItemHasCanonicalUrl: primaryReports.every(
        (item) => item.canonicalUrlCoverage === 1,
      ),
      primaryDuplicateRateBelowFivePercent: primaryReports.every(
        (item) => item.duplicateRate <= 0.05,
      ),
      primaryEngagementMetadataCoverageAtLeast90Percent: primaryReports.every(
        (item) => item.engagementMetadataCoverage >= 0.9,
      ),
      primaryFreshnessP90Below48Hours:
        allowHistorical ||
        primaryReports.every((item) => item.p90ObservedAgeHours <= 48),
      xCollectorLedgerAvailable: xCollectorLedger.available,
      xCollectorRunCountAtLeast20: xCollectorLedger.runCount >= 20,
      xCollectorCompletedRunRateMeetsProductionMinimum: runRateAtLeast(
        xCollectorLedger.completedRunCount,
        xCollectorLedger.runCount,
        productionCollectionThresholds.xCollectorCompletedRunRatePercent,
      ),
      xCollectorUsableRunRateMeetsProductionMinimum: runRateAtLeast(
        xCollectorLedger.usableRunCount,
        xCollectorLedger.runCount,
        productionCollectionThresholds.xCollectorUsableRunRatePercent,
      ),
      xCollectorNoNonTerminalOrUnknownRuns:
        xCollectorLedger.nonTerminalOrUnknownRunCount === 0,
      xCollectorLedgerJsonValid: xCollectorLedger.invalidJsonFieldCount === 0,
      xCollectorReturnedAtLeast500Tweets:
        xCollectorLedger.returnedTweetCount >= 500,
      xCollectorHasTopAndLatest: xCollectorLedger.hasTopAndLatest,
      xCollectorHasStrictAndDiscoveryLanes:
        xCollectorLedger.hasStrictAndDiscoveryLanes,
      xCollectorDistinctQueryHashesAtLeast4:
        xCollectorLedger.distinctQueryHashCount >= 4,
      xAccountPoolStateAvailable:
        !xCollectorLedger.available || xAccountPool.available,
      xAccountPoolTracksPerAccount:
        !xAccountPool.available || xAccountPool.accounts.length > 0,
      dayWindowAuditAvailable:
        dayWindowAudit.publishedInsideWindowFeedItemCount ===
        summaryWindowRows.length,
      observedWindowFilterIsStrict:
        dayWindowAudit.observedOutsideWindowFeedItemCount === 0,
      duplicateAndLowRelevanceCountsReported:
        dayWindowAudit.duplicateFeedItemCount >= 0 &&
        dayWindowAudit.lowRelevanceFeedItemCount >= 0,
      summaryArtifactAbsenceIsExplicit:
        summaryArtifactCoverage.verificationStatus ===
          "verified_from_summary_artifacts" ||
        summaryArtifactCoverage.verificationStatus ===
          "not_verified_missing_summary_artifact",
      noOrphanFeedInterestReferences:
        dataIntegrity.orphanInterestCount === 0 ||
        dataIntegrity.orphanInterestWithSnapshotCount ===
          dataIntegrity.orphanInterestCount,
      noOrphanFeedSourceItemReferences:
        dataIntegrity.orphanSourceItemCount === 0,
      noOrphanFeedSourceBindingReferences:
        dataIntegrity.orphanSourceBindingCount === 0 ||
        dataIntegrity.orphanSourceBindingWithSnapshotCount ===
          dataIntegrity.orphanSourceBindingCount,
      collectionIntegrityCleanForEval: collectionIntegrity.status === "clean",
      noRawSecretFragments: true,
    };
    const reportWithoutSecretGate = {
      schemaVersion: 1,
      artifactFormat: "yesterday-social-collection-quality-report-v1",
      collectionDate,
      generatedBy: "npm run check:yesterday-social-collection-quality",
      model: {
        liveNetwork: false,
        reportBuilder:
          "local-postgres-feed-items-plus-x-collector-run-and-account-ledger",
        rawPostTextPersistedInReport: false,
      },
      inputs: {
        postgresFeedWindow: feedWindow(),
        xCollectorLedgerPath,
      },
      sourceCoverage,
      primarySourceCoverage,
      providerReports,
      dataIntegrity,
      dayWindowAudit,
      collectionIntegrity,
      interestCoverage,
      summaryReadiness: {
        primarySourcesCoLocatedInSingleInterest,
        workspaceOrMultiInterestSummaryNeededForPrimarySourceMix:
          !primarySourcesCoLocatedInSingleInterest,
      },
      xCollectorLedger,
      xAccountPool,
      summaryArtifactCoverage,
      operationalWarnings: {
        xCollectorFailedRunCount: xCollectorLedger.failedRunCount,
        xCollectorPartialUsableRunCount: xCollectorLedger.partialUsableRunCount,
        xCollectorHardFailedRunCount: xCollectorLedger.hardFailedRunCount,
        xCollectorNonTerminalOrUnknownRunCount:
          xCollectorLedger.nonTerminalOrUnknownRunCount,
        xCollectorPartialUsableReturnedTweetCount:
          xCollectorLedger.partialUsableReturnedTweetCount,
        xCollectorTaskFailureCount: xCollectorLedger.taskFailureCount,
        primarySourcesSplitAcrossInterests:
          !primarySourcesCoLocatedInSingleInterest,
        summaryArtifactMissing:
          summaryArtifactCoverage.verificationStatus ===
          "not_verified_missing_summary_artifact",
        orphanInterestFeedItemCount: dataIntegrity.orphanInterestCount,
        orphanSourceItemFeedItemCount: dataIntegrity.orphanSourceItemCount,
        orphanSourceBindingFeedItemCount:
          dataIntegrity.orphanSourceBindingCount,
        xCollectorInvalidJsonFieldCount: xCollectorLedger.invalidJsonFieldCount,
        xAccountPoolUsageEventCount: xAccountPool.eventCount,
        xAccountPoolLimitProfileObservedCount:
          xAccountPool.accountLimitProfileObservedCount,
        publishedOutsideWindowFeedItemCount:
          dayWindowAudit.observedButPublishedOutsideWindowFeedItemCount,
        lowRelevanceFeedItemCount: dayWindowAudit.lowRelevanceFeedItemCount,
      },
      qualityGates,
      collectionBlockingPassed: false,
      summaryQualityVerified:
        summaryArtifactCoverage.verificationStatus ===
        "verified_from_summary_artifacts",
      completionStatus:
        summaryArtifactCoverage.verificationStatus ===
        "verified_from_summary_artifacts"
          ? "collection_and_summary_quality_verified"
          : "collection_quality_verified_summary_artifact_missing",
    } satisfies Report;
    const finalQualityGates = {
      ...reportWithoutSecretGate.qualityGates,
      noRawSecretFragments: noRawSecretFragments(reportWithoutSecretGate),
    };

    return {
      ...reportWithoutSecretGate,
      qualityGates: finalQualityGates,
      collectionBlockingPassed: Object.values(finalQualityGates).every(
        (value) => value === true,
      ),
    };
  } catch (error) {
    console.warn(
      `Yesterday social collection quality local sources unavailable: ${errorMessage(error)}`,
    );
    return undefined;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

async function queryFeedRows(pool: Pool): Promise<readonly FeedRow[]> {
  return queryFeedRowsByWindow(pool, "observed_at");
}

async function queryPublishedWindowFeedRows(
  pool: Pool,
): Promise<readonly FeedRow[]> {
  return queryFeedRowsByWindow(pool, "published_at");
}

async function queryFeedRowsByWindow(
  pool: Pool,
  windowColumn: "observed_at" | "published_at",
): Promise<readonly FeedRow[]> {
  const result = await pool.query<FeedRow>(
    `
      select
        f.provider_key as "providerKey",
        f.interest_id::text as "interestId",
        (i.id is not null) as "interestExists",
        f.dedupe_key as "dedupeKey",
        f.source_item_id::text as "sourceItemId",
        (si.id is not null) as "sourceItemExists",
        f.source_binding_id::text as "sourceBindingId",
        (sb.id is not null) as "sourceBindingExists",
        f.canonical_url as "canonicalUrl",
        f.title as "title",
        coalesce(f.body_preview, '') as "bodyPreview",
        f.observed_at as "observedAt",
        f.published_at as "publishedAt",
        (f.provider_metadata is not null) as "hasProviderMetadata",
        (
          f.provider_metadata::text like '%score%' or
          f.provider_metadata::text like '%likes%' or
          f.provider_metadata::text like '%retweets%' or
          f.provider_metadata::text like '%comments%'
        ) as "hasEngagementMetadata",
        (
          jsonb_typeof(f.provider_metadata -> 'interestQuerySnapshot') = 'object' and
          f.provider_metadata #>> '{interestQuerySnapshot,interestId}' = f.interest_id::text and
          length(trim(coalesce(f.provider_metadata #>> '{interestQuerySnapshot,query}', ''))) > 0
        ) as "hasInterestSnapshot",
        (
          jsonb_typeof(f.provider_metadata -> 'sourceBindingSnapshot') = 'object' and
          f.provider_metadata #>> '{sourceBindingSnapshot,sourceBindingId}' = f.source_binding_id::text and
          f.provider_metadata #>> '{sourceBindingSnapshot,providerKey}' = f.provider_key and
          length(trim(coalesce(f.provider_metadata #>> '{sourceBindingSnapshot,sourceQuery,mode}', ''))) > 0 and
          length(trim(coalesce(f.provider_metadata #>> '{sourceBindingSnapshot,sourceQuery,query}', ''))) > 0 and
          jsonb_typeof(f.provider_metadata -> 'workspaceScopeSnapshot') = 'object' and
          f.provider_metadata #>> '{workspaceScopeSnapshot,tenantId}' = f.tenant_id::text and
          f.provider_metadata #>> '{workspaceScopeSnapshot,workspaceId}' = f.workspace_id::text
        ) as "hasSourceBindingSnapshot",
        i.query as "interestQuery",
        f.provider_metadata as "providerMetadata"
        , f.status::text as "status"
      from feed_items f
      left join interests i on i.id = f.interest_id
      left join source_items si on si.id = f.source_item_id
      left join source_bindings sb on sb.id = f.source_binding_id
      where f.${windowColumn} >= $1::timestamptz
        and f.${windowColumn} < $2::timestamptz
      order by f.provider_key, f.observed_at, f.id
    `,
    [feedWindow().startInclusive, feedWindow().endExclusive],
  );

  return result.rows;
}

function buildDataIntegrityReport(
  feedRows: readonly FeedRow[],
): DataIntegrityReport {
  const orphanInterestRows = feedRows.filter((row) => !row.interestExists);
  const orphanSourceItemRows = feedRows.filter((row) => !row.sourceItemExists);
  const orphanSourceBindingRows = feedRows.filter(
    (row) => !row.sourceBindingExists,
  );

  return {
    feedItemCount: feedRows.length,
    joinedInterestCount: feedRows.length - orphanInterestRows.length,
    orphanInterestCount: orphanInterestRows.length,
    orphanInterestRate: ratio(feedRows, (row) => !row.interestExists),
    orphanInterestWithSnapshotCount: orphanInterestRows.filter(
      (row) => row.hasInterestSnapshot,
    ).length,
    orphanInterestFingerprints: fingerprints(
      orphanInterestRows.map((row) => row.interestId),
    ),
    joinedSourceItemCount: feedRows.length - orphanSourceItemRows.length,
    orphanSourceItemCount: orphanSourceItemRows.length,
    orphanSourceItemRate: ratio(feedRows, (row) => !row.sourceItemExists),
    orphanSourceItemFingerprints: fingerprints(
      orphanSourceItemRows.map((row) => row.sourceItemId),
    ),
    joinedSourceBindingCount: feedRows.length - orphanSourceBindingRows.length,
    orphanSourceBindingCount: orphanSourceBindingRows.length,
    orphanSourceBindingRate: ratio(feedRows, (row) => !row.sourceBindingExists),
    orphanSourceBindingWithSnapshotCount: orphanSourceBindingRows.filter(
      (row) => row.hasSourceBindingSnapshot,
    ).length,
    orphanSourceBindingFingerprints: fingerprints(
      orphanSourceBindingRows.map((row) => row.sourceBindingId),
    ),
  };
}

function buildDayWindowAudit(params: {
  readonly observedRows: readonly FeedRow[];
  readonly publishedRows: readonly FeedRow[];
}): DayWindowAuditReport {
  const window = feedWindow();
  const rowsByObservedProvider = groupBy(
    params.observedRows,
    (row) => row.providerKey,
  );
  const rowsByPublishedProvider = groupBy(
    params.publishedRows,
    (row) => row.providerKey,
  );
  const providerKeys = new Set([
    ...rowsByObservedProvider.keys(),
    ...rowsByPublishedProvider.keys(),
  ]);
  const providerBreakdown = [...providerKeys.values()]
    .map((providerKey): DayWindowAuditProviderReport => {
      const observedRows = rowsByObservedProvider.get(providerKey) ?? [];
      const publishedRows = rowsByPublishedProvider.get(providerKey) ?? [];
      const counts = dayWindowCounts(publishedRows);

      return {
        providerKey,
        observedInsideWindowFeedItemCount: observedRows.length,
        publishedInsideWindowFeedItemCount:
          counts.publishedInsideWindowFeedItemCount,
        observedButPublishedOutsideWindowFeedItemCount: observedRows.filter(
          (row) => !isPublishedInsideTargetDate(row),
        ).length,
        publishedOutsideWindowFeedItemCount:
          counts.publishedOutsideWindowFeedItemCount,
        duplicateFeedItemCount: counts.duplicateFeedItemCount,
        lowRelevanceFeedItemCount: counts.lowRelevanceFeedItemCount,
        mutedFeedItemCount: counts.mutedFeedItemCount,
        userRatedFeedItemCount: counts.userRatedFeedItemCount,
      };
    })
    .sort((left, right) => left.providerKey.localeCompare(right.providerKey));
  const totals = dayWindowCounts(params.publishedRows);

  return {
    observedWindow: window,
    observedInsideWindowFeedItemCount: params.observedRows.length,
    observedOutsideWindowFeedItemCount: 0,
    observedButPublishedOutsideWindowFeedItemCount: params.observedRows.filter(
      (row) => !isPublishedInsideTargetDate(row),
    ).length,
    ...totals,
    providerBreakdown,
  };
}

function dayWindowCounts(
  rows: readonly FeedRow[],
): Omit<
  DayWindowAuditReport,
  | "observedWindow"
  | "observedInsideWindowFeedItemCount"
  | "observedOutsideWindowFeedItemCount"
  | "observedButPublishedOutsideWindowFeedItemCount"
  | "providerBreakdown"
> {
  const stats = rows.map((row) =>
    statsForFeedItemMetadata(recordValue(row.providerMetadata)),
  );
  const publishedInsideWindowFeedItemCount = rows.filter((row) =>
    isPublishedInsideTargetDate(row),
  ).length;

  return {
    publishedInsideWindowFeedItemCount,
    publishedOutsideWindowFeedItemCount:
      rows.length - publishedInsideWindowFeedItemCount,
    duplicateFeedItemCount:
      rows.length - new Set(rows.map((row) => row.dedupeKey)).size,
    lowRelevanceFeedItemCount: stats.filter((item) => item.lowRelevance).length,
    mutedFeedItemCount: stats.filter((item) => item.muted).length,
    userRatedFeedItemCount: stats.filter((item) => item.userRated).length,
    summaryCandidateFeedItemCount: rows.filter((row, index) => {
      const itemStats = stats[index];
      return (
        itemStats !== undefined &&
        isDefaultReaderSummaryEvidenceProvider(row.providerKey) &&
        isPublishedInsideTargetDate(row) &&
        !itemStats.muted
      );
    }).length,
  };
}

async function querySourceItemCounts(
  pool: Pool,
): Promise<readonly SourceItemCountRow[]> {
  const result = await pool.query<SourceItemCountRow>(
    `
      select
        provider_key as "providerKey",
        count(*)::text as "sourceItemCount"
      from source_items
      where observed_at >= $1::timestamptz
        and observed_at < $2::timestamptz
      group by provider_key
      order by provider_key
    `,
    [feedWindow().startInclusive, feedWindow().endExclusive],
  );

  return result.rows;
}

async function querySummaryArtifacts(
  pool: Pool,
): Promise<readonly SummaryCountRow[]> {
  const result = await pool.query<SummaryCountRow>(
    `
      select status::text as "status", count(*)::text as "count"
      from reader_summary_artifacts
      where period_started_at = $1::timestamptz
        and period_ended_at = $2::timestamptz
      group by status
      order by status
    `,
    [feedWindow().startInclusive, feedWindow().endExclusive],
  );

  return result.rows;
}

async function querySummaryJobs(
  pool: Pool,
): Promise<readonly SummaryCountRow[]> {
  const result = await pool.query<SummaryCountRow>(
    `
      select status::text as "status", count(*)::text as "count"
      from reader_summary_jobs
      where period_started_at = $1::timestamptz
        and period_ended_at = $2::timestamptz
      group by status
      order by status
    `,
    [feedWindow().startInclusive, feedWindow().endExclusive],
  );

  return result.rows;
}

function buildProviderReports(
  feedRows: readonly FeedRow[],
  sourceItemCounts: readonly SourceItemCountRow[],
): readonly ProviderReport[] {
  const sourceCountsByProvider = new Map(
    sourceItemCounts.map((item) => [
      item.providerKey,
      Number.parseInt(item.sourceItemCount, 10),
    ]),
  );
  const rowsByProvider = groupBy(feedRows, (row) => row.providerKey);

  return [...rowsByProvider.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([providerKey, rows]) => {
      const distinctDedupeKeyCount = new Set(rows.map((row) => row.dedupeKey))
        .size;
      const ageHours = rows.map((row) =>
        Math.max(
          (row.observedAt.getTime() - row.publishedAt.getTime()) / 3_600_000,
          0,
        ),
      );

      return {
        providerKey,
        feedItemCount: rows.length,
        visibleFeedItemCount: rows.filter((row) => row.status === "VISIBLE")
          .length,
        hiddenFeedItemCount: rows.filter((row) => row.status !== "VISIBLE")
          .length,
        sourceItemCount: sourceCountsByProvider.get(providerKey) ?? 0,
        distinctDedupeKeyCount,
        duplicateRate: roundMetric(1 - distinctDedupeKeyCount / rows.length),
        textCoverage: ratio(rows, hasReadableText),
        canonicalUrlCoverage: ratio(rows, (row) =>
          /^https?:\/\//i.test(row.canonicalUrl),
        ),
        providerMetadataCoverage: ratio(rows, (row) => row.hasProviderMetadata),
        engagementMetadataCoverage: ratio(
          rows,
          (row) => row.hasEngagementMetadata,
        ),
        queryTermHitRate: ratio(rows, hasQueryTermHit),
        publishedOnTargetDateRate: ratio(rows, (row) =>
          row.publishedAt.toISOString().startsWith(`${collectionDate}T`),
        ),
        medianObservedAgeHours: roundMetric(percentile(ageHours, 0.5)),
        p90ObservedAgeHours: roundMetric(percentile(ageHours, 0.9)),
        averageBodyPreviewLength: roundMetric(
          average(rows, (row) => row.bodyPreview.trim().length),
        ),
        rankInputReadinessScore: rankInputReadinessScore(rows, ageHours),
      };
    });
}

function buildInterestCoverage(
  feedRows: readonly FeedRow[],
): readonly InterestCoverage[] {
  return [...groupBy(feedRows, (row) => row.interestId).entries()]
    .map(([interestId, rows]) => {
      const providerCounts = countBy(rows, (row) => row.providerKey);

      return {
        interestFingerprint: hashText(interestId).slice(0, 12),
        feedItemCount: rows.length,
        providerCounts,
        containsAllPrimarySources: primarySources.every(
          (source) => (providerCounts[source] ?? 0) > 0,
        ),
      };
    })
    .sort(
      (left, right) =>
        right.feedItemCount - left.feedItemCount ||
        left.interestFingerprint.localeCompare(right.interestFingerprint),
    );
}

function validateExistingReport(expectedCollectionDate: string): void {
  if (!existsSync(outputPath)) {
    throw new Error(
      `${outputPath} is missing and local data sources are unavailable.`,
    );
  }

  const report = readJson<Report>(outputPath);
  const valid =
    report.schemaVersion === 1 &&
    report.artifactFormat === "yesterday-social-collection-quality-report-v1" &&
    report.collectionDate === expectedCollectionDate &&
    report.collectionBlockingPassed === true &&
    primarySources.every((source) =>
      report.primarySourceCoverage.includes(source),
    ) &&
    noRawSecretFragments(report);

  if (!valid) {
    throw new Error(`${outputPath} failed existing artifact validation`);
  }

  console.log(
    `Yesterday social collection quality artifact OK (${report.collectionDate}; local sources unavailable)`,
  );
}

function feedWindow(): {
  readonly startInclusive: string;
  readonly endExclusive: string;
} {
  const start = new Date(`${collectionDate}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  return {
    startInclusive: start.toISOString(),
    endExclusive: end.toISOString(),
  };
}

function isPublishedInsideTargetDate(row: FeedRow): boolean {
  return row.publishedAt.toISOString().startsWith(`${collectionDate}T`);
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function hasReadableText(row: FeedRow): boolean {
  return `${row.title} ${row.bodyPreview}`.trim().length > 0;
}

function hasQueryTermHit(row: FeedRow): boolean {
  const terms = tokenize(row.interestQuery ?? "");
  const text = `${row.title} ${row.bodyPreview}`.toLowerCase();

  return terms.length > 0 && terms.some((term) => text.includes(term));
}

function rankInputReadinessScore(
  rows: readonly FeedRow[],
  ageHours: readonly number[],
): number {
  const duplicateRate =
    1 - new Set(rows.map((row) => row.dedupeKey)).size / rows.length;
  const p90AgeHours = percentile(ageHours, 0.9);
  const freshnessScore =
    p90AgeHours <= 48 ? 1 : Math.max(0, 1 - (p90AgeHours - 48) / 72);

  return roundMetric(
    averageValues([
      ratio(rows, hasReadableText),
      ratio(rows, (row) => /^https?:\/\//i.test(row.canonicalUrl)),
      ratio(rows, (row) => row.hasEngagementMetadata),
      1 - duplicateRate,
      freshnessScore,
    ]),
  );
}

function tokenize(value: string): readonly string[] {
  const stopWords = new Set([
    "about",
    "after",
    "and",
    "before",
    "for",
    "from",
    "how",
    "into",
    "that",
    "the",
    "this",
    "what",
    "when",
    "where",
    "which",
    "with",
    "your",
  ]);

  return [
    ...new Set(
      value
        .toLowerCase()
        .replace(/[^a-z0-9+#.]+/g, " ")
        .split(/\s+/)
        .filter((term) => term.length >= 3 && !stopWords.has(term)),
    ),
  ];
}

function statusCounts(
  rows: readonly SummaryCountRow[],
): Record<string, number> {
  return Object.fromEntries(
    rows.map((row) => [
      row.status ?? "unknown",
      Number.parseInt(row.count, 10),
    ]),
  );
}

function sumCounts(rows: readonly SummaryCountRow[]): number {
  return rows.reduce((sum, row) => sum + Number.parseInt(row.count, 10), 0);
}

function groupBy<TKey, TValue>(
  values: readonly TValue[],
  keyOf: (value: TValue) => TKey,
): Map<TKey, TValue[]> {
  const grouped = new Map<TKey, TValue[]>();

  for (const value of values) {
    const key = keyOf(value);
    const bucket = grouped.get(key) ?? [];

    bucket.push(value);
    grouped.set(key, bucket);
  }

  return grouped;
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

function average<TValue>(
  values: readonly TValue[],
  valueOf: (value: TValue) => number,
): number {
  if (values.length === 0) {
    return 0;
  }

  return averageValues(values.map((value) => valueOf(value)));
}

function averageValues(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: readonly number[], percent: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * percent) - 1),
  );

  return sorted[index] ?? 0;
}

function readJson<TValue>(path: string): TValue {
  return JSON.parse(readFileSync(path, "utf8")) as TValue;
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function fingerprints(values: readonly string[]): readonly string[] {
  return [...new Set(values.map((value) => hashText(value).slice(0, 12)))]
    .sort()
    .slice(0, 20);
}

function noRawSecretFragments(value: unknown): boolean {
  const serialized = JSON.stringify(value).toLowerCase();

  return forbiddenSerializedFragments.every(
    (fragment) => !serialized.includes(fragment),
  );
}

function providerFeedItemCountAtLeast(
  reports: readonly ProviderReport[],
  providerKey: string,
  threshold: number,
): boolean {
  return (
    (reports.find((item) => item.providerKey === providerKey)
      ?.visibleFeedItemCount ?? 0) >= threshold
  );
}

function runRateAtLeast(
  acceptedRunCount: number,
  totalRunCount: number,
  thresholdPercent: number,
): boolean {
  return (
    totalRunCount > 0 &&
    acceptedRunCount * 100 >= totalRunCount * thresholdPercent
  );
}

function visibleRows(rows: readonly FeedRow[]): readonly FeedRow[] {
  return rows.filter((row) => row.status === "VISIBLE");
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n/g, "\n");
}

function roundMetric(value: number): number {
  return Number(value.toFixed(3));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
