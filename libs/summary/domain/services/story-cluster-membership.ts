import type { StoryRankingPolicy } from "../policies/story-ranking-policy";
import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import { readerPostProviderFamily } from
  "../policies/reader-post-promotion-policy";
import { storyKey } from "./story-key-normalizer";
import {
  sharedStoryTopicTokenCount,
  storyClaimFacetTokens,
  storyIdentityAnchorTokens,
  storyIdentitySpecificProductTokens,
  storyIdentityTokens,
  storyPrimaryClaimFacet,
  storyTopicAnchorTokens,
  storyTopicEventTokens,
  storyTopicModelVersionTokens,
  storyTopicSimilarity,
  storyTopicSpecificProductTokens,
  storyTopicTokens,
  storyTitleIdentity,
} from "./story-topic-tokenizer";

export const belongsToVerifiedStoryCluster = (
  item: SummaryEvidenceItem,
  clusterItems: readonly SummaryEvidenceItem[],
  policy: StoryRankingPolicy,
  verifiedStoryRelationPairs?: ReadonlySet<string>,
): boolean =>
  clusterItems.length > 0 &&
  clusterItems.every((candidate) => {
    if (
      candidate.providerKey !== item.providerKey &&
      isDeterministicCrossProviderStoryMatch(item, candidate, policy)
    ) {
      return true;
    }

    return (
      verifiedStoryRelationPairs?.has(
        verifiedStoryRelationPairKey(item.feedItemId, candidate.feedItemId),
      ) === true &&
      isVerifiedStoryRelationGuardEligible(item, candidate, policy)
    );
  });

export const hasCrossProviderClaimFacetConflict = (
  item: SummaryEvidenceItem,
  clusterItems: readonly SummaryEvidenceItem[],
  policy: StoryRankingPolicy,
): boolean =>
  clusterItems.some(
    (candidate) =>
      candidate.providerKey !== item.providerKey &&
      !storyClaimFacetsAreCompatible(item, candidate, policy),
  );

