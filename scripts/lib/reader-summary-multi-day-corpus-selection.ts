import { createHash } from "node:crypto";

import {
  compareUtf16CodeUnits,
  engagementMetricWeights,
  providerRankSelectionRule,
  selectionPolicyVersion,
} from "../capture-reader-summary-multi-day-quality-corpus";
import { canonicalJson } from "./reader-summary-quality-eval-support";

export type ValidatedCaptureSelectionRule = {
  readonly highPerProvider: number;
  readonly lowPerProvider: number;
  readonly unknownPerProvider: number;
};

type ValidatedCorpusItem = {
  readonly feedItemId: string;
  readonly providerKey: string;
  readonly publishedAt: string;
  readonly engagementMetrics?: Readonly<Record<string, number>>;
  readonly selection: {
    readonly band: "high_engagement" | "low_engagement" | "unknown_engagement";
    readonly providerBandRank: number;
  };
};

export function validateCaptureSelectionRule(
  value: unknown,
  label: string,
): ValidatedCaptureSelectionRule {
  const expected = {
    selectionPolicyVersion,
    sourceTables: ["feed_items", "source_items"],
    status: "VISIBLE",
    period: "exact_utc_calendar_day",
    highEngagementItemsPerProvider: 8,
    lowEngagementItemsPerProvider: 4,
    unknownEngagementItemsPerProvider: 4,
    engagementStrengthFormula: "sum(weight * ln(1 + max(0, metric)))",
    engagementMetricWeights,
    providerRankRule: providerRankSelectionRule,
    highBandOrder:
      "engagement_strength_desc_then_published_at_asc_then_feed_item_id_asc",
    lowBandOrder:
      "engagement_strength_asc_then_published_at_asc_then_feed_item_id_asc",
    unknownBandOrder:
      "sha256_feed_item_id_asc_then_published_at_asc_then_feed_item_id_asc",
    lowBandExcludesHighBand: true,
    stringOrder: "utf16_code_unit_ascending",
    generatedOutputFieldsUsed: false,
  };
  if (!isRecord(value)) {
    throw new Error(`${label} selection rule is invalid`);
  }
  const variableCounts = {
    ...expected,
    highEngagementItemsPerProvider: value.highEngagementItemsPerProvider,
    lowEngagementItemsPerProvider: value.lowEngagementItemsPerProvider,
    unknownEngagementItemsPerProvider: value.unknownEngagementItemsPerProvider,
  };
  if (
    !isPositiveInteger(value.highEngagementItemsPerProvider) ||
    !isPositiveInteger(value.lowEngagementItemsPerProvider) ||
    !isPositiveInteger(value.unknownEngagementItemsPerProvider) ||
    value.unknownEngagementItemsPerProvider !==
      value.lowEngagementItemsPerProvider ||
    canonicalJson(value) !== canonicalJson(variableCounts)
  ) {
    throw new Error(`${label} selection rule is invalid`);
  }
  return {
    highPerProvider: Number(value.highEngagementItemsPerProvider),
    lowPerProvider: Number(value.lowEngagementItemsPerProvider),
    unknownPerProvider: Number(value.unknownEngagementItemsPerProvider),
  };
}

