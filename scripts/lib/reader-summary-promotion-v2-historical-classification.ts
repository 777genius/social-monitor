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
  authoritativeInputDigest: string;
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
      if (row.observedAt < dayEnd) validByDayEnd += 1;
      else {
        increment(
          limitations,
          row.providerKey,
          "authority_observed_after_day_end",
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
    authoritativeInputDigest: authorityDigest(input.date, rows),
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
  if (valid === validByDayEnd && providerLimitations.length === 0) {
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
  readonly policyVersion?: string;
}): string => {
  exactUtcDayEnd(input.date);
  if (!/^[0-9a-f]{64}$/u.test(input.authoritativeInputDigest)) {
    throw new Error("Historical promotion authoritative input digest is invalid");
  }
  const policyVersion =
    input.policyVersion ?? readerSummaryPromotionV2HistoricalPolicyVersion;
  if (policyVersion !== readerSummaryPromotionV2HistoricalPolicyVersion) {
    throw new Error("Historical promotion policy version is not V2");
  }
  return sha256(JSON.stringify({
    schemaVersion: "reader_summary.promotion_v2_rebuild_identity.v1",
    date: input.date,
    authoritativeInputDigest: input.authoritativeInputDigest,
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
): string => sha256(JSON.stringify({
  schemaVersion: "reader_summary.promotion_authority.v1",
  date,
  rows: rows.map((row) => ({
    feedItemId: row.feedItemId,
    providerKey: row.providerKey,
    publishedAt: row.publishedAt,
    observedAt: row.observedAt,
    providerMetadata: canonicalValue(row.providerMetadata),
  })),
}));

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
