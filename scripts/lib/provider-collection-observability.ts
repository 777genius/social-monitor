import type {
  ProviderFailureKind,
  SourceFetchTelemetry,
  SourcePaginationStopReason,
  SourceRuntimeConfig,
} from "@social-monitor/ingestion/ports";
import {
  evaluateProviderCollectionSlo,
  type ProviderCollectionSloEvaluation,
} from "@social-monitor/ingestion/features/provider-collection-slo/provider-collection-slo-policy";

export type ProviderCollectionCoverageState =
  "complete" | "partial" | "degraded" | "unavailable";

export type ProviderAcquisitionMode =
  | "live_collection"
  | "durable_snapshot_reuse";

export type ProviderCollectionObservation = {
  readonly acquisitionMode?: ProviderAcquisitionMode;
  readonly targetItemCount: number | null;
  readonly collectedItemCount: number;
  readonly acceptedItemCount: number;
  readonly insertedItemCount: number;
  readonly outsideWindowItemCount: number;
  readonly paginationDuplicateItemCount: number;
  readonly storageDuplicateItemCount: number;
  readonly totalDuplicateItemCount: number;
  readonly pageCount: number;
  readonly paginationStopReason:
    | SourcePaginationStopReason
    | "durable_snapshot_reuse"
    | "failed"
    | "skipped";
  readonly rateLimitEventCount: number;
  readonly failureKind?: ProviderFailureKind;
  readonly coverageState: ProviderCollectionCoverageState;
  readonly slo: ProviderCollectionSloEvaluation;
  readonly freshness: {
    readonly oldestAcceptedPublishedAt?: string;
    readonly newestAcceptedPublishedAt?: string;
    readonly lagToWindowEndSeconds?: number;
  };
};

export const successfulProviderCollectionObservation = (params: {
  readonly telemetry: SourceFetchTelemetry | undefined;
  readonly fetched: number;
  readonly inserted: number;
  readonly storageDuplicates: number;
  readonly targetWindowEndedAt: Date;
  readonly maxFreshnessLagSeconds?: number;
}): ProviderCollectionObservation => {
  const targetItemCount = params.telemetry?.targetItemCount ?? params.fetched;
  const collectedItemCount =
    params.telemetry?.collectedItemCount ?? params.fetched;
  const acceptedItemCount =
    params.telemetry?.acceptedItemCount ?? params.fetched;
  const outsideWindowItemCount = params.telemetry?.outsideWindowItemCount ?? 0;
  const paginationDuplicateItemCount =
    params.telemetry?.paginationDuplicateItemCount ?? 0;
  const rateLimitEventCount = params.telemetry?.rateLimitEventCount ?? 0;
  const stopReason = params.telemetry?.paginationStopReason ?? "single_page";
  const newestAcceptedPublishedAt = params.telemetry?.newestAcceptedPublishedAt;
  const oldestAcceptedPublishedAt = params.telemetry?.oldestAcceptedPublishedAt;
  const slo = evaluateProviderCollectionSlo({
    targetItemCount,
    acceptedItemCount,
    ...(newestAcceptedPublishedAt === undefined
      ? {}
      : { newestAcceptedPublishedAt }),
    targetWindowEndedAt: params.targetWindowEndedAt,
    maxFreshnessLagSeconds: params.maxFreshnessLagSeconds ?? 21_600,
    paginationStopReason: stopReason,
    rateLimitEventCount,
  });

  return {
    acquisitionMode: "live_collection",
    targetItemCount,
    collectedItemCount,
    acceptedItemCount,
    insertedItemCount: params.inserted,
    outsideWindowItemCount,
    paginationDuplicateItemCount,
    storageDuplicateItemCount: params.storageDuplicates,
    totalDuplicateItemCount:
      paginationDuplicateItemCount + params.storageDuplicates,
    pageCount: params.telemetry?.pageCount ?? 1,
    paginationStopReason: stopReason,
    rateLimitEventCount,
    coverageState: coverageState(slo, acceptedItemCount, rateLimitEventCount),
    slo,
    freshness: {
      ...(oldestAcceptedPublishedAt === undefined
        ? {}
        : {
            oldestAcceptedPublishedAt: oldestAcceptedPublishedAt.toISOString(),
          }),
      ...(newestAcceptedPublishedAt === undefined
        ? {}
        : {
            newestAcceptedPublishedAt: newestAcceptedPublishedAt.toISOString(),
            lagToWindowEndSeconds: Math.max(
              0,
              Math.round(
                (params.targetWindowEndedAt.getTime() -
                  newestAcceptedPublishedAt.getTime()) /
                  1000,
              ),
            ),
          }),
    },
  };
};

