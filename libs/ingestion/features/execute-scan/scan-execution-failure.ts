import {
  emptyJsonObjectAsUndefined,
  normalizeJsonObject,
  type JsonObject,
} from "@social-monitor/shared-kernel";

import { SourceFetchError, type ProviderFailureKind } from "../../ports";

export const shouldEnqueueScanRetry = (error: unknown): boolean =>
  isRetryableScanFailure(error) && !isProviderRateLimitFailure(error);

export const isProviderRateLimitFailure = (error: unknown): boolean =>
  error instanceof SourceFetchError && error.kind === "rate_limited";

export const providerFailureKind = (
  error: unknown,
): ProviderFailureKind | undefined =>
  error instanceof SourceFetchError ? error.kind : undefined;

export const buildScanFailureMetadata = (
  error: unknown,
): JsonObject | undefined => {
  if (!(error instanceof SourceFetchError)) {
    return undefined;
  }

  return emptyJsonObjectAsUndefined(
    normalizeJsonObject({
      providerKey: error.providerKey,
      kind: error.kind,
      retryable: error.retryable,
      ...(error.retryAfterMs === undefined
        ? {}
        : { retryAfterMs: error.retryAfterMs }),
      ...(error.rateLimitResetAt === undefined
        ? {}
        : { rateLimitResetAt: error.rateLimitResetAt.toISOString() }),
    }),
  );
};

export const formatScanFailureReason = (error: unknown): string => {
  if (error instanceof SourceFetchError) {
    return [
      `provider=${error.providerKey}`,
      `kind=${error.kind}`,
      `retryable=${String(error.retryable)}`,
      `message=${error.message}`,
    ].join(" ");
  }

  return error instanceof Error
    ? error.message
    : "Unknown scan execution failure";
};

const isRetryableScanFailure = (error: unknown): boolean =>
  error instanceof SourceFetchError ? error.retryable : true;
