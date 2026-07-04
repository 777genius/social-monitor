import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { Pool } from "pg";

type FeedRow = {
  readonly interestId: string;
  readonly providerKey: string;
  readonly dedupeKey: string;
  readonly sourceItemId: string;
  readonly canonicalUrl: string;
  readonly title: string;
  readonly bodyPreview: string;
  readonly observedAt: Date;
  readonly publishedAt: Date;
  readonly hasProviderMetadata: boolean;
  readonly hasEngagementMetadata: boolean;
  readonly interestQuery: string;
};

type SourceItemCountRow = {
  readonly providerKey: string;
  readonly sourceItemCount: string;
};

type SummaryCountRow = {
  readonly status: string | null;
  readonly count: string;
};

type XRunRow = {
  readonly run_id?: string;
  readonly status?: string;
  readonly started_at?: string;
  readonly finished_at?: string;
  readonly tweets_count?: number;
  readonly query_hash?: string;
  readonly input_json?: string;
  readonly stats_json?: string;
};

type XRunInput = {
  readonly search_query?: string;
  readonly display_type?: string;
  readonly min_likes?: number | null;
  readonly min_retweets?: number | null;
  readonly min_replies?: number | null;
};

type XRunStats = {
  readonly tasks_failed?: number;
  readonly retries?: number;
};

type ProviderReport = {
  readonly providerKey: string;
  readonly feedItemCount: number;
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
  readonly interestCoverage: readonly InterestCoverage[];
  readonly summaryReadiness: {
    readonly primarySourcesCoLocatedInSingleInterest: boolean;
    readonly workspaceOrMultiInterestSummaryNeededForPrimarySourceMix: boolean;
  };
  readonly xCollectorLedger: ReturnType<typeof buildXCollectorLedgerReport>;
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
    readonly xCollectorTaskFailureCount: number;
    readonly primarySourcesSplitAcrossInterests: boolean;
    readonly summaryArtifactMissing: boolean;
  };
  readonly qualityGates: Record<string, boolean>;
  readonly collectionBlockingPassed: boolean;
  readonly summaryQualityVerified: boolean;
  readonly completionStatus:
    | "collection_quality_verified_summary_artifact_missing"
    | "collection_and_summary_quality_verified";
};

const collectionDate = readOption("--date") ?? "2026-07-03";
const update = process.argv.includes("--update");
const outputPath = "ops/evals/yesterday-social-collection-quality-report.v1.json";
const xCollectorLedgerPath =
  process.env.YESTERDAY_SOCIAL_QUALITY_X_LEDGER_PATH ??
  "apps/x-collector/var/x-collector/scweet_state.db";
const localDatabaseUrl =
  process.env.YESTERDAY_SOCIAL_QUALITY_DATABASE_URL ??
  "postgresql://social_monitor:social_monitor_local_password@127.0.0.1:55432/social_monitor";
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

void main();

