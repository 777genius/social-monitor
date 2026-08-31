import { createHash } from "node:crypto";

import {
  classifyFeedPromotionEligibility,
  type FeedPromotionEligibility,
} from "@social-monitor/feed/domain";
import type { JsonObject } from "@social-monitor/shared-kernel";

export const readerSummaryPromotionV2HistoricalPolicyVersion =
  "reader_post_promotion.v2" as const;

export type HistoricalPromotionAuthorityRow = Readonly<{
  feedItemId: string;
  providerKey: string;
  providerMetadata: JsonObject | null;
  publishedAt: string;
  observedAt: string;
  dayEndMetricProof: HistoricalPromotionDayEndMetricProof | null;
}>;

export type HistoricalPromotionDayEndMetricProof = Readonly<{
  source: "observation" | "daily-rollup";
  observedAt: string;
  completeThroughAt: string | null;
  metrics: JsonObject;
}>;

export type HistoricalPromotionProviderLimitation = Readonly<{
  providerKey: string;
  reason: string;
  rowCount: number;
}>;

export type HistoricalPromotionClassificationKind =
  | "exact-replayable"
  | "rebuildable-from-authoritative-input"
  | "unrebuildable";

export type HistoricalPromotionClassification = Readonly<{
  kind: HistoricalPromotionClassificationKind;
  reason:
    | "complete_authority_observed_by_original_day_end"
    | "retained_current_authoritative_provider_metadata"
    | "no_visible_feed_rows"
    | "no_structurally_valid_authoritative_promotion_metrics";
  authorityInspectionDigest: string;
  policyVersion: typeof readerSummaryPromotionV2HistoricalPolicyVersion;
  visibleFeedRowCount: number;
  promotionRelevantRowCount: number;
  structurallyValidRowCount: number;
  structurallyValidByOriginalDayEndCount: number;
  engagementSnapshotCount: number;
  engagementObservationByOriginalDayEndCount: number;
  providerCounts: Readonly<Record<string, number>>;
  providerLimitations: readonly HistoricalPromotionProviderLimitation[];
}>;

export type HistoricalPromotionAuthorityInspection = Readonly<{
  rows: readonly HistoricalPromotionAuthorityRow[];
  engagementSnapshotCount: number;
  engagementObservationByOriginalDayEndCount: number;
  retainedAuthorityDigest: string;
}>;

export const classifyHistoricalPromotionAuthority = (input: {
  readonly date: string;
  readonly inspection: HistoricalPromotionAuthorityInspection;
}): HistoricalPromotionClassification => {
  const dayEnd = exactUtcDayEnd(input.date);
  const rows = [...input.inspection.rows].sort(compareAuthorityRows);
  const providerCounts: Record<string, number> = {};
  const limitations = new Map<string, number>();
  let relevant = 0;
  let valid = 0;
  let validByDayEnd = 0;

  for (const row of rows) {
    providerCounts[row.providerKey] = (providerCounts[row.providerKey] ?? 0) + 1;
    const eligibility = classifyFeedPromotionEligibility({
      providerKey: row.providerKey,
      ...(row.providerMetadata === null
        ? {}
        : { providerMetadata: row.providerMetadata }),
    });
    if (isPromotionRelevant(row.providerKey, eligibility)) relevant += 1;
    if (eligibility.eligible) {
      valid += 1;
      if (hasExactDayEndMetricProof(row, eligibility, dayEnd)) {
        validByDayEnd += 1;
      } else {
        increment(
          limitations,
          row.providerKey,
          row.dayEndMetricProof === null
            ? "day_end_metric_proof_missing"
            : !hasCompleteDayEndAuthority(row.dayEndMetricProof, dayEnd)
              ? "day_end_authority_not_complete"
            : "day_end_metric_value_mismatch",
        );
      }
      continue;
    }
    if (isAuthorityLimitation(eligibility)) {
      increment(limitations, row.providerKey, eligibility.reason);
    }
  }

  const providerLimitations = [...limitations.entries()]
    .map(([key, rowCount]) => {
      const [providerKey, reason] = key.split("\u0000");
      return { providerKey: providerKey!, reason: reason!, rowCount };
    })
    .sort((left, right) =>
      left.providerKey.localeCompare(right.providerKey) ||
      left.reason.localeCompare(right.reason),
    );
  const common = {
    authorityInspectionDigest: authorityDigest(input.date, rows, input.inspection),
    policyVersion: readerSummaryPromotionV2HistoricalPolicyVersion,
    visibleFeedRowCount: rows.length,
    promotionRelevantRowCount: relevant,
    structurallyValidRowCount: valid,
    structurallyValidByOriginalDayEndCount: validByDayEnd,
    engagementSnapshotCount: input.inspection.engagementSnapshotCount,
    engagementObservationByOriginalDayEndCount:
      input.inspection.engagementObservationByOriginalDayEndCount,
    providerCounts: sortedRecord(providerCounts),
    providerLimitations,
  } as const;

  if (rows.length === 0) {
    return { ...common, kind: "unrebuildable", reason: "no_visible_feed_rows" };
  }
  if (valid === 0) {
    return {
      ...common,
      kind: "unrebuildable",
      reason: "no_structurally_valid_authoritative_promotion_metrics",
    };
  }
  if (relevant === valid && valid === validByDayEnd &&
      providerLimitations.length === 0) {
    return {
      ...common,
      kind: "exact-replayable",
      reason: "complete_authority_observed_by_original_day_end",
    };
  }
  return {
    ...common,
    kind: "rebuildable-from-authoritative-input",
    reason: "retained_current_authoritative_provider_metadata",
  };
};

