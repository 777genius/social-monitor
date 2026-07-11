import type { StoryRankingPolicy } from "../policies/story-ranking-policy";
import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import { storyKey } from "./story-key-normalizer";
import {
  sharedStoryTopicTokenCount,
  storyClaimFacetTokens,
  storyPrimaryClaimFacet,
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

export const hasCrossProviderClaimFacetConflict = (
  item: SummaryEvidenceItem,
  clusterItems: readonly SummaryEvidenceItem[],
  policy: StoryRankingPolicy,
): boolean =>
  clusterItems.some(
    (candidate) =>
      candidate.providerKey !== item.providerKey &&
      !claimFacetsAreCompatible(item, candidate, policy),
  );

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

  if (!claimFacetsAreCompatible(item, head, policy)) {
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

const claimFacetsAreCompatible = (
  item: SummaryEvidenceItem,
  head: SummaryEvidenceItem,
  policy: StoryRankingPolicy,
): boolean => {
  const itemPrimaryFacet = storyPrimaryClaimFacet(item);
  const headPrimaryFacet = storyPrimaryClaimFacet(head);
  if (
    itemPrimaryFacet !== undefined &&
    headPrimaryFacet !== undefined &&
    itemPrimaryFacet !== headPrimaryFacet
  ) {
    return false;
  }
  const itemFacets = storyClaimFacetTokens(item);
  const headFacets = storyClaimFacetTokens(head);
  if (itemFacets.length === 0 && headFacets.length === 0) {
    return true;
  }
  if (sharedStoryTopicTokenCount(itemFacets, headFacets) > 0) {
    return true;
  }

  const facetedItem = itemFacets.length > 0 ? item : head;
  const facetedClaims = itemFacets.length > 0 ? itemFacets : headFacets;
  const otherFacets = itemFacets.length > 0 ? headFacets : itemFacets;
  if (otherFacets.length > 0) {
    return false;
  }
  if (!facetedClaims.every((facet) => facet.startsWith("feature:"))) {
    return false;
  }

  return (
    storyTopicEventTokens(storyTopicTokens(facetedItem, policy)).length > 0
  );
};

const canonicalStoryKeysConflict = (left: string, right: string): boolean =>
  (left.startsWith("github-repo:") && right.startsWith("github-repo:")) ||
  (left.startsWith("url:") &&
    right.startsWith("url:") &&
    left.slice(4).split("/").at(0) === right.slice(4).split("/").at(0));