export function validateCaptureCorpusDay(params: {
  readonly day: Record<string, unknown>;
  readonly date: string;
  readonly providerByItemId: Map<string, string>;
  readonly selectionRule: ValidatedCaptureSelectionRule;
  readonly label: string;
}): ReadonlySet<string> {
  const { day, date, providerByItemId, selectionRule, label } = params;
  if (
    !hasExactKeys(day, [
      "collectionDate",
      "actualItemCount",
      "selectedItemCount",
      "providerCounts",
      "items",
    ]) ||
    !isNonNegativeInteger(day.actualItemCount) ||
    !isNonNegativeInteger(day.selectedItemCount) ||
    !Array.isArray(day.providerCounts) ||
    !Array.isArray(day.items) ||
    day.selectedItemCount !== day.items.length ||
    Number(day.actualItemCount) < Number(day.selectedItemCount)
  ) {
    throw new Error(`${label} contains an invalid corpus day`);
  }

  const selectedByProvider = new Map<string, number>();
  const highByProvider = new Map<string, number>();
  const lowByProvider = new Map<string, number>();
  const unknownByProvider = new Map<string, number>();
  const ids = new Set<string>();
  const items: ValidatedCorpusItem[] = [];
  for (const item of day.items) {
    const record = validateCorpusItem(item, date, label);
    items.push(record);
    if (ids.has(record.feedItemId) || providerByItemId.has(record.feedItemId)) {
      throw new Error(`${label} contains duplicate corpus item ids`);
    }
    ids.add(record.feedItemId);
    providerByItemId.set(record.feedItemId, record.providerKey);
    incrementCount(selectedByProvider, record.providerKey);
    incrementCount(
      record.selection.band === "high_engagement"
        ? highByProvider
        : record.selection.band === "low_engagement"
          ? lowByProvider
          : unknownByProvider,
      record.providerKey,
    );
  }

  validateProviderCounts({
    day,
    selectionRule,
    selectedByProvider,
    highByProvider,
    lowByProvider,
    unknownByProvider,
    items,
    label,
  });
  return ids;
}

function validateProviderCounts(params: {
  readonly day: Record<string, unknown>;
  readonly selectionRule: ValidatedCaptureSelectionRule;
  readonly selectedByProvider: ReadonlyMap<string, number>;
  readonly highByProvider: ReadonlyMap<string, number>;
  readonly lowByProvider: ReadonlyMap<string, number>;
  readonly unknownByProvider: ReadonlyMap<string, number>;
  readonly items: readonly ValidatedCorpusItem[];
  readonly label: string;
}): void {
  const {
    day,
    selectionRule,
    selectedByProvider,
    highByProvider,
    lowByProvider,
    unknownByProvider,
    items,
    label,
  } = params;
  const providerCounts = day.providerCounts as readonly unknown[];
  let actualTotal = 0;
  let selectedTotal = 0;
  const providerOrder: string[] = [];
  for (const count of providerCounts) {
    if (
      !isRecord(count) ||
      !hasExactKeys(count, [
        "providerKey",
        "actualItemCount",
        "selectedItemCount",
        "highEngagementCount",
        "lowEngagementCount",
        "unknownEngagementCount",
      ]) ||
      !isProviderKey(count.providerKey) ||
      providerOrder.includes(count.providerKey) ||
      !isNonNegativeInteger(count.actualItemCount) ||
      !isNonNegativeInteger(count.selectedItemCount) ||
      !isNonNegativeInteger(count.highEngagementCount) ||
      !isNonNegativeInteger(count.lowEngagementCount) ||
      !isNonNegativeInteger(count.unknownEngagementCount) ||
      count.selectedItemCount !==
        Number(count.highEngagementCount) +
          Number(count.lowEngagementCount) +
          Number(count.unknownEngagementCount) ||
      Number(count.actualItemCount) < Number(count.selectedItemCount) ||
      Number(count.highEngagementCount) > selectionRule.highPerProvider ||
      Number(count.lowEngagementCount) > selectionRule.lowPerProvider ||
      Number(count.unknownEngagementCount) > selectionRule.unknownPerProvider ||
      (Number(count.lowEngagementCount) > 0 &&
        Number(count.highEngagementCount) !== selectionRule.highPerProvider) ||
      count.selectedItemCount !==
        (selectedByProvider.get(count.providerKey) ?? 0) ||
      count.highEngagementCount !==
        (highByProvider.get(count.providerKey) ?? 0) ||
      count.lowEngagementCount !==
        (lowByProvider.get(count.providerKey) ?? 0) ||
      count.unknownEngagementCount !==
        (unknownByProvider.get(count.providerKey) ?? 0)
    ) {
      throw new Error(`${label} contains invalid provider counts`);
    }
    providerOrder.push(count.providerKey);
    actualTotal += Number(count.actualItemCount);
    selectedTotal += Number(count.selectedItemCount);
  }
  if (
    actualTotal !== day.actualItemCount ||
    selectedTotal !== day.selectedItemCount
  ) {
    throw new Error(`${label} corpus day counts are inconsistent`);
  }
  const expectedProviderOrder = [...selectedByProvider.keys()].sort(
    compareUtf16CodeUnits,
  );
  if (canonicalJson(providerOrder) !== canonicalJson(expectedProviderOrder)) {
    throw new Error(
      `${label} provider order is inconsistent with capture policy`,
    );
  }
  validateCaptureSelectionOrder(items, expectedProviderOrder, label);
}

