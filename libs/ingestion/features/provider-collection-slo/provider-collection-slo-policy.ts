import type {
  ProviderFailureKind,
  SourcePaginationStopReason,
} from "../../ports";

export type ProviderCollectionSloReason =
  | "target_missing"
  | "target_shortfall"
  | "freshness_missing"
  | "freshness_lag_exceeded"
  | "rate_limited"
  | "partial_retryable_failure"
  | "provider_unavailable";

export type ProviderCollectionRetryDisposition =
  "none" | "immediate" | "deferred";

export type ProviderCollectionSloEvaluation = {
  readonly met: boolean;
  readonly targetItemCount: number | null;
  readonly evaluatedItemCount: number;
  readonly coverageRatio: number;
  readonly freshnessLagSeconds?: number;
  readonly maxFreshnessLagSeconds: number;
  readonly reasons: readonly ProviderCollectionSloReason[];
  readonly retryDisposition: ProviderCollectionRetryDisposition;
};

export const evaluateProviderCollectionSlo = (params: {
  readonly targetItemCount: number | null;
  readonly acceptedItemCount: number;
  readonly newestAcceptedPublishedAt?: Date;
  readonly targetWindowEndedAt: Date;
  readonly maxFreshnessLagSeconds: number;
  readonly paginationStopReason:
    SourcePaginationStopReason | "failed" | "skipped";
  readonly rateLimitEventCount: number;
  readonly failureKind?: ProviderFailureKind;
}): ProviderCollectionSloEvaluation => {
  const coverageRatio = coverage(
    params.acceptedItemCount,
    params.targetItemCount,
  );
  const freshnessLagSeconds =
    params.newestAcceptedPublishedAt === undefined
      ? undefined
      : Math.max(
          0,
          Math.round(
            (params.targetWindowEndedAt.getTime() -
              params.newestAcceptedPublishedAt.getTime()) /
              1000,
          ),
        );
  const reasons = reasonsFor({ ...params, freshnessLagSeconds });

  return {
    met: reasons.length === 0,
    targetItemCount: params.targetItemCount,
    evaluatedItemCount: params.acceptedItemCount,
    coverageRatio,
    ...(freshnessLagSeconds === undefined ? {} : { freshnessLagSeconds }),
    maxFreshnessLagSeconds: params.maxFreshnessLagSeconds,
    reasons,
    retryDisposition: retryDisposition(reasons),
  };
};

const reasonsFor = (params: {
  readonly targetItemCount: number | null;
  readonly acceptedItemCount: number;
  readonly freshnessLagSeconds?: number;
  readonly maxFreshnessLagSeconds: number;
  readonly paginationStopReason:
    SourcePaginationStopReason | "failed" | "skipped";
  readonly rateLimitEventCount: number;
  readonly failureKind?: ProviderFailureKind;
}): readonly ProviderCollectionSloReason[] => {
  const reasons = new Set<ProviderCollectionSloReason>();
  if (params.targetItemCount === null || params.targetItemCount <= 0) {
    reasons.add("target_missing");
  } else if (params.acceptedItemCount < params.targetItemCount) {
    reasons.add("target_shortfall");
  }
  if (params.acceptedItemCount > 0) {
    if (params.freshnessLagSeconds === undefined) {
      reasons.add("freshness_missing");
    } else if (params.freshnessLagSeconds > params.maxFreshnessLagSeconds) {
      reasons.add("freshness_lag_exceeded");
    }
  }
  if (params.rateLimitEventCount > 0 || params.failureKind === "rate_limited") {
    reasons.add("rate_limited");
  }
  if (params.paginationStopReason === "partial_retryable_failure") {
    reasons.add("partial_retryable_failure");
  }
  if (
    params.acceptedItemCount === 0 &&
    (params.paginationStopReason === "failed" ||
      params.paginationStopReason === "skipped")
  ) {
    reasons.add("provider_unavailable");
  }

  return [...reasons];
};

const retryDisposition = (
  reasons: readonly ProviderCollectionSloReason[],
): ProviderCollectionRetryDisposition => {
  if (reasons.length === 0 || reasons.includes("target_missing")) {
    return "none";
  }
  if (reasons.includes("rate_limited")) {
    return "deferred";
  }

  return "immediate";
};

const coverage = (accepted: number, target: number | null): number =>
  target === null || target <= 0
    ? 0
    : Math.min(1, Math.max(0, accepted / target));