export const isDeterministicCrossProviderStoryMatch = (
  item: SummaryEvidenceItem,
  head: SummaryEvidenceItem,
  policy: StoryRankingPolicy,
): boolean => {
  if (item.providerKey === head.providerKey) {
    return false;
  }
  const itemKey = storyKey(item, policy);
  const headKey = storyKey(head, policy);
  if (itemKey !== headKey && canonicalStoryKeysConflict(itemKey, headKey)) {
    return false;
  }

  if (hasStrongExactTitleIdentity(item, head)) {
    return true;
  }

  if (!storyClaimFacetsAreCompatible(item, head, policy)) {
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
  const sharedModelVersionTokens = sharedStoryTopicTokenCount(
    storyTopicModelVersionTokens(itemTokens),
    storyTopicModelVersionTokens(headTokens),
  );
  const sharedNonAnchorTokens = sharedNonAnchorStoryTopicTokenCount(
    itemTokens,
    headTokens,
  );
  const semanticMatch =
    sharedAnchorTokens > 0 &&
    sharedNonAnchorTokens >= MIN_DETERMINISTIC_SHARED_CONTEXT_TOKENS &&
    sharedTokens >= policy.crossSourceMinSharedTopicTokens &&
    storyTopicSimilarity(itemTokens, headTokens) >=
      policy.crossSourceTopicSimilarityThreshold;
  const productEventMatch =
    sharedSpecificProductTokens > 0 &&
    sharedEventTokens > 0 &&
    (sharedNonAnchorTokens > 0 || sharedModelVersionTokens > 0) &&
    sharedTokens >= policy.crossSourceMinSharedTopicTokens;

  return semanticMatch || productEventMatch;
};

export const storyClaimFacetsAreCompatible = (
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

export const hasSharedStoryEventFacet = (
  item: SummaryEvidenceItem,
  candidate: SummaryEvidenceItem,
): boolean => {
  const itemEventFacets = storyClaimFacetTokens(item).filter((facet) =>
    facet.startsWith("event:"),
  );
  const candidateEventFacets = new Set(
    storyClaimFacetTokens(candidate).filter((facet) =>
      facet.startsWith("event:"),
    ),
  );

  return itemEventFacets.some((facet) => candidateEventFacets.has(facet));
};

export const canonicalStoryKeysConflict = (
  left: string,
  right: string,
): boolean =>
  (left.startsWith("github-repo:") && right.startsWith("github-repo:")) ||
  (left.startsWith("url:") &&
    right.startsWith("url:") &&
    left.slice(4).split("/").at(0) === right.slice(4).split("/").at(0));

export const verifiedStoryRelationPairKey = (
  leftFeedItemId: string,
  rightFeedItemId: string,
): string => [leftFeedItemId, rightFeedItemId].sort().join("\u0000");

export const isVerifiedStoryRelationGuardEligible = (
  item: SummaryEvidenceItem,
  candidate: SummaryEvidenceItem,
  policy: StoryRankingPolicy,
): boolean => {
  if (readerPostProviderFamily(item.providerKey) ===
      readerPostProviderFamily(candidate.providerKey)) {
    return false;
  }
  const sameAuthorSeries =
    item.providerKey === candidate.providerKey &&
    isVerifiedSameAuthorStorySeriesCandidate(item, candidate);
  if (item.providerKey === candidate.providerKey && !sameAuthorSeries) {
    return false;
  }
  const itemKey = storyKey(item, policy);
  const candidateKey = storyKey(candidate, policy);
  if (
    itemKey !== candidateKey &&
    canonicalStoryKeysConflict(itemKey, candidateKey) &&
    !(
      sameAuthorSeries &&
      itemKey.startsWith("url:") &&
      candidateKey.startsWith("url:")
    )
  ) {
    return false;
  }
  if (!storyClaimFacetsAreCompatible(item, candidate, policy)) {
    return false;
  }
  if (
    Math.abs(item.publishedAt.getTime() - candidate.publishedAt.getTime()) >
    VERIFIED_STORY_RELATION_MAX_TIME_DISTANCE_MS
  ) {
    return false;
  }

  const itemTokens = storyIdentityTokens(item, policy);
  const candidateTokens = storyIdentityTokens(candidate, policy);
  const sharedTopicTokens = sharedStoryTopicTokenCount(
    itemTokens,
    candidateTokens,
  );
  const candidateTokenSet = new Set(candidateTokens);
  const sharedAnchorTokens = new Set(
    storyIdentityAnchorTokens(itemTokens).filter((token) =>
      candidateTokenSet.has(token),
    ),
  );
  const sharedEventTokens = new Set(
    storyTopicEventTokens(itemTokens).filter((token) =>
      candidateTokenSet.has(token),
    ),
  );
  const sharedEntityAnchorTokenCount = new Set(
    [...sharedAnchorTokens].filter((token) => !sharedEventTokens.has(token)),
  ).size;
  const sharedNonAnchorTokenCount = sharedNonAnchorStoryTopicTokenCount(
    itemTokens,
    candidateTokens,
    storyIdentityAnchorTokens,
  );
  const sharedModelVersionTokenCount = sharedStoryTopicTokenCount(
    storyTopicModelVersionTokens(itemTokens),
    storyTopicModelVersionTokens(candidateTokens),
  );
  const hasConcreteSubject =
    sharedEntityAnchorTokenCount > 0 ||
    sharedStoryTopicTokenCount(
      storyIdentitySpecificProductTokens(itemTokens),
      storyIdentitySpecificProductTokens(candidateTokens),
    ) > 0 ||
    sharedNonAnchorTokenCount >= MIN_VERIFIED_SHARED_SUBJECT_TOKENS;
  const sharedStoryEventFacet = hasSharedStoryEventFacet(item, candidate);
  const hasConcreteContext =
    sharedNonAnchorTokenCount >= MIN_VERIFIED_SHARED_CONTEXT_TOKENS ||
    (sharedEventTokens.size > 0 && sharedModelVersionTokenCount > 0) ||
    sharedStoryEventFacet;
  const minimumSharedTopicTokens = sharedStoryEventFacet
    ? MIN_VERIFIED_SHARED_EVENT_FACET_TOPIC_TOKENS
    : MIN_VERIFIED_SHARED_TOPIC_TOKENS;

  return sameAuthorSeries
    ? sharedNonAnchorTokenCount > 0
    : hasConcreteSubject &&
        hasConcreteContext &&
        sharedTopicTokens >= minimumSharedTopicTokens;
};

const VERIFIED_STORY_RELATION_MAX_TIME_DISTANCE_MS = 30 * 60 * 60 * 1000;
const VERIFIED_SAME_AUTHOR_SERIES_MAX_TIME_DISTANCE_MS = 2 * 60 * 60 * 1000;
const STRONG_EXACT_TITLE_MIN_TOKEN_COUNT = 5;
const MIN_DETERMINISTIC_SHARED_CONTEXT_TOKENS = 2;
const MIN_VERIFIED_SHARED_CONTEXT_TOKENS = 2;
const MIN_VERIFIED_SHARED_EVENT_FACET_TOPIC_TOKENS = 2;
const MIN_VERIFIED_SHARED_SUBJECT_TOKENS = 3;
const MIN_VERIFIED_SHARED_TOPIC_TOKENS = 3;

const sharedNonAnchorStoryTopicTokenCount = (
  leftTokens: readonly string[],
  rightTokens: readonly string[],
  anchorTokens: (
    tokens: readonly string[],
  ) => readonly string[] = storyTopicAnchorTokens,
): number => {
  const rightTokenSet = new Set(rightTokens);

  return new Set(
    leftTokens.filter(
      (token) =>
        rightTokenSet.has(token) &&
        anchorTokens([token]).length === 0,
    ),
  ).size;
};

const hasStrongExactTitleIdentity = (
  left: SummaryEvidenceItem,
  right: SummaryEvidenceItem,
): boolean => {
  const leftTitle = storyTitleIdentity(left);
  const rightTitle = storyTitleIdentity(right);

  return (
    leftTitle === rightTitle &&
    leftTitle.split(" ").length >= STRONG_EXACT_TITLE_MIN_TOKEN_COUNT
  );
};

export const isVerifiedSameAuthorStorySeriesCandidate = (
  left: SummaryEvidenceItem,
  right: SummaryEvidenceItem,
): boolean => {
  const leftAuthor = normalizedAuthorHandle(left.authorHandle);
  const rightAuthor = normalizedAuthorHandle(right.authorHandle);

  return (
    leftAuthor !== undefined &&
    leftAuthor === rightAuthor &&
    Math.abs(left.publishedAt.getTime() - right.publishedAt.getTime()) <=
      VERIFIED_SAME_AUTHOR_SERIES_MAX_TIME_DISTANCE_MS
  );
};

const normalizedAuthorHandle = (
  value: string | undefined,
): string | undefined => {
  const normalized = value?.trim().toLocaleLowerCase("en-US");
  return normalized === undefined || normalized.length === 0
    ? undefined
    : normalized;
};
