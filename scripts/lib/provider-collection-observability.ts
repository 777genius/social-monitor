import type {
  ProviderFailureKind,
  SourceFetchTelemetry,
  SourcePaginationStopReason,
  SourceRuntimeConfig,
} from "@social-monitor/ingestion/ports";

export type ProviderCollectionCoverageState =
  "complete" | "partial" | "degraded" | "unavailable";

export type ProviderCollectionObservation = {
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
    SourcePaginationStopReason | "failed" | "skipped";
  readonly rateLimitEventCount: number;
  readonly failureKind?: ProviderFailureKind;
  readonly coverageState: ProviderCollectionCoverageState;
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

  return {
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
    coverageState: coverageState({
      targetItemCount,
      acceptedItemCount,
      rateLimitEventCount,
      stopReason,
    }),
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
  readonly rateLimited?: boolean;
  readonly failureKind?: ProviderFailureKind;
}): ProviderCollectionObservation => ({
  targetItemCount: params.targetItemCount ?? null,
  collectedItemCount: 0,
  acceptedItemCount: 0,
  insertedItemCount: 0,
  outsideWindowItemCount: 0,
  paginationDuplicateItemCount: 0,
  storageDuplicateItemCount: 0,
  totalDuplicateItemCount: 0,
  pageCount: 0,
  paginationStopReason: params.status,
  rateLimitEventCount: params.rateLimited === true ? 1 : 0,
  ...(params.failureKind === undefined
    ? {}
    : { failureKind: params.failureKind }),
  coverageState: "unavailable",
  freshness: {},
});

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

const coverageState = (params: {
  readonly targetItemCount: number;
  readonly acceptedItemCount: number;
  readonly rateLimitEventCount: number;
  readonly stopReason: SourcePaginationStopReason;
}): ProviderCollectionCoverageState => {
  if (params.acceptedItemCount === 0) {
    return "unavailable";
  }
  if (
    params.rateLimitEventCount > 0 ||
    params.stopReason === "partial_retryable_failure"
  ) {
    return "degraded";
  }

  return params.acceptedItemCount >= params.targetItemCount
    ? "complete"
    : "partial";
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