function validateCorpusItem(
  value: unknown,
  date: string,
  label: string,
): ValidatedCorpusItem {
  if (!isRecord(value)) {
    throw new Error(`${label} contains an invalid corpus item`);
  }
  const required = [
    "feedItemId",
    "providerKey",
    "title",
    "publishedAt",
    "observedAt",
    "selection",
  ];
  const optional = [
    "bodyPreview",
    "authorHandle",
    "canonicalUrl",
    "engagementMetrics",
  ];
  if (
    !hasOnlyKeys(value, required, optional) ||
    !isNonEmptyString(value.feedItemId) ||
    !isProviderKey(value.providerKey) ||
    !isNonEmptyString(value.title) ||
    !isTimestamp(value.publishedAt) ||
    !String(value.publishedAt).startsWith(`${date}T`) ||
    !isTimestamp(value.observedAt) ||
    !isRecord(value.selection) ||
    !hasExactKeys(value.selection, ["band", "providerBandRank"]) ||
    !["high_engagement", "low_engagement", "unknown_engagement"].includes(
      String(value.selection.band),
    ) ||
    !Number.isSafeInteger(value.selection.providerBandRank) ||
    Number(value.selection.providerBandRank) < 1 ||
    optional
      .slice(0, 2)
      .some(
        (key) => value[key] !== undefined && !isNonEmptyString(value[key]),
      ) ||
    (value.engagementMetrics !== undefined &&
      !isCaptureEngagementMetrics(value.engagementMetrics))
  ) {
    throw new Error(`${label} contains an invalid corpus item`);
  }
  if (
    (value.selection.band === "unknown_engagement") !==
    (value.engagementMetrics === undefined)
  ) {
    throw new Error(`${label} engagement band does not match captured metrics`);
  }
  validateCorpusUrl(value.canonicalUrl, label);
  return value as unknown as ValidatedCorpusItem;
}

function validateCorpusUrl(value: unknown, label: string): void {
  if (value === undefined) {
    return;
  }
  try {
    const url = new URL(String(value));
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username !== "" ||
      url.password !== "" ||
      url.search !== "" ||
      url.hash !== ""
    ) {
      throw new Error("unsafe");
    }
  } catch {
    throw new Error(`${label} contains an unsafe corpus URL`);
  }
}

