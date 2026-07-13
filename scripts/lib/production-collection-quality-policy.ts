import type { CleanRealDayCollectionProviderKey } from "./clean-real-day-collection-report";
import type { ProviderCollectionObservation } from "./provider-collection-observability";

export const productionCollectionThresholds = {
  xTwitterVisibleFeedItems: 20,
  xTwitterCollectedFeedItems: 20,
  xCollectorCompletedRunRatePercent: 80,
  xCollectorUsableRunRatePercent: 80,
} as const;

type ProviderScanProof = {
  readonly providerKey: CleanRealDayCollectionProviderKey;
  readonly status: "succeeded" | "failed" | "skipped";
  readonly observability: ProviderCollectionObservation;
};

export const providerMeetsProductionBlockingPolicy = (
  scan: ProviderScanProof,
): boolean => {
  if (scan.status !== "succeeded") {
    return false;
  }

  const observation = scan.observability;
  const target = observation.targetItemCount;
  if (target === null || target <= 0) {
    return false;
  }

  if (scan.providerKey === "github-trending-page") {
    return observation.collectedItemCount >= target;
  }

  if (scan.providerKey === "hacker-news") {
    return meetsBoundedInventoryPolicy(observation, 0.7);
  }

  if (scan.providerKey === "x-twitter") {
    return (
      observation.slo.evaluatedItemCount >=
        productionCollectionThresholds.xTwitterVisibleFeedItems &&
      meetsBoundedInventoryPolicy(observation, 0.8)
    );
  }

  return observation.slo.met;
};

const meetsBoundedInventoryPolicy = (
  observation: ProviderCollectionObservation,
  minimumCoverageRatio: number,
): boolean =>
  observation.slo.coverageRatio >= minimumCoverageRatio &&
  observation.slo.reasons.every((reason) => reason === "target_shortfall");
