import type { ReaderSummaryArtifactProps } from "../../domain";
import type { ReaderSummaryCollectedFeedItemCoverage } from "../../ports";
import type {
  ReaderSummaryContentView,
  ReaderSummaryFreshnessView,
} from "./reader-summary-artifact-presenter";

export type ReaderSummaryCoverageView = {
  readonly collectedFeedItemCount?: number;
  readonly lowRelevanceFeedItemCount: number;
  readonly mutedFeedItemCount: number;
  readonly userRatedFeedItemCount: number;
  readonly selectedFeedItemCount: number;
  readonly storyClusterCount: number;
  readonly topReadCount: number;
  readonly citationCount: number;
  readonly providerCount: number;
  readonly interestCount: number;
  readonly duplicateFeedItemCount: number;
  readonly crossSourceClusterCount: number;
  readonly hasCrossProviderEvidence: boolean;
  readonly isSingleSource: boolean;
  readonly topProviderKeys: readonly string[];
  readonly topInterestIds: readonly string[];
  readonly windowStartedAt: string;
  readonly windowEndedAt: string;
  readonly freshnessStatus: ReaderSummaryFreshnessView["status"];
  readonly collectionCoverageState?: ReaderSummaryProviderCollectionHealthView["state"];
  readonly degradedProviderKeys: readonly string[];
  readonly providerBreakdown: readonly ReaderSummaryProviderCoverageView[];
  readonly topicBreakdown: readonly ReaderSummaryTopicCoverageView[];
  readonly queryBreakdown: readonly ReaderSummaryQueryCoverageView[];
};

export type ReaderSummaryProviderCoverageView = {
  readonly providerKey: string;
  readonly collectedFeedItemCount?: number;
  readonly lowRelevanceFeedItemCount: number;
  readonly mutedFeedItemCount: number;
  readonly userRatedFeedItemCount: number;
  readonly selectedFeedItemCount: number;
  readonly topReadCount: number;
  readonly citationCount: number;
  readonly collectionHealth?: ReaderSummaryProviderCollectionHealthView;
};

export type ReaderSummaryProviderCollectionHealthView = {
  readonly state: "complete" | "partial" | "degraded" | "unavailable";
  readonly scanCount: number;
  readonly targetItemCount?: number;
  readonly collectedItemCount: number;
  readonly acceptedItemCount: number;
  readonly insertedItemCount: number;
  readonly outsideWindowItemCount: number;
  readonly paginationDuplicateItemCount: number;
  readonly storageDuplicateItemCount: number;
  readonly pageCount: number;
  readonly paginationStopReasons: readonly string[];
  readonly failureKinds: readonly string[];
  readonly rateLimitEventCount: number;
  readonly oldestAcceptedPublishedAt?: string;
  readonly newestAcceptedPublishedAt?: string;
};

export type ReaderSummaryTopicCoverageView = {
  readonly topicKey: string;
  readonly topicLabel?: string;
  readonly collectedFeedItemCount: number;
  readonly lowRelevanceFeedItemCount: number;
  readonly mutedFeedItemCount: number;
  readonly userRatedFeedItemCount: number;
};

export type ReaderSummaryQueryCoverageView = {
  readonly query: string;
  readonly collectedFeedItemCount: number;
  readonly lowRelevanceFeedItemCount: number;
  readonly mutedFeedItemCount: number;
  readonly userRatedFeedItemCount: number;
};

