import type {
  SourceQuery,
  SourceRuntimeConfig,
} from "@social-monitor/ingestion/ports";

import type { ProviderCollectionReadinessRetryPolicy } from "./targeted-provider-collection";
import { providerMeetsProductionBlockingPolicy } from "./production-collection-quality-policy";
import { fingerprint } from "./yesterday-social-replay-support";

type CollectionRetryTarget = {
  readonly providerKey: string;
  readonly sourceBindingId: string;
  readonly sourceQuery: SourceQuery;
  readonly config: SourceRuntimeConfig;
};

type CollectionRetryResult = {
  readonly providerKey: string;
  readonly status: "succeeded" | "failed" | "skipped";
};

type XReadinessResult = Parameters<
  typeof providerMeetsProductionBlockingPolicy
>[0];

export const xCollectionReadinessRetryDelaysMs = [
  15 * 60_000,
  50 * 60_000,
] as const;

export const xCollectionReadinessRetryPolicy = (
  enabled: boolean,
):
  | ProviderCollectionReadinessRetryPolicy<
      CollectionRetryTarget,
      XReadinessResult
    >
  | undefined =>
  enabled
    ? {
        delaysMs: xCollectionReadinessRetryDelaysMs,
        maxTotalAttempts: 3,
        shouldRetry: (target, result) =>
          target.providerKey === "x-twitter" &&
          result.providerKey === "x-twitter" &&
          (result.status === "succeeded" ||
            isTransientXReadinessFailure(result)) &&
          !providerMeetsProductionBlockingPolicy(result),
        onWait: ({ delayMs, attemptNumber }) =>
          console.log(
            `X collection below production minimum; readiness retry ${attemptNumber}/3 in ${Math.round(delayMs / 60_000)} minutes`,
          ),
      }
    : undefined;

const isTransientXReadinessFailure = (result: XReadinessResult): boolean =>
  result.status !== "succeeded" &&
  (result.observability.failureKind === "rate_limited" ||
    result.observability.failureKind === "unavailable" ||
    result.observability.failureKind === "unknown");

export const successfulXCollectionRetryPlanKey = (
  target: CollectionRetryTarget,
): string | undefined =>
  target.providerKey === "x-twitter"
    ? fingerprint(
        JSON.stringify({
          sourceBindingId: target.sourceBindingId,
          sourceQuery: target.sourceQuery,
          config: target.config,
        }),
      )
    : undefined;

export const shouldStopSuccessfulDuplicateXRetry = (
  result: CollectionRetryResult,
): boolean =>
  result.providerKey === "x-twitter" && result.status === "succeeded";