export const unavailableProviderCollectionObservation = (params: {
  readonly targetItemCount?: number;
  readonly status: "failed" | "skipped";
  readonly acquisitionMode?: ProviderAcquisitionMode;
  readonly rateLimited?: boolean;
  readonly failureKind?: ProviderFailureKind;
  readonly targetWindowEndedAt: Date;
  readonly maxFreshnessLagSeconds?: number;
}): ProviderCollectionObservation => {
  const targetItemCount = params.targetItemCount ?? null;
  const rateLimitEventCount = params.rateLimited === true ? 1 : 0;
  const slo = evaluateProviderCollectionSlo({
    targetItemCount,
    acceptedItemCount: 0,
    targetWindowEndedAt: params.targetWindowEndedAt,
    maxFreshnessLagSeconds: params.maxFreshnessLagSeconds ?? 21_600,
    paginationStopReason: params.status,
    rateLimitEventCount,
    ...(params.failureKind === undefined
      ? {}
      : { failureKind: params.failureKind }),
  });

  return {
    acquisitionMode: params.acquisitionMode ?? "live_collection",
    targetItemCount,
    collectedItemCount: 0,
    acceptedItemCount: 0,
    insertedItemCount: 0,
    outsideWindowItemCount: 0,
    paginationDuplicateItemCount: 0,
    storageDuplicateItemCount: 0,
    totalDuplicateItemCount: 0,
    pageCount: 0,
    paginationStopReason: params.status,
    rateLimitEventCount,
    ...(params.failureKind === undefined
      ? {}
      : { failureKind: params.failureKind }),
    coverageState: "unavailable",
    slo,
    freshness: {},
  };
};

export const durableSnapshotReuseProviderCollectionObservation = (params: {
  readonly itemCount: number;
  readonly newestPublishedAt: Date;
  readonly targetWindowEndedAt: Date;
}): ProviderCollectionObservation => {
  const slo = evaluateProviderCollectionSlo({
    targetItemCount: params.itemCount,
    acceptedItemCount: params.itemCount,
    newestAcceptedPublishedAt: params.newestPublishedAt,
    targetWindowEndedAt: params.targetWindowEndedAt,
    maxFreshnessLagSeconds: 21_600,
    paginationStopReason: "single_page",
    rateLimitEventCount: 0,
  });

  return {
    acquisitionMode: "durable_snapshot_reuse",
    targetItemCount: params.itemCount,
    collectedItemCount: 0,
    acceptedItemCount: params.itemCount,
    insertedItemCount: 0,
    outsideWindowItemCount: 0,
    paginationDuplicateItemCount: 0,
    storageDuplicateItemCount: 0,
    totalDuplicateItemCount: 0,
    pageCount: 0,
    paginationStopReason: "durable_snapshot_reuse",
    rateLimitEventCount: 0,
    coverageState: slo.met ? "complete" : "partial",
    slo,
    freshness: {
      newestAcceptedPublishedAt: params.newestPublishedAt.toISOString(),
      lagToWindowEndSeconds: Math.max(
        0,
        Math.round(
          (params.targetWindowEndedAt.getTime() -
            params.newestPublishedAt.getTime()) /
            1000,
        ),
      ),
    },
  };
};

export const withProviderCollectionWindowProof = (params: {
  readonly observation: ProviderCollectionObservation;
  readonly windowItemCount: number;
  readonly newestPublishedAt?: Date;
  readonly targetWindowEndedAt: Date;
}): ProviderCollectionObservation => {
  const slo = evaluateProviderCollectionSlo({
    targetItemCount: params.observation.targetItemCount,
    acceptedItemCount: params.windowItemCount,
    ...(params.newestPublishedAt === undefined
      ? {}
      : { newestAcceptedPublishedAt: params.newestPublishedAt }),
    targetWindowEndedAt: params.targetWindowEndedAt,
    maxFreshnessLagSeconds: params.observation.slo.maxFreshnessLagSeconds,
    paginationStopReason:
      params.observation.paginationStopReason === "durable_snapshot_reuse"
        ? "single_page"
        : params.observation.paginationStopReason,
    rateLimitEventCount: params.observation.rateLimitEventCount,
    ...(params.observation.failureKind === undefined
      ? {}
      : { failureKind: params.observation.failureKind }),
  });

  return {
    ...params.observation,
    coverageState: coverageState(
      slo,
      params.windowItemCount,
      params.observation.rateLimitEventCount,
    ),
    slo,
  };
};

export const configuredProviderCollectionTargetItemCount = (
  config: SourceRuntimeConfig,
): number | undefined => {
  const adaptivePagination = recordValue(config.adaptivePagination);

  return firstPositiveInteger([
    adaptivePagination?.targetItems,
    config.maxItems,
    config.limit,
  ]);
};

const coverageState = (
  slo: ProviderCollectionSloEvaluation,
  acceptedItemCount: number,
  rateLimitEventCount: number,
): ProviderCollectionCoverageState => {
  if (acceptedItemCount === 0) {
    return "unavailable";
  }
  if (
    rateLimitEventCount > 0 ||
    slo.reasons.includes("partial_retryable_failure")
  ) {
    return "degraded";
  }

  return slo.met ? "complete" : "partial";
};

const recordValue = (
  value: unknown,
): Readonly<Record<string, unknown>> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;

const firstPositiveInteger = (values: readonly unknown[]): number | undefined =>
  values.find(
    (value): value is number =>
      typeof value === "number" && Number.isInteger(value) && value > 0,
  );
