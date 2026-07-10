import type { StoryRankingPolicy } from "../policies/story-ranking-policy";
import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import { storyKey } from "./story-key-normalizer";
import {
  sharedStoryTopicTokenCount,
  storyClaimFacetTokens,
  storyTopicAnchorTokens,
  storyTopicEventTokens,
  storyTopicSimilarity,
  storyTopicSpecificProductTokens,
  storyTopicTokens,
} from "./story-topic-tokenizer";

export const belongsToCrossProviderCluster = (
  item: SummaryEvidenceItem,
  clusterItems: readonly SummaryEvidenceItem[],
  policy: StoryRankingPolicy,
): boolean => {
  const crossProviderItems = clusterItems.filter(
    (candidate) => candidate.providerKey !== item.providerKey,
  );

  return (
    crossProviderItems.length > 0 &&
    crossProviderItems.every((candidate) =>
      belongsToCrossProviderStory(item, candidate, policy),
    )
  );
};

const belongsToCrossProviderStory = (
  item: SummaryEvidenceItem,
  head: SummaryEvidenceItem,
  policy: StoryRankingPolicy,
): boolean => {
  const itemKey = storyKey(item, policy);
  const headKey = storyKey(head, policy);
  if (itemKey !== headKey && canonicalStoryKeysConflict(itemKey, headKey)) {
    return false;
  }

  const itemClaimFacets = storyClaimFacetTokens(item);
  const headClaimFacets = storyClaimFacetTokens(head);
  if (
    itemClaimFacets.length > 0 &&
    headClaimFacets.length > 0 &&
    sharedStoryTopicTokenCount(itemClaimFacets, headClaimFacets) === 0
  ) {
    return false;
  }

  const itemTokens = storyTopicTokens(item, policy);
  const headTokens = storyTopicTokens(head, policy);
  const sharedTokens = sharedStoryTopicTokenCount(itemTokens, headTokens);
  const sharedAnchorTokens = sharedStoryTopicTokenCount(
    storyTopicAnchorTokens(itemTokens),
    storyTopicAnchorTokens(headTokens),
  );
  const sharedSpecificProductTokens = sharedStoryTopicTokenCount(
    storyTopicSpecificProductTokens(itemTokens),
    storyTopicSpecificProductTokens(headTokens),
  );
  const sharedEventTokens = sharedStoryTopicTokenCount(
    storyTopicEventTokens(itemTokens),
    storyTopicEventTokens(headTokens),
  );
  const semanticMatch =
    sharedAnchorTokens > 0 &&
    sharedTokens >= policy.crossSourceMinSharedTopicTokens &&
    storyTopicSimilarity(itemTokens, headTokens) >=
      policy.crossSourceTopicSimilarityThreshold;
  const productEventMatch =
    sharedSpecificProductTokens > 0 &&
    sharedEventTokens > 0 &&
    sharedTokens >= policy.crossSourceMinSharedTopicTokens;

  return semanticMatch || productEventMatch;
};

const canonicalStoryKeysConflict = (left: string, right: string): boolean =>
  (left.startsWith("github-repo:") && right.startsWith("github-repo:")) ||
  (left.startsWith("url:") &&
    right.startsWith("url:") &&
    left.slice(4).split("/").at(0) === right.slice(4).split("/").at(0));
