import type {
  SourceFetchTelemetry,
  SourceProviderScanContext,
  SourceProviderScanResult,
  SourceRuntimeConfig,
} from '../../ports';
import type { ScanWithTelemetryResult } from './source-provider-pagination';

export const compactUnique = (values: readonly string[]): readonly string[] => [
  ...new Set(values),
];

export const buildSourceFetchTelemetry = (params: {
  readonly scanned: ScanWithTelemetryResult;
  readonly filteredResult: SourceProviderScanResult;
  readonly context: SourceProviderScanContext;
}): SourceFetchTelemetry => {
  const publishedTimes = params.filteredResult.items
    .map((item) => item.publishedAt.getTime())
    .filter(Number.isFinite);
  const targetPublishedWindow = readTargetPublishedWindow(
    params.context.config,
  );

  return {
    ...(params.scanned.result.collection === undefined ? {} : {
      collectionComplete: params.scanned.result.collection.complete,
      backfillPending: params.scanned.result.collection.backfillPending,
      ...(params.scanned.result.collection.contentComplete === undefined ? {} : {
        contentComplete: params.scanned.result.collection.contentComplete,
      }),
    }),
    targetItemCount: params.scanned.targetItemCount,
    collectedItemCount: params.scanned.result.items.length,
    acceptedItemCount: params.filteredResult.items.length,
    outsideWindowItemCount:
      params.scanned.result.items.length - params.filteredResult.items.length,
    pageCount: params.scanned.pageCount,
    paginationDuplicateItemCount: params.scanned.paginationDuplicateItemCount,
    paginationStopReason: params.scanned.paginationStopReason,
    rateLimitEventCount: params.scanned.rateLimitEventCount ??
      countRateLimitWarnings(params.scanned.result.warnings),
    ...(targetPublishedWindow === undefined
      ? {}
      : {
          targetPublishedWindowStartedAt: targetPublishedWindow.start,
          targetPublishedWindowEndedAt: targetPublishedWindow.end,
        }),
    ...(publishedTimes.length === 0
      ? {}
      : {
          oldestAcceptedPublishedAt: new Date(Math.min(...publishedTimes)),
          newestAcceptedPublishedAt: new Date(Math.max(...publishedTimes)),
        }),
  };
};

export const countRateLimitWarnings = (warnings: readonly string[]): number =>
  warnings.filter((warning) => {
    const normalized = warning.toLowerCase();

    return (
      normalized.includes("partial_rate_limit") ||
      normalized.includes("rate_limited")
    );
  }).length;

export const filterByTargetPublishedWindow = (
  result: SourceProviderScanResult,
  context: SourceProviderScanContext,
): SourceProviderScanResult => {
  const window = readTargetPublishedWindow(context.config);
  if (window === undefined) {
    return result;
  }

  const inWindow = (publishedAt: Date): boolean =>
    publishedAt.getTime() >= window.start.getTime() &&
    publishedAt.getTime() < window.end.getTime();
  const inWindowUnits = result.conversationUnits?.filter((unit) =>
    inWindow(unit.publishedAt),
  );
  const supportingRootExternalIds = new Set(
    inWindowUnits?.map((unit) => unit.rootExternalId) ?? [],
  );
  const items = result.items.filter(
    (item) => inWindow(item.publishedAt) || supportingRootExternalIds.has(item.externalId),
  );
  const retainedRootExternalIds = new Set(items.map((item) => item.externalId));
  const conversationUnits = inWindowUnits?.filter((unit) =>
    retainedRootExternalIds.has(unit.rootExternalId),
  );
  if (items.length === result.items.length &&
      conversationUnits?.length === result.conversationUnits?.length) {
    return result;
  }

  return {
    ...result,
    items,
    conversationUnits,
    warnings: items.length === result.items.length ? result.warnings : compactUnique([
      ...result.warnings,
      [
        "target_published_window.filtered",
        `kept=${items.length}`,
        `dropped=${result.items.length - items.length}`,
      ].join(";"),
    ]),
  };
};

const readTargetPublishedWindow = (
  config: SourceRuntimeConfig | undefined,
): { readonly start: Date; readonly end: Date } | undefined => {
  const raw = readRecord(config?.targetPublishedWindow);
  const start = readDate(raw?.startInclusive);
  const end = readDate(raw?.endExclusive);

  return start !== undefined && end !== undefined && start < end
    ? { start, end }
    : undefined;
};

const readRecord = (
  value: unknown,
): Readonly<Record<string, unknown>> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;

const readDate = (value: unknown): Date | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? undefined : date;
};
