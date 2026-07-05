import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { Pool } from "pg";

import {
  fingerprint,
  message,
  noRawSecretFragments,
  normalizeLineEndings,
  roundMetric,
  yesterdaySocialQualityDatabaseUrl,
} from "./lib/yesterday-social-replay-support";
import {
  asRecord,
  isLocalDataSourceUnavailable,
  parseHost,
  stringValue,
} from "./lib/reader-summary-quality-eval-support";

type RatingRow = {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly rating: number | null;
  readonly target: unknown;
  readonly createdAt: Date;
};

type FeedItemRow = {
  readonly id: string;
  readonly sourceItemId: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly interestId: string;
  readonly providerKey: string;
  readonly canonicalUrl: string;
  readonly title: string;
  readonly bodyPreview: string;
  readonly publishedAt: Date;
  readonly observedAt: Date;
  readonly providerMetadata: unknown;
};

type CalibrationReason =
  "duplicate" | "off_topic" | "weak_source" | "too_old" | "low_quality";

type MatchedRating = {
  readonly rating: RatingRow;
  readonly reason?: CalibrationReason;
  readonly feedItem?: FeedItemRow;
  readonly riskSignals: readonly CalibrationReason[];
};

type SummaryFeedbackCalibrationReport = {
  readonly schemaVersion: 1;
  readonly artifactFormat: "summary-feedback-calibration-report-v1";
  readonly generatedBy: string;
  readonly model: {
    readonly mode: "shadow";
    readonly liveNetwork: false;
    readonly rankingInfluenceAllowed: false;
    readonly rawPostTextPersistedInReport: false;
    readonly rawUserFeedbackPersistedInReport: false;
    readonly riskClassifier: "deterministic-post-rating-risk-v1";
  };
  readonly inputs: {
    readonly database: "local-postgres";
    readonly minMatchedRatingCount: number;
    readonly minNegativeRatingCount: number;
  };
  readonly scope: {
    readonly tenantFingerprint?: string;
    readonly workspaceFingerprint?: string;
  };
  readonly status:
    "no_feedback" | "insufficient_feedback" | "calibrated" | "attention_needed";
  readonly totals: {
    readonly ratingCount: number;
    readonly negativeRatingCount: number;
    readonly positiveRatingCount: number;
    readonly matchedFeedItemRatingCount: number;
    readonly unmatchedRatingCount: number;
    readonly negativeRatingsWithReasonCount: number;
    readonly negativeRatingsMissingReasonCount: number;
  };
  readonly reasonCorrelation: readonly {
    readonly reason: CalibrationReason;
    readonly negativeRatingCount: number;
    readonly matchedFeedItemRatingCount: number;
    readonly riskMatchedCount: number;
    readonly riskMatchRate: number;
  }[];
  readonly riskSignalCounts: Record<string, number>;
  readonly providerNegativeRates: readonly {
    readonly providerKey: string;
    readonly ratingCount: number;
    readonly negativeRate: number;
  }[];
  readonly qualityGates: Record<string, boolean>;
  readonly blockingPassed: boolean;
};

const outputPath = "ops/evals/summary-feedback-calibration-report.v1.json";
const databaseUrl = yesterdaySocialQualityDatabaseUrl();
const update = process.argv.includes("--update");
const artifactOnly = process.argv.includes("--artifact-only");
const minMatchedRatingCount = 20;
const minNegativeRatingCount = 5;
const calibrationReasons: readonly CalibrationReason[] = [
  "duplicate",
  "off_topic",
  "weak_source",
  "too_old",
  "low_quality",
];

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
        "Local feedback calibration data source is unavailable; cannot update report.",
      );
    }
    validateExistingReport();
    return;
  }

  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (!report.blockingPassed) {
    console.error(serialized);
    throw new Error("Summary feedback calibration report gates failed");
  }

  if (update) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, serialized);
    console.log(`Updated ${outputPath}`);
    return;
  }

  if (!existsSync(outputPath)) {
    throw new Error(
      `${outputPath} is missing. Run npm run check:summary-feedback-calibration-report -- --update`,
    );
  }

  const expected = normalizeLineEndings(readFileSync(outputPath, "utf8"));
  if (expected !== serialized) {
    throw new Error(
      `${outputPath} is stale. Run npm run check:summary-feedback-calibration-report -- --update`,
    );
  }

  console.log(`Summary feedback calibration report OK (${report.status})`);
}

async function tryBuildReport(): Promise<
  SummaryFeedbackCalibrationReport | undefined
