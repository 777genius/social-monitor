import type { CleanRealDayCollectionProviderKey } from "./clean-real-day-collection-report";
import {
  githubTrendingDurableSnapshotBindingFingerprint,
  githubTrendingDurableSnapshotProofPassesInvariants,
  type GitHubTrendingDurableSnapshotProof,
} from "./github-trending-durable-snapshot-reuse";
import type { ProviderCollectionObservation } from "./provider-collection-observability";

export const productionCollectionThresholds = {
  githubTrendingFeedItems: 10,
  xTwitterVisibleFeedItems: 20,
  xTwitterCollectedFeedItems: 20,
  xCollectorCompletedRunRatePercent: 80,
  xCollectorUsableRunRatePercent: 80,
} as const;

type ProviderScanProof = {
  readonly providerKey: CleanRealDayCollectionProviderKey;
  readonly bindingFingerprint?: string;
  readonly status: "succeeded" | "failed" | "skipped";
  readonly acquisitionMode?: "live_collection" | "durable_snapshot_reuse";
  readonly observability: ProviderCollectionObservation;
  readonly durableSnapshotProof?: GitHubTrendingDurableSnapshotProof;
};

export const recalculateProductionBlockingPolicyGates = (
  qualityGates: Readonly<Record<string, boolean>>,
  scans: readonly ProviderScanProof[],
): Record<string, boolean> => {
  const preservedGates = Object.fromEntries(
    Object.entries(qualityGates).filter(
      ([key]) =>
        key !== "everyRequestedProviderMeetsCollectionSlo" &&
        key !== "everyRequestedProviderMeetsBlockingCoveragePolicy",
    ),
  );

  return {
    ...preservedGates,
    everyRequestedProviderMeetsBlockingCoveragePolicy: scans.every(
      providerMeetsProductionBlockingPolicy,
    ),
  };
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
    if (
      (scan.acquisitionMode ?? observation.acquisitionMode) ===
      "durable_snapshot_reuse"
    ) {
      return (
        scan.acquisitionMode === "durable_snapshot_reuse" &&
        scan.bindingFingerprint ===
          githubTrendingDurableSnapshotBindingFingerprint(
            scan.durableSnapshotProof?.group.sourceBindingId ?? "",
          ) &&
        githubTrendingDurableSnapshotProofPassesInvariants(
          scan.durableSnapshotProof,
        ) &&
        scan.durableSnapshotProof?.group.publishedAt ===
          observation.freshness.newestAcceptedPublishedAt &&
        observation.acquisitionMode === "durable_snapshot_reuse" &&
        observation.targetItemCount ===
          productionCollectionThresholds.githubTrendingFeedItems &&
        observation.collectedItemCount === 0 &&
        observation.acceptedItemCount ===
          productionCollectionThresholds.githubTrendingFeedItems &&
        observation.insertedItemCount === 0 &&
        observation.outsideWindowItemCount === 0 &&
        observation.paginationDuplicateItemCount === 0 &&
        observation.storageDuplicateItemCount === 0 &&
        observation.pageCount === 0 &&
        observation.paginationStopReason === "durable_snapshot_reuse" &&
        observation.rateLimitEventCount === 0 &&
        observation.slo.evaluatedItemCount ===
          productionCollectionThresholds.githubTrendingFeedItems
      );
    }
    return (
      scan.durableSnapshotProof === undefined &&
      observation.acquisitionMode !== "durable_snapshot_reuse" &&
      observation.collectedItemCount >=
        productionCollectionThresholds.githubTrendingFeedItems &&
      observation.slo.evaluatedItemCount >=
        productionCollectionThresholds.githubTrendingFeedItems &&
      observation.outsideWindowItemCount === 0 &&
      observation.slo.reasons.every((reason) => reason === "target_shortfall")
    );
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