export const buildReaderSummaryCoverageView = (
  snapshot: ReaderSummaryArtifactProps,
  content: Pick<ReaderSummaryContentView, "sourceMix" | "topReads">,
  freshness: ReaderSummaryFreshnessView,
  collectedCoverage: ReaderSummaryCollectedFeedItemCoverage | undefined,
): ReaderSummaryCoverageView => {
  const selectedFeedItemCount = new Set(
    (snapshot.promotionAttestations ?? []).flatMap((attestation) => [
      attestation.candidateId,
      ...attestation.supportFacts.map((fact) => fact.candidateId),
    ]),
  ).size;
  const collectedFeedItemCount =
    collectedCoverage === undefined
      ? undefined
      : Math.max(
          collectedCoverage.collectedFeedItemCount,
          selectedFeedItemCount,
        );
  const interestIds = countBy(
    snapshot.storyClusters.flatMap((cluster) => cluster.interestIds),
  );
  const topProviderKeys = content.sourceMix
    .filter(
      (source) =>
        source.itemCount > 0 ||
        source.citationCount > 0 ||
        source.storyClusterCount > 0,
    )
    .sort((left, right) => {
      const citationDiff = right.citationCount - left.citationCount;
      if (citationDiff !== 0) {
        return citationDiff;
      }
      const itemDiff = right.itemCount - left.itemCount;
      if (itemDiff !== 0) {
        return itemDiff;
      }
      const storyDiff = right.storyClusterCount - left.storyClusterCount;
      return storyDiff === 0
        ? left.providerKey.localeCompare(right.providerKey)
        : storyDiff;
    })
    .slice(0, 5)
    .map((source) => source.providerKey);
  const providerBreakdown = buildProviderBreakdown(content, collectedCoverage);
  const collectionCoverageState =
    aggregateCollectionCoverageState(providerBreakdown);

  return {
    ...(collectedCoverage === undefined ? {} : { collectedFeedItemCount }),
    lowRelevanceFeedItemCount:
      collectedCoverage?.lowRelevanceFeedItemCount ?? 0,
    mutedFeedItemCount: collectedCoverage?.mutedFeedItemCount ?? 0,
    userRatedFeedItemCount: collectedCoverage?.userRatedFeedItemCount ?? 0,
    selectedFeedItemCount,
    storyClusterCount: snapshot.storyClusters.length,
    topReadCount: content.topReads.length,
    citationCount: snapshot.citationMap.length,
    providerCount: content.sourceMix.length,
    interestCount: interestIds.size,
    duplicateFeedItemCount: snapshot.storyClusters.reduce(
      (total, cluster) => total + cluster.duplicateFeedItemIds.length,
      0,
    ),
    crossSourceClusterCount: snapshot.storyClusters.filter(
      (cluster) => cluster.providerKeys.length > 1,
    ).length,
    hasCrossProviderEvidence: snapshot.storyClusters.some(
      (cluster) => cluster.providerKeys.length > 1,
    ),
    isSingleSource:
      content.sourceMix.length <= 1 ||
      content.sourceMix.every((source) => source.singleSourceOnly),
    topProviderKeys,
    topInterestIds: [...interestIds.entries()]
      .sort((left, right) => {
        const countDiff = right[1] - left[1];
        return countDiff === 0 ? left[0].localeCompare(right[0]) : countDiff;
      })
      .slice(0, 5)
      .map(([interestId]) => interestId),
    windowStartedAt: snapshot.sourceWindow.startedAt.toISOString(),
    windowEndedAt: snapshot.sourceWindow.endedAt.toISOString(),
    freshnessStatus: freshness.status,
    ...(collectionCoverageState === undefined
      ? {}
      : { collectionCoverageState }),
    degradedProviderKeys: providerBreakdown
      .filter(
        (provider) =>
          provider.collectionHealth !== undefined &&
          provider.collectionHealth.state !== "complete",
      )
      .map((provider) => provider.providerKey),
    providerBreakdown,
    topicBreakdown: collectedCoverage?.topicBreakdown ?? [],
    queryBreakdown: collectedCoverage?.queryBreakdown ?? [],
  };
};

