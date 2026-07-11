import {
  emptyJsonObjectAsUndefined,
  normalizeJsonObject,
  type JsonObject,
} from "@social-monitor/shared-kernel";

import type {
  ProviderFailureKind,
  SourceFetchTelemetry,
  SourceQuery,
} from "../../ports";

type PersistedScanCollectionStatus = "succeeded" | "failed";

export const successfulScanCollectionExecutionMetadata = (params: {
  readonly providerKey: string;
  readonly sourceQuery: SourceQuery;
  readonly telemetry: SourceFetchTelemetry | undefined;
  readonly insertedItemCount: number;
  readonly storageDuplicateItemCount: number;
  readonly candidateMemorySuppressedItemCount?: number;
}): JsonObject | undefined => {
  const window =
    telemetryWindow(params.telemetry) ?? queryWindow(params.sourceQuery);
  const telemetry = params.telemetry;

  return collectionMetadata({
    status: "succeeded",
    providerKey: params.providerKey,
    window,
    values:
      telemetry === undefined
        ? {
            insertedItemCount: params.insertedItemCount,
            storageDuplicateItemCount: params.storageDuplicateItemCount,
            candidateMemorySuppressedItemCount:
              params.candidateMemorySuppressedItemCount ?? 0,
          }
        : {
            targetItemCount: telemetry.targetItemCount,
            collectedItemCount: telemetry.collectedItemCount,
            acceptedItemCount: telemetry.acceptedItemCount,
            insertedItemCount: params.insertedItemCount,
            outsideWindowItemCount: telemetry.outsideWindowItemCount,
            paginationDuplicateItemCount:
              telemetry.paginationDuplicateItemCount,
            storageDuplicateItemCount: params.storageDuplicateItemCount,
            candidateMemorySuppressedItemCount:
              params.candidateMemorySuppressedItemCount ?? 0,
            pageCount: telemetry.pageCount,
            paginationStopReason: telemetry.paginationStopReason,
            rateLimitEventCount: telemetry.rateLimitEventCount,
            ...(telemetry.oldestAcceptedPublishedAt === undefined
              ? {}
              : {
                  oldestAcceptedPublishedAt:
                    telemetry.oldestAcceptedPublishedAt.toISOString(),
                }),
            ...(telemetry.newestAcceptedPublishedAt === undefined
              ? {}
              : {
                  newestAcceptedPublishedAt:
                    telemetry.newestAcceptedPublishedAt.toISOString(),
                }),
          },
  });
};

export const failedScanCollectionExecutionMetadata = (params: {
  readonly providerKey: string;
  readonly sourceQuery: SourceQuery;
  readonly rateLimited: boolean;
  readonly failureKind?: ProviderFailureKind;
}): JsonObject | undefined =>
  collectionMetadata({
    status: "failed",
    providerKey: params.providerKey,
    window: queryWindow(params.sourceQuery),
    values: {
      collectedItemCount: 0,
      acceptedItemCount: 0,
      insertedItemCount: 0,
      outsideWindowItemCount: 0,
      paginationDuplicateItemCount: 0,
      storageDuplicateItemCount: 0,
      candidateMemorySuppressedItemCount: 0,
      pageCount: 0,
      paginationStopReason: "failed",
      rateLimitEventCount: params.rateLimited ? 1 : 0,
      ...(params.failureKind === undefined
        ? {}
        : { failureKind: params.failureKind }),
    },
  });

const collectionMetadata = (params: {
  readonly status: PersistedScanCollectionStatus;
  readonly providerKey: string;
  readonly window: TargetPublishedWindow | undefined;
  readonly values: Readonly<Record<string, unknown>>;
}): JsonObject | undefined =>
  emptyJsonObjectAsUndefined(
    normalizeJsonObject({
      schemaVersion: 1,
      status: params.status,
      providerKey: params.providerKey.trim(),
      ...(params.window === undefined
        ? {}
        : {
            targetPublishedWindowStartedAt:
              params.window.startedAt.toISOString(),
            targetPublishedWindowEndedAt: params.window.endedAt.toISOString(),
          }),
      ...params.values,
    }),
  );

type TargetPublishedWindow = {
  readonly startedAt: Date;
  readonly endedAt: Date;
};

const telemetryWindow = (
  telemetry: SourceFetchTelemetry | undefined,
): TargetPublishedWindow | undefined =>
  validWindow(
    telemetry?.targetPublishedWindowStartedAt,
    telemetry?.targetPublishedWindowEndedAt,
  );

const queryWindow = (query: SourceQuery): TargetPublishedWindow | undefined => {
  const raw = recordValue(query.parameters?.targetPublishedWindow);
  return validWindow(
    dateValue(raw?.startInclusive),
    dateValue(raw?.endExclusive),
  );
};

const validWindow = (
  startedAt: Date | undefined,
  endedAt: Date | undefined,
): TargetPublishedWindow | undefined =>
  startedAt !== undefined && endedAt !== undefined && startedAt < endedAt
    ? { startedAt, endedAt }
    : undefined;

const recordValue = (
  value: unknown,
): Readonly<Record<string, unknown>> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;

const dateValue = (value: unknown): Date | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};
