import {
  defaultCleanRealDayCollectionProviderKeys,
  type CleanRealDayCollectionProviderKey,
} from "./clean-real-day-collection-report";
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
  readonly failureFingerprint?: string;
};

export const recalculateProductionBlockingPolicyGates = (
  qualityGates: Readonly<Record<string, boolean>>,
  scans: readonly ProviderScanProof[],
  targetWindowProviderCounts: Readonly<Record<string, number>>,
): Record<string, boolean> => {
  const transparentPartialInput =
    explicitGitHubUnavailableIsTransparentPartialDailyInput({
      requestedProviderKeys: scans.map((scan) => scan.providerKey),
      scans,
      targetWindowProviderCounts,
    });
  const preservedGates = Object.fromEntries(
    Object.entries(qualityGates).filter(
      ([key]) =>
        key !== "everyRequestedProviderSucceeded" &&
        key !== "everyRequestedProviderHasTargetItems" &&
        key !== "everyRequestedProviderMeetsCollectionSlo" &&
        key !== "everyRequestedProviderMeetsBlockingCoveragePolicy" &&
        key !== "durableSnapshotProofMatchesRequestedDay",
    ),
  );

  return {
    ...preservedGates,
    everyRequestedProviderSucceeded:
      scans.every((scan) => scan.status === "succeeded") ||
      transparentPartialInput,
    everyRequestedProviderHasTargetItems:
      scans.every(
        (scan) => (targetWindowProviderCounts[scan.providerKey] ?? 0) > 0,
      ) || transparentPartialInput,
    everyRequestedProviderMeetsBlockingCoveragePolicy:
      scans.every(providerMeetsProductionBlockingPolicy) ||
      transparentPartialInput,
    durableSnapshotProofMatchesRequestedDay:
      qualityGates.durableSnapshotProofMatchesRequestedDay === true ||
      transparentPartialInput,
  };
};

export const explicitGitHubUnavailableIsTransparentPartialDailyInput =
  (params: {
    readonly requestedProviderKeys: readonly CleanRealDayCollectionProviderKey[];
    readonly scans: readonly ProviderScanProof[];
    readonly targetWindowProviderCounts: Readonly<Record<string, number>>;
  }): boolean => {
    if (
      !hasEveryDailyProviderExactlyOnce(params.requestedProviderKeys) ||
      !hasEveryDailyProviderExactlyOnce(
        params.scans.map((scan) => scan.providerKey),
      ) ||
      (params.targetWindowProviderCounts["github-trending-page"] ?? 0) !== 0
    ) {
      return false;
    }

    const github = onlyScanFor(params.scans, "github-trending-page");
    if (github === undefined || !isExplicitGitHubUnavailable(github)) {
      return false;
    }

    return nonGitHubDailyProviderKeys.every((providerKey) => {
      const scan = onlyScanFor(params.scans, providerKey);
      return (
        scan !== undefined &&
        (params.targetWindowProviderCounts[providerKey] ?? 0) > 0 &&
        providerMeetsProductionBlockingPolicy(scan)
      );
    });
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

const nonGitHubDailyProviderKeys = [
  "hacker-news",
  "reddit",
  "rss",
  "x-twitter",
] as const satisfies readonly CleanRealDayCollectionProviderKey[];

const hasEveryDailyProviderExactlyOnce = (
  providerKeys: readonly CleanRealDayCollectionProviderKey[],
): boolean =>
  providerKeys.length === defaultCleanRealDayCollectionProviderKeys.length &&
  defaultCleanRealDayCollectionProviderKeys.every(
    (providerKey) =>
      providerKeys.filter((candidate) => candidate === providerKey).length ===
      1,
  );

const onlyScanFor = (
  scans: readonly ProviderScanProof[],
  providerKey: CleanRealDayCollectionProviderKey,
): ProviderScanProof | undefined => {
  const matches = scans.filter((scan) => scan.providerKey === providerKey);
  return matches.length === 1 ? matches[0] : undefined;
};

const isExplicitGitHubUnavailable = (scan: ProviderScanProof): boolean => {
  const observation = scan.observability;
  const reasons = observation.slo.reasons;

  return (
    scan.providerKey === "github-trending-page" &&
    scan.status === "failed" &&
    scan.acquisitionMode === "durable_snapshot_reuse" &&
    observation.acquisitionMode === "durable_snapshot_reuse" &&
    scan.durableSnapshotProof === undefined &&
    typeof scan.bindingFingerprint === "string" &&
    scan.bindingFingerprint.length > 0 &&
    typeof scan.failureFingerprint === "string" &&
    scan.failureFingerprint.length > 0 &&
    observation.targetItemCount ===
      productionCollectionThresholds.githubTrendingFeedItems &&
    observation.collectedItemCount === 0 &&
    observation.acceptedItemCount === 0 &&
    observation.insertedItemCount === 0 &&
    observation.outsideWindowItemCount === 0 &&
    observation.paginationDuplicateItemCount === 0 &&
    observation.storageDuplicateItemCount === 0 &&
    observation.totalDuplicateItemCount === 0 &&
    observation.pageCount === 0 &&
    observation.paginationStopReason === "failed" &&
    observation.rateLimitEventCount === 0 &&
    observation.failureKind === undefined &&
    observation.coverageState === "unavailable" &&
    observation.slo.met === false &&
    observation.slo.targetItemCount ===
      productionCollectionThresholds.githubTrendingFeedItems &&
    observation.slo.evaluatedItemCount === 0 &&
    observation.slo.coverageRatio === 0 &&
    observation.slo.freshnessLagSeconds === undefined &&
    reasons.length === 2 &&
    reasons.includes("target_shortfall") &&
    reasons.includes("provider_unavailable") &&
    observation.slo.retryDisposition === "immediate" &&
    observation.freshness.oldestAcceptedPublishedAt === undefined &&
    observation.freshness.newestAcceptedPublishedAt === undefined &&
    observation.freshness.lagToWindowEndSeconds === undefined
  );
};