const buildProviderBreakdown = (
  content: Pick<ReaderSummaryContentView, "sourceMix" | "topReads">,
  collectedCoverage: ReaderSummaryCollectedFeedItemCoverage | undefined,
): readonly ReaderSummaryProviderCoverageView[] => {
  const providers = new Map<string, ReaderSummaryProviderCoverageView>();
  const upsert = (
    providerKey: string,
    patch: Partial<Omit<ReaderSummaryProviderCoverageView, "providerKey">>,
  ): void => {
    const key = providerKey.trim();
    if (key.length === 0) {
      return;
    }
    const current = providers.get(key) ?? emptyProviderCoverage(key);
    providers.set(key, { ...current, ...patch });
  };

  for (const source of content.sourceMix) {
    upsert(source.providerKey, {
      selectedFeedItemCount: source.itemCount,
      citationCount: source.citationCount,
    });
  }
  for (const read of content.topReads) {
    const key = read.providerKey.trim();
    if (key.length > 0) {
      upsert(key, {
        topReadCount: (providers.get(key)?.topReadCount ?? 0) + 1,
      });
    }
  }
  for (const provider of collectedCoverage?.providerBreakdown ?? []) {
    upsert(provider.providerKey, {
      collectedFeedItemCount: provider.collectedFeedItemCount,
      lowRelevanceFeedItemCount: provider.lowRelevanceFeedItemCount,
      mutedFeedItemCount: provider.mutedFeedItemCount,
      userRatedFeedItemCount: provider.userRatedFeedItemCount,
      ...(provider.collectionHealth === undefined
        ? {}
        : {
            collectionHealth: presentProviderCollectionHealth(
              provider.collectionHealth,
            ),
          }),
    });
  }

  return [...providers.values()]
    .map(normalizeProviderCollectedCount)
    .sort(compareProviderCoverage);
};

const emptyProviderCoverage = (
  providerKey: string,
): ReaderSummaryProviderCoverageView => ({
  providerKey,
  selectedFeedItemCount: 0,
  topReadCount: 0,
  citationCount: 0,
  lowRelevanceFeedItemCount: 0,
  mutedFeedItemCount: 0,
  userRatedFeedItemCount: 0,
});

const presentProviderCollectionHealth = (
  health: NonNullable<
    ReaderSummaryCollectedFeedItemCoverage["providerBreakdown"][number]["collectionHealth"]
  >,
): ReaderSummaryProviderCollectionHealthView => {
  const { oldestAcceptedPublishedAt, newestAcceptedPublishedAt, ...rest } =
    health;
  return {
    ...rest,
    ...(oldestAcceptedPublishedAt === undefined
      ? {}
      : {
          oldestAcceptedPublishedAt: collectionHealthTimestamp(
            oldestAcceptedPublishedAt,
          ),
        }),
    ...(newestAcceptedPublishedAt === undefined
      ? {}
      : {
          newestAcceptedPublishedAt: collectionHealthTimestamp(
            newestAcceptedPublishedAt,
          ),
        }),
  };
};

const collectionHealthTimestamp = (value: Date | string): string =>
  typeof value === "string" ? value : value.toISOString();

const aggregateCollectionCoverageState = (
  providers: readonly ReaderSummaryProviderCoverageView[],
): ReaderSummaryProviderCollectionHealthView["state"] | undefined => {
  const states = providers
    .map((provider) => provider.collectionHealth?.state)
    .filter(
      (state): state is ReaderSummaryProviderCollectionHealthView["state"] =>
        state !== undefined,
    );
  if (states.length === 0) {
    return undefined;
  }
  if (states.every((state) => state === "unavailable")) {
    return "unavailable";
  }
  if (states.some((state) => state === "degraded" || state === "unavailable")) {
    return "degraded";
  }
  return states.some((state) => state === "partial") ? "partial" : "complete";
};

const normalizeProviderCollectedCount = (
  provider: ReaderSummaryProviderCoverageView,
): ReaderSummaryProviderCoverageView =>
  provider.collectedFeedItemCount === undefined
    ? provider
    : {
        ...provider,
        collectedFeedItemCount: Math.max(
          provider.collectedFeedItemCount,
          provider.selectedFeedItemCount,
        ),
      };

const compareProviderCoverage = (
  left: ReaderSummaryProviderCoverageView,
  right: ReaderSummaryProviderCoverageView,
): number => {
  const collectedDiff =
    (right.collectedFeedItemCount ?? 0) - (left.collectedFeedItemCount ?? 0);
  if (collectedDiff !== 0) {
    return collectedDiff;
  }
  const selectedDiff = right.selectedFeedItemCount - left.selectedFeedItemCount;
  return selectedDiff === 0
    ? left.providerKey.localeCompare(right.providerKey)
    : selectedDiff;
};

const countBy = (values: readonly string[]): ReadonlyMap<string, number> => {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
};