function validateCaptureSelectionOrder(
  items: readonly ValidatedCorpusItem[],
  providerOrder: readonly string[],
  label: string,
): void {
  const expected: ValidatedCorpusItem[] = [];
  for (const providerKey of providerOrder) {
    const providerItems = items.filter(
      (item) => item.providerKey === providerKey,
    );
    const high = providerItems
      .filter((item) => item.selection.band === "high_engagement")
      .sort(compareCapturedHigh);
    const low = providerItems
      .filter((item) => item.selection.band === "low_engagement")
      .sort(compareCapturedLow);
    const unknown = providerItems
      .filter((item) => item.selection.band === "unknown_engagement")
      .sort(compareCapturedUnknown);
    validateProviderBandRanks(high, label);
    validateProviderBandRanks(low, label);
    validateProviderBandRanks(unknown, label);
    const weakestHigh = high.at(-1);
    const strongestLow = low.at(-1);
    if (
      weakestHigh !== undefined &&
      strongestLow !== undefined &&
      compareCapturedHigh(weakestHigh, strongestLow) > 0
    ) {
      throw new Error(
        `${label} high/low engagement boundary is inconsistent with capture policy`,
      );
    }
    expected.push(...high, ...low, ...unknown);
  }
  if (
    canonicalJson(items.map((item) => item.feedItemId)) !==
    canonicalJson(expected.map((item) => item.feedItemId))
  ) {
    throw new Error(`${label} item order is inconsistent with capture policy`);
  }
}

function validateProviderBandRanks(
  items: readonly ValidatedCorpusItem[],
  label: string,
): void {
  if (
    items.some((item, index) => item.selection.providerBandRank !== index + 1)
  ) {
    throw new Error(`${label} provider band ranks are inconsistent`);
  }
}

function compareCapturedHigh(
  left: ValidatedCorpusItem,
  right: ValidatedCorpusItem,
): number {
  return (
    captureMetricStrength(right) - captureMetricStrength(left) ||
    compareCapturedTie(left, right)
  );
}

function compareCapturedLow(
  left: ValidatedCorpusItem,
  right: ValidatedCorpusItem,
): number {
  return (
    captureMetricStrength(left) - captureMetricStrength(right) ||
    compareCapturedTie(left, right)
  );
}

function compareCapturedUnknown(
  left: ValidatedCorpusItem,
  right: ValidatedCorpusItem,
): number {
  return (
    compareUtf16CodeUnits(sha256(left.feedItemId), sha256(right.feedItemId)) ||
    compareCapturedTie(left, right)
  );
}

function compareCapturedTie(
  left: ValidatedCorpusItem,
  right: ValidatedCorpusItem,
): number {
  return (
    compareUtf16CodeUnits(left.publishedAt, right.publishedAt) ||
    compareUtf16CodeUnits(left.feedItemId, right.feedItemId)
  );
}

function captureMetricStrength(item: ValidatedCorpusItem): number {
  return Object.entries(item.engagementMetrics ?? {})
    .sort(([left], [right]) => compareUtf16CodeUnits(left, right))
    .reduce((total, [key, value]) => {
      if (key === "providerRank") {
        return total + (value > 0 ? 1 / value : 0);
      }
      const weight =
        engagementMetricWeights[key as keyof typeof engagementMetricWeights];
      return total + weight * Math.log1p(Math.max(0, value));
    }, 0);
}

function isCaptureEngagementMetrics(
  value: unknown,
): value is Readonly<Record<string, number>> {
  if (!isRecord(value) || Object.keys(value).length === 0) {
    return false;
  }
  const allowedKeys = new Set([
    ...Object.keys(engagementMetricWeights),
    "providerRank",
  ]);
  return Object.entries(value).every(([key, entry]) => {
    if (
      !allowedKeys.has(key) ||
      typeof entry !== "number" ||
      !Number.isSafeInteger(entry)
    ) {
      return false;
    }
    if (key === "score") {
      return true;
    }
    if (key === "providerRank") {
      return entry >= 1;
    }
    if (key === "upvoteRatioBps") {
      return entry >= 0 && entry <= 10_000;
    }
    return entry >= 0;
  });
}

function incrementCount(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return sameStringSet(Object.keys(value), keys);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
): boolean {
  const keys = Object.keys(value);
  return (
    required.every((key) => keys.includes(key)) &&
    keys.every((key) => required.includes(key) || optional.includes(key))
  );
}

function sameStringSet(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length && right.every((value) => left.includes(value))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isTimestamp(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function isProviderKey(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]*$/u.test(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) && Number(value) >= 1 && Number(value) <= 100
  );
}
