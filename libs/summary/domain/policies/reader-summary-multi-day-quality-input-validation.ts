import type {
  ReaderSummaryMultiDayActualDay,
  ReaderSummaryMultiDayGoldDay,
} from "./reader-summary-multi-day-quality-eval";

export const assertValidReaderSummaryMultiDayQualityInputs = (
  actualDays: readonly ReaderSummaryMultiDayActualDay[],
  goldDays: readonly ReaderSummaryMultiDayGoldDay[],
): void => {
  assertUniqueCollectionDates(actualDays, "actual");
  assertUniqueCollectionDates(goldDays, "gold");
  for (const actual of actualDays) {
    for (const cluster of actual.storyClusters) {
      assertNonEmptyString(
        cluster.id,
        `Actual story cluster id must be non-empty for ${actual.collectionDate}`,
      );
    }
    assertUniqueStrings(
      actual.storyClusters.map((cluster) => cluster.id),
      (clusterId) =>
        `Duplicate actual story cluster id ${clusterId} for ${actual.collectionDate}`,
    );
    const clusterIds = new Set(
      actual.storyClusters.map((cluster) => cluster.id),
    );
    const assignedClusterByFeedItemId = new Map<string, string>();
    for (const cluster of actual.storyClusters) {
      assertNonEmptyString(
        cluster.representativeFeedItemId,
        `Actual story cluster ${cluster.id} representative feed item id must be non-empty for ${actual.collectionDate}`,
      );
      if (cluster.providerKeys.length === 0) {
        throw new Error(
          `Actual story cluster ${cluster.id} has no provider keys for ${actual.collectionDate}`,
        );
      }
      for (const providerKey of cluster.providerKeys) {
        assertNonEmptyString(
          providerKey,
          `Actual story cluster ${cluster.id} provider key must be non-empty for ${actual.collectionDate}`,
        );
      }
      assertUniqueStrings(
        cluster.providerKeys,
        (providerKey) =>
          `Duplicate provider key ${providerKey} in actual cluster ${cluster.id} for ${actual.collectionDate}`,
      );
      for (const feedItemId of [
        cluster.representativeFeedItemId,
        ...cluster.duplicateFeedItemIds,
      ]) {
        assertNonEmptyString(
          feedItemId,
          `Actual story cluster ${cluster.id} feed item id must be non-empty for ${actual.collectionDate}`,
        );
        const assignedClusterId = assignedClusterByFeedItemId.get(feedItemId);
        if (assignedClusterId !== undefined) {
          throw new Error(
            assignedClusterId === cluster.id
              ? `Feed item ${feedItemId} appears more than once in actual cluster ${cluster.id} for ${actual.collectionDate}`
              : `Feed item ${feedItemId} is assigned to multiple actual clusters for ${actual.collectionDate}: ${assignedClusterId}, ${cluster.id}`,
          );
        }
        assignedClusterByFeedItemId.set(feedItemId, cluster.id);
      }
    }
    const knownFeedItemIds = new Set(assignedClusterByFeedItemId.keys());
    assertValidTopReadEntries(actual, assignedClusterByFeedItemId);
    for (const section of actual.narrativeSections) {
      if (section.citationFeedItemIds.length === 0) {
        throw new Error(
          `Actual narrative section has no citation feed items for ${actual.collectionDate}`,
        );
      }
      assertUniqueStrings(
        section.citationFeedItemIds,
        (feedItemId) =>
          `Duplicate actual narrative citation feed item ${feedItemId} for ${actual.collectionDate}`,
      );
      for (const feedItemId of section.citationFeedItemIds) {
        assertNonEmptyString(
          feedItemId,
          `Actual narrative citation feed item id must be non-empty for ${actual.collectionDate}`,
        );
        if (!knownFeedItemIds.has(feedItemId)) {
          throw new Error(
            `Actual narrative section references unknown feed item ${feedItemId} for ${actual.collectionDate}`,
          );
        }
      }
      if (
        section.storyClusterId !== undefined &&
        !clusterIds.has(section.storyClusterId)
      ) {
        throw new Error(
          `Narrative section references unknown actual story cluster ${section.storyClusterId} for ${actual.collectionDate}`,
        );
      }
    }
  }
  for (const gold of goldDays) {
    assertUniqueStrings(
      gold.rankingExpectations.map((expectation) => expectation.feedItemId),
      (feedItemId) =>
        `Duplicate ranking feed item ${feedItemId} for ${gold.collectionDate}`,
    );
  }
};

const assertValidTopReadEntries = (
  actual: ReaderSummaryMultiDayActualDay,
  assignedClusterByFeedItemId: ReadonlyMap<string, string>,
): void => {
  const cardRankByCitationFeedItemId = new Map<string, number>();
  for (let index = 0; index < actual.topReadEntries.length; index += 1) {
    const entry = actual.topReadEntries[index]!;
    const rank = index + 1;
    if (entry.citationFeedItemIds.length === 0) {
      throw new Error(
        `Actual top-read card ${rank} has no citation feed items for ${actual.collectionDate}`,
      );
    }
    assertUniqueStrings(
      entry.citationFeedItemIds,
      (feedItemId) =>
        `Duplicate actual top-read citation feed item ${feedItemId} in card ${rank} for ${actual.collectionDate}`,
    );
    const cardStoryClusterIds = new Set<string>();
    for (const feedItemId of entry.citationFeedItemIds) {
      assertNonEmptyString(
        feedItemId,
        `Actual top-read citation feed item id must be non-empty in card ${rank} for ${actual.collectionDate}`,
      );
      const storyClusterId = assignedClusterByFeedItemId.get(feedItemId);
      if (storyClusterId === undefined) {
        throw new Error(
          `Actual top-read card ${rank} references unknown feed item ${feedItemId} for ${actual.collectionDate}`,
        );
      }
      cardStoryClusterIds.add(storyClusterId);
      const previousRank = cardRankByCitationFeedItemId.get(feedItemId);
      if (previousRank !== undefined) {
        throw new Error(
          `Duplicate actual top-read citation feed item ${feedItemId} across cards ${previousRank} and ${rank} for ${actual.collectionDate}`,
        );
      }
      cardRankByCitationFeedItemId.set(feedItemId, rank);
    }
    if (cardStoryClusterIds.size !== 1) {
      throw new Error(
        `Actual top-read card ${rank} spans multiple story clusters for ${actual.collectionDate}: ${[...cardStoryClusterIds].join(", ")}`,
      );
    }
  }
};

const assertUniqueCollectionDates = <
  T extends { readonly collectionDate: string },
>(
  days: readonly T[],
  kind: "actual" | "gold",
): void => {
  assertUniqueStrings(
    days.map((day) => day.collectionDate),
    (collectionDate) => `Duplicate ${kind} collection date ${collectionDate}`,
  );
};

const assertUniqueStrings = (
  values: readonly string[],
  duplicateMessage: (value: string) => string,
): void => {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new Error(duplicateMessage(value));
    }
    seen.add(value);
  }
};

const assertNonEmptyString = (value: string, message: string): void => {
  if (value.trim().length === 0) {
    throw new Error(message);
  }
};