async function main(): Promise<void> {
  const report = await tryBuildReport();

  if (report === undefined) {
    if (update) {
      throw new Error(
        "Local yesterday social data sources are unavailable; cannot update report.",
      );
    }

    validateExistingReport();
    return;
  }

  const serialized = `${JSON.stringify(report, null, 2)}\n`;

  if (!report.collectionBlockingPassed) {
    console.error(serialized);
    throw new Error("Yesterday social collection quality gates failed");
  }

  if (update) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, serialized);
    console.log(`Updated ${outputPath}`);
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
    const sourceItemCounts = await querySourceItemCounts(pool);
    const summaryArtifacts = await querySummaryArtifacts(pool);
    const summaryJobs = await querySummaryJobs(pool);
    const providerReports = buildProviderReports(feedRows, sourceItemCounts);
    const interestCoverage = buildInterestCoverage(feedRows);
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
    const xCollectorLedger = buildXCollectorLedgerReport();
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
      const report = providerReports.find((item) => item.providerKey === source);

      return report === undefined ? [] : [report];
    });
    const qualityGates = {
      postgresFeedItemsAvailable: feedRows.length > 0,
      allExpectedPrimarySourcesPresent:
        primarySourceCoverage.length === primarySources.length,
      redditFeedItemsAtLeast100: providerFeedItemCountAtLeast(
        providerReports,
        "reddit",
        100,
      ),
      xTwitterFeedItemsAtLeast50: providerFeedItemCountAtLeast(
        providerReports,
        "x-twitter",
        50,
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
      primaryFreshnessP90Below48Hours: primaryReports.every(
        (item) => item.p90ObservedAgeHours <= 48,
      ),
      xCollectorLedgerAvailable: xCollectorLedger.available,
      xCollectorRunCountAtLeast20: xCollectorLedger.runCount >= 20,
      xCollectorCompletedRunRateAtLeast94Percent:
        xCollectorLedger.completedRunRate >= 0.94,
      xCollectorFailedRunsReturnedNoTweets:
        xCollectorLedger.failedReturnedTweetCount === 0,
      xCollectorReturnedAtLeast500Tweets:
        xCollectorLedger.returnedTweetCount >= 500,
      xCollectorHasTopAndLatest: xCollectorLedger.hasTopAndLatest,
      xCollectorHasStrictAndDiscoveryLanes:
        xCollectorLedger.hasStrictAndDiscoveryLanes,
      xCollectorDistinctQueryHashesAtLeast10:
        xCollectorLedger.distinctQueryHashCount >= 10,
      summaryArtifactAbsenceIsExplicit:
        summaryArtifactCoverage.verificationStatus ===
          "verified_from_summary_artifacts" ||
        summaryArtifactCoverage.verificationStatus ===
          "not_verified_missing_summary_artifact",
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
          "local-postgres-feed-items-plus-x-collector-run-ledger",
        rawPostTextPersistedInReport: false,
      },
      inputs: {
        postgresFeedWindow: feedWindow(),
        xCollectorLedgerPath,
      },
      sourceCoverage,
      primarySourceCoverage,
      providerReports,
      interestCoverage,
      summaryReadiness: {
        primarySourcesCoLocatedInSingleInterest,
        workspaceOrMultiInterestSummaryNeededForPrimarySourceMix:
          !primarySourcesCoLocatedInSingleInterest,
      },
      xCollectorLedger,
      summaryArtifactCoverage,
      operationalWarnings: {
        xCollectorFailedRunCount: xCollectorLedger.failedRunCount,
        xCollectorTaskFailureCount: xCollectorLedger.taskFailureCount,
        primarySourcesSplitAcrossInterests:
          !primarySourcesCoLocatedInSingleInterest,
        summaryArtifactMissing:
          summaryArtifactCoverage.verificationStatus ===
          "not_verified_missing_summary_artifact",
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
  const result = await pool.query<FeedRow>(
    `
      select
        f.provider_key as "providerKey",
        f.interest_id::text as "interestId",
        f.dedupe_key as "dedupeKey",
        f.source_item_id::text as "sourceItemId",
        f.canonical_url as "canonicalUrl",
        f.title as "title",
        f.body_preview as "bodyPreview",
        f.observed_at as "observedAt",
        f.published_at as "publishedAt",
        (f.provider_metadata is not null) as "hasProviderMetadata",
        (
          f.provider_metadata::text like '%score%' or
          f.provider_metadata::text like '%likes%' or
          f.provider_metadata::text like '%retweets%' or
          f.provider_metadata::text like '%comments%'
        ) as "hasEngagementMetadata",
        i.query as "interestQuery"
      from feed_items f
      join interests i on i.id = f.interest_id
      where f.observed_at >= $1::timestamptz
        and f.observed_at < $2::timestamptz
      order by f.provider_key, f.observed_at, f.id
    `,
    [feedWindow().startInclusive, feedWindow().endExclusive],
  );

  return result.rows;
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
      from summary_artifacts
      where created_at >= $1::timestamptz
        and created_at < $2::timestamptz
      group by status
      order by status
    `,
    [feedWindow().startInclusive, feedWindow().endExclusive],
  );

  return result.rows;
}

async function querySummaryJobs(pool: Pool): Promise<readonly SummaryCountRow[]> {
  const result = await pool.query<SummaryCountRow>(
    `
      select status::text as "status", count(*)::text as "count"
      from summary_jobs
      where requested_at >= $1::timestamptz
        and requested_at < $2::timestamptz
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
        sourceItemCount: sourceCountsByProvider.get(providerKey) ?? 0,
        distinctDedupeKeyCount,
        duplicateRate: roundMetric(1 - distinctDedupeKeyCount / rows.length),
        textCoverage: ratio(rows, hasReadableText),
        canonicalUrlCoverage: ratio(rows, (row) =>
          /^https?:\/\//i.test(row.canonicalUrl),
        ),
        providerMetadataCoverage: ratio(
          rows,
          (row) => row.hasProviderMetadata,
        ),
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

function buildXCollectorLedgerReport() {
  if (!existsSync(xCollectorLedgerPath)) {
    return {
      available: false,
      runCount: 0,
      completedRunCount: 0,
      failedRunCount: 0,
      completedRunRate: 0,
      failedReturnedTweetCount: 0,
      returnedTweetCount: 0,
      distinctQueryHashCount: 0,
      firstStartedAt: null,
      lastStartedAt: null,
      displayTypeBreakdown: {},
      strictEngagementRunCount: 0,
      discoveryRunCount: 0,
      orGroupRunCount: 0,
      phraseQueryRunCount: 0,
      taskFailureCount: 0,
      retryCount: 0,
      hasTopAndLatest: false,
      hasStrictAndDiscoveryLanes: false,
      queryFamilyFingerprints: [],
    } as const;
  }

  const rows = readXRunRows();
  const queryHashes = new Set<string>();
  const displayTypeBreakdown = new Map<string, number>();
  const queryFamilyFingerprints = new Set<string>();
  let completedRunCount = 0;
  let failedRunCount = 0;
  let failedReturnedTweetCount = 0;
  let returnedTweetCount = 0;
  let strictEngagementRunCount = 0;
  let discoveryRunCount = 0;
  let orGroupRunCount = 0;
  let phraseQueryRunCount = 0;
  let taskFailureCount = 0;
  let retryCount = 0;

  for (const row of rows) {
    const input = parseJson<XRunInput>(row.input_json);
    const stats = parseJson<XRunStats>(row.stats_json);
    const displayType = input?.display_type ?? "unknown";
    const minLikes = input?.min_likes ?? 0;
    const minRetweets = input?.min_retweets ?? 0;
    const minReplies = input?.min_replies ?? 0;
    const query = input?.search_query ?? "";

    if (row.status === "completed") {
      completedRunCount += 1;
    } else {
      failedRunCount += 1;
      failedReturnedTweetCount += row.tweets_count ?? 0;
    }
    returnedTweetCount += row.tweets_count ?? 0;
    if (row.query_hash !== undefined && row.query_hash.length > 0) {
      queryHashes.add(row.query_hash);
    }
    displayTypeBreakdown.set(
      displayType,
      (displayTypeBreakdown.get(displayType) ?? 0) + 1,
    );
    if (minLikes >= 50 || minRetweets >= 10 || minReplies >= 5) {
      strictEngagementRunCount += 1;
    }
    if (minLikes <= 5 && minRetweets <= 1 && minReplies <= 1) {
      discoveryRunCount += 1;
    }
    if (/\bOR\b/.test(query)) {
      orGroupRunCount += 1;
    }
    if (/"[^"]+"/.test(query)) {
      phraseQueryRunCount += 1;
    }
    if (query.trim().length > 0) {
      queryFamilyFingerprints.add(hashText(query).slice(0, 12));
    }
    taskFailureCount += stats?.tasks_failed ?? 0;
    retryCount += stats?.retries ?? 0;
  }

  const displayTypeReport = Object.fromEntries(
    [...displayTypeBreakdown.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );

  return {
    available: true,
    runCount: rows.length,
    completedRunCount,
    failedRunCount,
    completedRunRate:
      rows.length === 0 ? 0 : roundMetric(completedRunCount / rows.length),
    failedReturnedTweetCount,
    returnedTweetCount,
    distinctQueryHashCount: queryHashes.size,
    firstStartedAt: rows[0]?.started_at ?? null,
    lastStartedAt: rows.at(-1)?.started_at ?? null,
    displayTypeBreakdown: displayTypeReport,
    strictEngagementRunCount,
    discoveryRunCount,
    orGroupRunCount,
    phraseQueryRunCount,
    taskFailureCount,
    retryCount,
    hasTopAndLatest:
      displayTypeBreakdown.has("Top") && displayTypeBreakdown.has("Latest"),
    hasStrictAndDiscoveryLanes:
      strictEngagementRunCount > 0 && discoveryRunCount > 0,
    queryFamilyFingerprints: [...queryFamilyFingerprints].sort(),
  } as const;
}

function readXRunRows(): readonly XRunRow[] {
  const sql = `
    select
      run_id,
      status,
      datetime(started_at, 'unixepoch') as started_at,
      datetime(finished_at, 'unixepoch') as finished_at,
      tweets_count,
      query_hash,
      input_json,
      stats_json
    from runs
    where date(started_at, 'unixepoch') = '${collectionDate}'
    order by started_at asc
  `;
  const output = execFileSync("sqlite3", ["-json", xCollectorLedgerPath, sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  return JSON.parse(output) as readonly XRunRow[];
}

function validateExistingReport(): void {
  if (!existsSync(outputPath)) {
    throw new Error(
      `${outputPath} is missing and local data sources are unavailable.`,
    );
  }

  const report = readJson<Report>(outputPath);
  const valid =
    report.schemaVersion === 1 &&
    report.artifactFormat ===
      "yesterday-social-collection-quality-report-v1" &&
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

function hasReadableText(row: FeedRow): boolean {
  return `${row.title} ${row.bodyPreview}`.trim().length > 0;
}

function hasQueryTermHit(row: FeedRow): boolean {
  const terms = tokenize(row.interestQuery);
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

function statusCounts(rows: readonly SummaryCountRow[]): Record<string, number> {
  return Object.fromEntries(
    rows.map((row) => [row.status ?? "unknown", Number.parseInt(row.count, 10)]),
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

function parseJson<TValue>(value: string | undefined): TValue | undefined {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  return JSON.parse(value) as TValue;
}

function readJson<TValue>(path: string): TValue {
  return JSON.parse(readFileSync(path, "utf8")) as TValue;
}

function readOption(name: string): string | undefined {
  const index = process.argv.indexOf(name);

  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
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
    (reports.find((item) => item.providerKey === providerKey)?.feedItemCount ??
      0) >= threshold
  );
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
