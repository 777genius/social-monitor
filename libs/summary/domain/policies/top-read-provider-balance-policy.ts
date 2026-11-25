import type { TopReadCandidate } from "../entities/top-read";
import { compactUnique } from "../value-objects/summary-text";
import {
  topReadPrimaryMinimumForLimit,
  topReadProviderCapForLimit,
} from "./top-read-provider-diversity-policy";

export const primarySocialTopReadProviders = [
  "x-twitter",
  "reddit",
] as const;

export const selectProviderBalancedTopReads = (
  stories: readonly TopReadCandidate[],
  limit: number,
  providerKeyByStoryId: ReadonlyMap<string, string> = new Map(),
): readonly TopReadCandidate[] => {
  const normalizedLimit = normalizeTopReadLimit(limit);
  const selected: TopReadCandidate[] = [];
  const selectedIds = new Set<string>();
  const providerCounts = new Map<string, number>();
  const activeProviders = activeProviderKeys(stories, providerKeyByStoryId);
  const providerCap = topReadProviderCapForLimit({
    limit: normalizedLimit,
    activeProviderCount: activeProviders.length,
    primaryMinimum: topReadPrimaryMinimumForLimit(normalizedLimit),
  });
  const primaryMinimum = topReadPrimaryMinimumForLimit(normalizedLimit);
  const requiredPrimaryCounts = new Map(
    primarySocialTopReadProviders
      .filter((providerKey) =>
        stories.some(
          (story) =>
            topReadPrimaryProviderKey(story, providerKeyByStoryId) ===
            providerKey,
        ),
      )
      .map((providerKey) => [
        providerKey,
        Math.min(
          primaryMinimum,
          countTopReadStoriesForProvider(
            stories,
            providerKey,
            providerKeyByStoryId,
          ),
        ),
      ]),
  );

  const select = (story: TopReadCandidate): void => {
    if (
      selected.length >= normalizedLimit ||
      selectedIds.has(story.storyClusterId)
    ) {
      return;
    }
    selected.push(story);
    selectedIds.add(story.storyClusterId);
    const providerKey = topReadPrimaryProviderKey(
      story,
      providerKeyByStoryId,
    );
    providerCounts.set(providerKey, (providerCounts.get(providerKey) ?? 0) + 1);
  };

  for (const story of stories) {
    const providerKey = topReadPrimaryProviderKey(
      story,
      providerKeyByStoryId,
    );
    if ((providerCounts.get(providerKey) ?? 0) >= providerCap) {
      continue;
    }
    if (
      shouldReserveRemainingSlot({
        providerKey,
        selectedCount: selected.length,
        limit: normalizedLimit,
        providerCounts,
        requiredPrimaryCounts,
      })
    ) {
      continue;
    }
    select(story);
  }

  for (const story of stories) {
    const providerKey = topReadPrimaryProviderKey(
      story,
      providerKeyByStoryId,
    );
    if ((providerCounts.get(providerKey) ?? 0) >= providerCap) {
      continue;
    }
    select(story);
  }

  return selected;
};

export const countTopReadStoriesForProvider = (
  stories: readonly TopReadCandidate[],
  providerKey: string,
  providerKeyByStoryId: ReadonlyMap<string, string> = new Map(),
): number =>
  stories.filter(
    (story) =>
      topReadPrimaryProviderKey(story, providerKeyByStoryId) === providerKey,
  ).length;

export const normalizeTopReadLimit = (value: number): number => {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
    return 10;
  }

  return Math.min(value, 10);
};

const topReadPrimaryProviderKey = (
  story: TopReadCandidate,
  providerKeyByStoryId: ReadonlyMap<string, string> = new Map(),
): string =>
  providerKeyByStoryId.get(story.storyClusterId) ??
  story.providerKeys[0] ??
  "unknown";

const activeProviderKeys = (
  stories: readonly TopReadCandidate[],
  providerKeyByStoryId: ReadonlyMap<string, string>,
): readonly string[] =>
  compactUnique(
    stories.map((story) =>
      topReadPrimaryProviderKey(story, providerKeyByStoryId),
    ),
  );

const shouldReserveRemainingSlot = (params: {
  readonly providerKey: string;
  readonly selectedCount: number;
  readonly limit: number;
  readonly providerCounts: ReadonlyMap<string, number>;
  readonly requiredPrimaryCounts: ReadonlyMap<string, number>;
}): boolean => {
  const currentProviderRequired =
    params.requiredPrimaryCounts.get(params.providerKey) ?? 0;
  const currentProviderCount =
    params.providerCounts.get(params.providerKey) ?? 0;
  const helpsRequiredPrimary = currentProviderCount < currentProviderRequired;
  const missingAfterSelection = missingRequiredPrimaryCount({
    providerCounts: params.providerCounts,
    requiredPrimaryCounts: params.requiredPrimaryCounts,
    selectedProviderKey: params.providerKey,
  });
  const remainingSlotsAfterSelection = params.limit - params.selectedCount - 1;

  return (
    !helpsRequiredPrimary && missingAfterSelection > remainingSlotsAfterSelection
  );
};

const missingRequiredPrimaryCount = (params: {
  readonly providerCounts: ReadonlyMap<string, number>;
  readonly requiredPrimaryCounts: ReadonlyMap<string, number>;
  readonly selectedProviderKey: string;
}): number => {
  let missing = 0;

  for (const [
    providerKey,
    required,
  ] of params.requiredPrimaryCounts.entries()) {
    const selected =
      (params.providerCounts.get(providerKey) ?? 0) +
      (providerKey === params.selectedProviderKey ? 1 : 0);
    missing += Math.max(0, required - selected);
  }

  return missing;
};