export const historicalPromotionRebuildIdentity = (input: {
  readonly date: string;
  readonly authoritativeInputDigest: string;
  readonly authorityInspectionDigest: string;
  readonly policyVersion?: string;
}): string => {
  exactUtcDayEnd(input.date);
  if (!/^[0-9a-f]{64}$/u.test(input.authoritativeInputDigest)) {
    throw new Error("Historical promotion authoritative input digest is invalid");
  }
  if (!/^[0-9a-f]{64}$/u.test(input.authorityInspectionDigest)) {
    throw new Error("Historical promotion authority inspection digest is invalid");
  }
  const policyVersion =
    input.policyVersion ?? readerSummaryPromotionV2HistoricalPolicyVersion;
  if (policyVersion !== readerSummaryPromotionV2HistoricalPolicyVersion) {
    throw new Error("Historical promotion policy version is not V2");
  }
  return sha256(JSON.stringify({
    schemaVersion: "reader_summary.promotion_v2_rebuild_identity.v3",
    date: input.date,
    authoritativeInputDigest: input.authoritativeInputDigest,
    authorityInspectionDigest: input.authorityInspectionDigest,
    policyVersion,
  }));
};

export const assertClosedUtcDate = (date: string, now: Date): void => {
  exactUtcDayEnd(date);
  if (date >= now.toISOString().slice(0, 10)) {
    throw new Error(`Historical promotion date ${date} is not a closed UTC date`);
  }
};

const authorityDigest = (
  date: string,
  rows: readonly HistoricalPromotionAuthorityRow[],
  inspection: HistoricalPromotionAuthorityInspection,
): string => sha256(JSON.stringify({
  schemaVersion: "reader_summary.promotion_authority.v3",
  date,
  retainedAuthorityDigest: requiredAuthorityDigest(
    inspection.retainedAuthorityDigest,
  ),
  engagementSnapshotCount: inspection.engagementSnapshotCount,
  engagementObservationByOriginalDayEndCount:
    inspection.engagementObservationByOriginalDayEndCount,
  rows: rows.map((row) => ({
    feedItemId: row.feedItemId,
    providerKey: row.providerKey,
    publishedAt: row.publishedAt,
    observedAt: row.observedAt,
    providerMetadata: canonicalValue(row.providerMetadata),
    dayEndMetricProof: canonicalValue(row.dayEndMetricProof),
  })),
}));

const requiredAuthorityDigest = (value: string): string => {
  if (!/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error("Historical promotion retained authority digest is invalid");
  }
  return value;
};