> {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 2_000,
  });

  try {
    const ratings = await readRatings(pool);
    const feedItems = await readFeedItems(pool);
    const matchedRatings = matchRatings(ratings, feedItems);
    const status = calibrationStatus(matchedRatings);
    const reportWithoutSecretGate = buildReport({
      ratings,
      matchedRatings,
      status,
    });
    const qualityGates = {
      ...reportWithoutSecretGate.qualityGates,
      noRawSecretFragments: noRawSecretFragments(reportWithoutSecretGate),
    };

    return {
      ...reportWithoutSecretGate,
      qualityGates,
      blockingPassed: Object.values(qualityGates).every(Boolean),
    };
  } catch (error) {
    if (!isLocalDataSourceUnavailable(error)) {
      throw error;
    }
    console.warn(
      `Summary feedback calibration local source unavailable: ${message(error)}`,
    );
    return undefined;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

function buildReport(params: {
  readonly ratings: readonly RatingRow[];
  readonly matchedRatings: readonly MatchedRating[];
  readonly status: SummaryFeedbackCalibrationReport["status"];
}): SummaryFeedbackCalibrationReport {
  const negativeRatings = params.matchedRatings.filter(
    (item) => (item.rating.rating ?? 0) <= 2,
  );
  const positiveRatings = params.matchedRatings.filter(
    (item) => (item.rating.rating ?? 0) >= 4,
  );
  const matchedFeedItemRatingCount = params.matchedRatings.filter(
    (item) => item.feedItem !== undefined,
  ).length;
  const negativeRatingsWithReasonCount = negativeRatings.filter(
    (item) => item.reason !== undefined,
  ).length;
  const rankingInfluenceAllowed = false;
  const scope = dominantScope(params.ratings);
  const qualityGates = {
    rankingInfluenceDisabled: !rankingInfluenceAllowed,
    calibrationStatusExplicit:
      params.status === "no_feedback" ||
      params.status === "insufficient_feedback" ||
      params.status === "calibrated" ||
      params.status === "attention_needed",
    rankingInfluenceRequiresCalibratedStatus:
      !rankingInfluenceAllowed || params.status === "calibrated",
    lowRatingReasonCoverageReadyForInfluence:
      !rankingInfluenceAllowed ||
      negativeRatings.length === 0 ||
      negativeRatingsWithReasonCount >= minNegativeRatingCount,
    noRawSecretFragments: true,
  };

  return {
    schemaVersion: 1,
    artifactFormat: "summary-feedback-calibration-report-v1",
    generatedBy: "npm run check:summary-feedback-calibration-report",
    model: {
      mode: "shadow",
      liveNetwork: false,
      rankingInfluenceAllowed: false,
      rawPostTextPersistedInReport: false,
      rawUserFeedbackPersistedInReport: false,
      riskClassifier: "deterministic-post-rating-risk-v1",
    },
    inputs: {
      database: "local-postgres",
      minMatchedRatingCount,
      minNegativeRatingCount,
    },
    scope,
    status: params.status,
    totals: {
      ratingCount: params.ratings.filter((item) => item.rating !== null).length,
      negativeRatingCount: negativeRatings.length,
      positiveRatingCount: positiveRatings.length,
      matchedFeedItemRatingCount,
      unmatchedRatingCount:
        params.matchedRatings.length - matchedFeedItemRatingCount,
      negativeRatingsWithReasonCount,
      negativeRatingsMissingReasonCount:
        negativeRatings.length - negativeRatingsWithReasonCount,
    },
    reasonCorrelation: buildReasonCorrelation(negativeRatings),
    riskSignalCounts: countedRecord(
      params.matchedRatings.flatMap((item) => item.riskSignals),
    ),
    providerNegativeRates: buildProviderNegativeRates(params.matchedRatings),
    qualityGates,
    blockingPassed: false,
  };
}

async function readRatings(pool: Pool): Promise<readonly RatingRow[]> {
  const result = await pool.query<RatingRow>(
    `
      select
        id::text as "id",
        tenant_id::text as "tenantId",
        workspace_id::text as "workspaceId",
        rating,
        target,
        created_at as "createdAt"
      from relevance_feedback_signals
      where action = 'rate_post'
      order by created_at desc, id desc
      limit 5000
    `,
  );

  return result.rows;
}

async function readFeedItems(pool: Pool): Promise<readonly FeedItemRow[]> {
  const result = await pool.query<FeedItemRow>(
    `
      select
        id::text as "id",
        source_item_id::text as "sourceItemId",
        tenant_id::text as "tenantId",
        workspace_id::text as "workspaceId",
        interest_id::text as "interestId",
        provider_key as "providerKey",
        canonical_url as "canonicalUrl",
        title,
        body_preview as "bodyPreview",
        published_at as "publishedAt",
        observed_at as "observedAt",
        provider_metadata as "providerMetadata"
      from feed_items
      order by observed_at desc, id desc
      limit 20000
    `,
  );

  return result.rows;
}

function matchRatings(
  ratings: readonly RatingRow[],
  feedItems: readonly FeedItemRow[],
): readonly MatchedRating[] {
  const feedById = new Map(feedItems.map((item) => [item.id, item]));
  const feedBySourceId = new Map(
    feedItems.map((item) => [item.sourceItemId, item]),
  );
  const duplicateKeys = duplicateFeedKeys(feedItems);

  return ratings.flatMap((rating) => {
    if (rating.rating === null) {
      return [];
    }
    const target = asRecord(rating.target);
    const feedItem =
      feedById.get(stringValue(target.feedItemId) ?? "") ??
      feedBySourceId.get(stringValue(target.sourceItemId) ?? "");

    return [
      {
        rating,
        reason: postRatingReason(target.postRatingReason),
        feedItem,
        riskSignals:
          feedItem === undefined
            ? []
            : riskSignalsForFeedItem(feedItem, duplicateKeys),
      },
    ];
  });
}

function riskSignalsForFeedItem(
  item: FeedItemRow,
  duplicateKeys: ReadonlySet<string>,
): readonly CalibrationReason[] {
  const metadata = asRecord(item.providerMetadata);
  const risks: CalibrationReason[] = [];
  const duplicateKey = feedDuplicateKey(item);
  const observedAgeHours =
    (item.observedAt.getTime() - item.publishedAt.getTime()) / (60 * 60 * 1000);

  if (duplicateKey !== undefined && duplicateKeys.has(duplicateKey)) {
    risks.push("duplicate");
  }
  if (observedAgeHours > 48) {
    risks.push("too_old");
  }
  if (!hasEngagementMetadata(item.providerKey, metadata)) {
    risks.push("weak_source");
  }
  if (!matchesConfiguredQuery(item, metadata)) {
    risks.push("off_topic");
  }
  if (risks.includes("weak_source") || risks.includes("off_topic")) {
    risks.push("low_quality");
  }

  return [...new Set(risks)].sort();
}

function buildReasonCorrelation(
  negativeRatings: readonly MatchedRating[],
): SummaryFeedbackCalibrationReport["reasonCorrelation"] {
  return calibrationReasons.map((reason) => {
    const ratings = negativeRatings.filter((item) => item.reason === reason);
    const matched = ratings.filter((item) => item.feedItem !== undefined);
    const riskMatchedCount = matched.filter((item) =>
      item.riskSignals.includes(reason),
    ).length;

    return {
      reason,
      negativeRatingCount: ratings.length,
      matchedFeedItemRatingCount: matched.length,
      riskMatchedCount,
      riskMatchRate:
        matched.length === 0
          ? 0
          : roundMetric(riskMatchedCount / matched.length),
    };
  });
}

function buildProviderNegativeRates(
  matchedRatings: readonly MatchedRating[],
): SummaryFeedbackCalibrationReport["providerNegativeRates"] {
  const counts = new Map<string, { total: number; negative: number }>();
  for (const item of matchedRatings) {
    const providerKey =
      item.feedItem?.providerKey ??
      stringValue(asRecord(item.rating.target).providerKey) ??
      "unknown";
    const current = counts.get(providerKey) ?? { total: 0, negative: 0 };
    counts.set(providerKey, {
      total: current.total + 1,
      negative: current.negative + ((item.rating.rating ?? 0) <= 2 ? 1 : 0),
    });
  }

  return [...counts.entries()]
    .map(([providerKey, value]) => ({
      providerKey,
      ratingCount: value.total,
      negativeRate:
        value.total === 0 ? 0 : roundMetric(value.negative / value.total),
    }))
    .sort(
      (left, right) =>
        right.negativeRate - left.negativeRate ||
        right.ratingCount - left.ratingCount ||
        left.providerKey.localeCompare(right.providerKey),
    );
}

function calibrationStatus(
  matchedRatings: readonly MatchedRating[],
): SummaryFeedbackCalibrationReport["status"] {
  const negativeRatings = matchedRatings.filter(
    (item) => (item.rating.rating ?? 0) <= 2,
  );
  const matchedFeedRatings = matchedRatings.filter(
    (item) => item.feedItem !== undefined,
  );

  if (matchedRatings.length === 0) {
    return "no_feedback";
  }
  if (
    matchedFeedRatings.length < minMatchedRatingCount ||
    negativeRatings.length < minNegativeRatingCount
  ) {
    return "insufficient_feedback";
  }

  const correlations = buildReasonCorrelation(negativeRatings).filter(
    (item) => item.matchedFeedItemRatingCount > 0,
  );
  const averageMatchRate =
    correlations.length === 0
      ? 0
      : correlations.reduce((sum, item) => sum + item.riskMatchRate, 0) /
        correlations.length;

  return averageMatchRate >= 0.6 ? "calibrated" : "attention_needed";
}

function dominantScope(
  ratings: readonly RatingRow[],
): SummaryFeedbackCalibrationReport["scope"] {
  const first = ratings[0];
  if (first === undefined) {
    return {};
  }

  return {
    tenantFingerprint: fingerprint(first.tenantId),
    workspaceFingerprint: fingerprint(first.workspaceId),
  };
}

function duplicateFeedKeys(
  feedItems: readonly FeedItemRow[],
): ReadonlySet<string> {
  const counts = new Map<string, number>();
  for (const item of feedItems) {
    const key = feedDuplicateKey(item);
    if (key !== undefined) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  return new Set(
    [...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key),
  );
}

function feedDuplicateKey(item: FeedItemRow): string | undefined {
  const canonicalHost = parseHost(item.canonicalUrl);
  const normalizedTitle = item.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (normalizedTitle.length < 12) {
    return undefined;
  }

  return `${canonicalHost ?? item.providerKey}:${normalizedTitle}`;
}

function matchesConfiguredQuery(
  item: FeedItemRow,
  metadata: Readonly<Record<string, unknown>>,
): boolean {
  const text = `${item.title} ${item.bodyPreview}`.toLowerCase();
  const query =
    stringValue(metadata.searchQuery) ??
    stringValue(asRecord(metadata.interestQuerySnapshot).query) ??
    stringValue(
      asRecord(asRecord(metadata.sourceBindingSnapshot).sourceQuery).query,
    );
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) {
    return true;
  }
  const matched = tokens.filter((token) => text.includes(token)).length;

  return matched >= Math.min(2, tokens.length);
}

function tokenizeQuery(value: string | undefined): readonly string[] {
  if (value === undefined) {
    return [];
  }

  return [
    ...new Set(
      value
        .toLowerCase()
        .replace(/https?:\/\/\S+/g, " ")
        .replace(/[^a-z0-9]+/g, " ")
        .split(/\s+/)
        .filter((token) => token.length >= 3)
        .filter(
          (token) =>
            !["and", "the", "for", "with", "from", "http", "https"].includes(
              token,
            ),
        ),
    ),
  ].slice(0, 8);
}

function hasEngagementMetadata(
  providerKey: string,
  metadata: Readonly<Record<string, unknown>>,
): boolean {
  if (providerKey === "reddit") {
    return (
      typeof metadata.score === "number" ||
      typeof metadata.numComments === "number"
    );
  }
  if (providerKey === "x-twitter") {
    return (
      typeof metadata.likes === "number" || typeof metadata.replies === "number"
    );
  }

  return true;
}

function postRatingReason(value: unknown): CalibrationReason | undefined {
  return calibrationReasons.includes(value as CalibrationReason)
    ? (value as CalibrationReason)
    : undefined;
}

function countedRecord(values: readonly string[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return Object.fromEntries(
    [...counts.entries()].sort((left, right) =>
      left[0].localeCompare(right[0]),
    ),
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
  ) as SummaryFeedbackCalibrationReport;
  const valid =
    report.schemaVersion === 1 &&
    report.artifactFormat === "summary-feedback-calibration-report-v1" &&
    report.generatedBy ===
      "npm run check:summary-feedback-calibration-report" &&
    report.model.mode === "shadow" &&
    report.model.liveNetwork === false &&
    report.model.rankingInfluenceAllowed === false &&
    report.model.rawPostTextPersistedInReport === false &&
    report.model.rawUserFeedbackPersistedInReport === false &&
    report.qualityGates.noRawSecretFragments === true &&
    report.blockingPassed === true &&
    noRawSecretFragments(report);

  if (!valid) {
    throw new Error(`${outputPath} failed existing artifact validation`);
  }

  console.log(
    `Summary feedback calibration report artifact OK (${report.status})`,
  );
}
