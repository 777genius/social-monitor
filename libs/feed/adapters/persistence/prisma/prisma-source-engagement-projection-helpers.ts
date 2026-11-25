import type {
  ProjectSourceEngagementResult,
} from "@social-monitor/ingestion/ports";
import type { SourceEngagementMetrics } from "@social-monitor/ingestion/domain";
import {
  normalizeJsonObject,
  type JsonObject,
  type JsonValue,
} from "@social-monitor/shared-kernel";
import type { PrismaSourceEngagementSnapshotRecord } from "./prisma-source-engagement-client";

const metricKeys = [
  "score",
  "comments",
  "likes",
  "reposts",
  "replies",
  "quotes",
  "bookmarks",
  "impressions",
  "views",
  "points",
  "stars",
  "forks",
  "starsGained",
  "providerRank",
  "upvoteRatioBps",
] as const satisfies readonly (keyof SourceEngagementMetrics)[];

export const metricColumns = (
  metrics: SourceEngagementMetrics,
  includeMissing = false,
): Readonly<Record<string, bigint | number | null>> => {
  const columns: Record<string, bigint | number | null> = {};
  for (const key of metricKeys) {
    const value = metrics[key];
    if (value === undefined) {
      if (includeMissing) columns[key] = null;
      continue;
    }
    columns[key] =
      key === "providerRank" || key === "upvoteRatioBps"
        ? value
        : BigInt(value);
  }
  return columns;
};

export const metricsFromSnapshot = (
  snapshot: PrismaSourceEngagementSnapshotRecord | null,
): SourceEngagementMetrics | null => {
  if (snapshot === null) {
    return null;
  }
  return Object.fromEntries(
    metricKeys.flatMap((key) => {
      const value = snapshot[key];
      return value === null || value === undefined
        ? []
        : [[key, typeof value === "bigint" ? Number(value) : value]];
    }),
  ) as SourceEngagementMetrics;
};

export const normalizeMetricJson = (
  value: unknown,
): SourceEngagementMetrics | null => {
  const object = normalizeJsonObject(value);
  const metrics = Object.fromEntries(
    metricKeys.flatMap((key) => {
      const metric = object[key];
      return typeof metric === "number" && Number.isSafeInteger(metric)
        ? [[key, metric]]
        : [];
    }),
  ) as SourceEngagementMetrics;
  return Object.keys(metrics).length === 0 ? null : metrics;
};

export const deepMergeJson = (
  base: JsonObject,
  patch: JsonObject,
): JsonObject => {
  const merged: Record<string, JsonValue> = { ...base };
  for (const [key, patchValue] of Object.entries(patch)) {
    if (patchValue === undefined) {
      continue;
    }
    const baseValue = merged[key];
    merged[key] =
      isJsonObject(baseValue) && isJsonObject(patchValue)
        ? deepMergeJson(baseValue, patchValue)
        : patchValue;
  }
  return merged;
};

const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const maxDate = (left: Date | null, right: Date): Date =>
  left !== null && left.getTime() > right.getTime() ? left : right;

export const utcDay = (value: Date): Date =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));

export const emptyResult = (): ProjectSourceEngagementResult => ({
  currentSnapshotsUpdated: 0,
  observationsAppended: 0,
  metricChanges: 0,
  regressionsObserved: 0,
});

export const addResults = (
  left: ProjectSourceEngagementResult,
  right: ProjectSourceEngagementResult,
): ProjectSourceEngagementResult => ({
  currentSnapshotsUpdated:
    left.currentSnapshotsUpdated + right.currentSnapshotsUpdated,
  observationsAppended: left.observationsAppended + right.observationsAppended,
  metricChanges: left.metricChanges + right.metricChanges,
  regressionsObserved: left.regressionsObserved + right.regressionsObserved,
});

export const chunks = <T>(
  items: readonly T[],
  size: number,
): readonly (readonly T[])[] =>
  Array.from(
    { length: Math.ceil(items.length / size) },
    (_, index) => items.slice(index * size, (index + 1) * size),
  );

export const daysBefore = (value: Date, days: number): Date =>
  new Date(value.getTime() - days * 86_400_000);
