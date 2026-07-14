import type {
  SourceQuery,
  SourceRuntimeConfig,
} from "@social-monitor/ingestion/ports";

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
