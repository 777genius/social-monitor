import { createHash } from "node:crypto";

import type { JsonObject } from "@social-monitor/shared-kernel";
import {
  PROVIDER_SHAPES,
  KNOWN_PROVIDER_KEYS,
  type ProviderMetricShape,
  type MetricKind,
} from './source-engagement-provider-shapes';

export type SourceEngagementMetrics = {
  readonly score?: number;
  readonly comments?: number;
  readonly likes?: number;
  readonly reposts?: number;
  readonly replies?: number;
  readonly quotes?: number;
  readonly bookmarks?: number;
  readonly impressions?: number;
  readonly views?: number;
  readonly points?: number;
  readonly stars?: number;
  readonly forks?: number;
  readonly starsGained?: number;
  readonly providerRank?: number;
  readonly upvoteRatioBps?: number;
};

export type SourceEngagementMetricsQualityFlags = {
  readonly providerKnown: boolean;
  readonly metadataKindKnown: boolean;
  readonly invalidMetricValue: boolean;
  readonly conflictingAliases: boolean;
};

export type SourceEngagementMetricsBuildResult = {
  readonly metrics: SourceEngagementMetrics | null;
  readonly metricsFingerprint?: string;
  readonly providerMetadataPatch: JsonObject;
  readonly qualityFlags: SourceEngagementMetricsQualityFlags;
};

export const buildSourceEngagementMetrics = (params: {
  readonly providerKey: string;
  readonly metadata?: JsonObject;
}): SourceEngagementMetricsBuildResult => {
  const providerKey = params.providerKey.trim();
  const metadata = params.metadata ?? {};
  const metadataKind =
    typeof metadata.kind === "string" ? metadata.kind.trim() : "";
  const shape = PROVIDER_SHAPES.find(
    (candidate) =>
      candidate.providerKey === providerKey &&
      candidate.metadataKinds.includes(metadataKind),
  );
  const providerKnown = KNOWN_PROVIDER_KEYS.has(providerKey);

  if (shape === undefined) {
    return {
      metrics: null,
      providerMetadataPatch: {},
      qualityFlags: {
        providerKnown,
        metadataKindKnown: false,
        invalidMetricValue: false,
        conflictingAliases: false,
      },
    };
  }

  const valuesByKey = new Map<
    keyof SourceEngagementMetrics,
    readonly number[]
  >();
  let invalidMetricValue = false;
  let providerMetadataPatch: JsonObject = {};

  for (const metricPath of shape.metricPaths) {
    const value = valueAtPath(metadata, metricPath.path);
    if (!value.present) {
      continue;
    }
    const normalized = normalizeMetric(value.value, metricPath.kind);
    if (normalized === undefined) {
      invalidMetricValue = true;
      continue;
    }
    const existing = valuesByKey.get(metricPath.canonicalKey) ?? [];
    valuesByKey.set(metricPath.canonicalKey, [...existing, normalized]);
    providerMetadataPatch = setAtPath(
      providerMetadataPatch,
      metricPath.path,
      normalizedPatchValue(value.value),
    );
  }

  const metrics = Object.fromEntries(
    [...valuesByKey.entries()].map(([key, values]) => [key, values[0]]),
  ) as SourceEngagementMetrics;
  const hasMetrics = Object.keys(metrics).length > 0;
  const conflictingAliases = [...valuesByKey.values()].some(
    (values) => new Set(values).size > 1,
  );

  return {
    metrics: hasMetrics ? metrics : null,
    ...(hasMetrics
      ? { metricsFingerprint: fingerprintMetrics(metrics) }
      : {}),
    providerMetadataPatch,
    qualityFlags: {
      providerKnown: true,
      metadataKindKnown: true,
      invalidMetricValue,
      conflictingAliases,
    },
  };
};

export const sourceMetadataWithoutEngagementAndVolatileProvenance = (params: {
  readonly providerKey: string;
  readonly metadata?: JsonObject;
}): JsonObject => {
  const metadata = sourceMetadataWithoutEngagementMetrics(params);
  const shape = providerShape(params);
  if (shape === undefined) {
    return metadata;
  }
  return shape.volatileContentPaths.reduce(
    (current, path) => deleteAtPath(current, path),
    metadata,
  );
};

export const sourceMetadataWithoutEngagementMetrics = (params: {
  readonly providerKey: string;
  readonly metadata?: JsonObject;
}): JsonObject => {
  const metadata = canonicalObject(params.metadata ?? {});
  const shape = providerShape(params);
  return shape === undefined
    ? metadata
    : shape.metricPaths.reduce(
        (current, entry) => deleteAtPath(current, entry.path),
        metadata,
      );
};

const providerShape = (params: {
  readonly providerKey: string;
  readonly metadata?: JsonObject;
}): ProviderMetricShape | undefined => {
  const metadataKind =
    typeof params.metadata?.kind === "string"
      ? params.metadata.kind.trim()
      : "";
  return PROVIDER_SHAPES.find(
    (candidate) =>
      candidate.providerKey === params.providerKey.trim() &&
      candidate.metadataKinds.includes(metadataKind),
  );
};

const normalizeMetric = (
  value: unknown,
  kind: MetricKind,
): number | undefined => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    (!Number.isSafeInteger(value) && kind !== "ratio")
  ) {
    return undefined;
  }
  if (kind === "signed") {
    return Number.isInteger(value) ? value : undefined;
  }
  if (kind === "ratio") {
    return value >= 0 && value <= 1 ? Math.round(value * 10_000) : undefined;
  }
  if (!Number.isInteger(value) || value < 0) {
    return undefined;
  }
  if (kind === "rank" && value === 0) {
    return undefined;
  }
  return value;
};

const fingerprintMetrics = (metrics: SourceEngagementMetrics): string =>
  createHash("sha256")
    .update(JSON.stringify(canonical(metrics)))
    .digest("hex");

const valueAtPath = (
  value: JsonObject,
  path: readonly string[],
): { readonly present: boolean; readonly value?: unknown } => {
  let current: unknown = value;
  for (const segment of path) {
    if (!isRecord(current) || !Object.hasOwn(current, segment)) {
      return { present: false };
    }
    current = current[segment];
  }
  return { present: true, value: current };
};

const setAtPath = (
  object: JsonObject,
  path: readonly string[],
  value: JsonObject[string],
): JsonObject => {
  const [head, ...tail] = path;
  if (head === undefined) {
    return object;
  }
  if (tail.length === 0) {
    return { ...object, [head]: value };
  }
  const child = isRecord(object[head]) ? canonicalObject(object[head]) : {};
  return { ...object, [head]: setAtPath(child, tail, value) };
};

const deleteAtPath = (
  object: JsonObject,
  path: readonly string[],
): JsonObject => {
  const [head, ...tail] = path;
  if (head === undefined || !Object.hasOwn(object, head)) {
    return object;
  }
  if (tail.length === 0) {
    return Object.fromEntries(
      Object.entries(object).filter(([key]) => key !== head),
    );
  }
  if (!isRecord(object[head])) {
    return object;
  }
  const child = deleteAtPath(canonicalObject(object[head]), tail);
  return Object.keys(child).length === 0
    ? deleteAtPath(object, [head])
    : { ...object, [head]: child };
};

const normalizedPatchValue = (value: unknown): JsonObject[string] =>
  value as JsonObject[string];

const canonicalObject = (value: Readonly<Record<string, unknown>>): JsonObject =>
  canonical(value) as JsonObject;

const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(canonical);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  }
  return value;
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