const hasExactDayEndMetricProof = (
  row: HistoricalPromotionAuthorityRow,
  eligibility: Extract<FeedPromotionEligibility, { readonly eligible: true }>,
  dayEnd: string,
): boolean => {
  const proof = row.dayEndMetricProof;
  if (proof === null || !timestampBefore(proof.observedAt, dayEnd) ||
      !hasCompleteDayEndAuthority(proof, dayEnd)) return false;
  const metric = (key: string): number | undefined => {
    const value = proof.metrics[key];
    return typeof value === "number" && Number.isSafeInteger(value)
      ? value
      : undefined;
  };
  switch (eligibility.providerFamily) {
    case "x": {
      const metrics = eligibility.metrics as { likes: number; reposts: number };
      return metric("likes") === metrics.likes &&
        metric("reposts") === metrics.reposts;
    }
    case "reddit": {
      const metrics = eligibility.metrics as {
        score: number; upvoteRatio?: number;
      };
      const ratio = metrics.upvoteRatio;
      return metric("score") === metrics.score &&
        (ratio === undefined || metric("upvoteRatioBps") ===
          Math.round(ratio * 10_000));
    }
    case "hacker_news": {
      const metrics = eligibility.metrics as { points: number };
      return metric("points") === metrics.points;
    }
    case "github":
      // The retained engagement history has cumulative stars/forks but not the
      // 24/48-hour deltas consumed by Promotion V2. It cannot prove an exact
      // historical GitHub ranking input.
      return false;
  }
};

const hasCompleteDayEndAuthority = (
  proof: HistoricalPromotionDayEndMetricProof,
  dayEnd: string,
): boolean => proof.source === "daily-rollup" &&
  proof.completeThroughAt !== null &&
  timestampAtOrAfter(proof.completeThroughAt, dayEnd);

const timestampBefore = (value: string, boundary: string): boolean => {
  const parsed = Date.parse(value);
  const limit = Date.parse(boundary);
  return Number.isFinite(parsed) && Number.isFinite(limit) && parsed < limit;
};

const timestampAtOrAfter = (value: string, boundary: string): boolean => {
  const parsed = Date.parse(value);
  const limit = Date.parse(boundary);
  return Number.isFinite(parsed) && Number.isFinite(limit) && parsed >= limit;
};

const canonicalValue = (value: unknown): unknown => {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalValue);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalValue(item)]),
  );
};

const exactUtcDayEnd = (date: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) {
    throw new Error("Historical promotion date must use YYYY-MM-DD");
  }
  const start = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || start.toISOString().slice(0, 10) !== date) {
    throw new Error("Historical promotion date must be a real UTC date");
  }
  start.setUTCDate(start.getUTCDate() + 1);
  return start.toISOString();
};

const compareAuthorityRows = (
  left: HistoricalPromotionAuthorityRow,
  right: HistoricalPromotionAuthorityRow,
): number => left.feedItemId.localeCompare(right.feedItemId) ||
  left.providerKey.localeCompare(right.providerKey);

const isPromotionRelevant = (
  providerKey: string,
  eligibility: FeedPromotionEligibility,
): boolean => eligibility.eligible ||
  eligibility.reason !== "appendix_only" &&
  eligibility.reason !== "unknown_provider" ||
  ["x-twitter", "twitter", "x", "reddit", "hacker-news", "github-repo-radar"]
    .includes(providerKey.trim().toLocaleLowerCase("en-US"));

const isAuthorityLimitation = (
  eligibility: Exclude<FeedPromotionEligibility, { readonly eligible: true }>,
): boolean => eligibility.reason !== "appendix_only" &&
  eligibility.reason !== "unknown_provider" &&
  eligibility.reason !== "forbidden_content_kind";

const increment = (
  counts: Map<string, number>,
  providerKey: string,
  reason: string,
): void => {
  const key = `${providerKey}\u0000${reason}`;
  counts.set(key, (counts.get(key) ?? 0) + 1);
};

const sortedRecord = (
  value: Readonly<Record<string, number>>,
): Readonly<Record<string, number>> => Object.fromEntries(
  Object.entries(value).sort(([left], [right]) => left.localeCompare(right)),
);

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");
