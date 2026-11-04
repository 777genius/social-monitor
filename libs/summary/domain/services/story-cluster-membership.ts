import { uncachedStoryClusteringFacts, type StoryClusteringFacts } from './story-clustering-facts';
import type { StoryRankingPolicy } from "../policies/story-ranking-policy";
import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import { readerPostProviderFamily } from
  "../policies/reader-post-promotion-policy";
import {
  sharedStoryTopicTokenCount,
  storyTopicAnchorTokens,
  storyTopicSimilarity,
} from "./story-topic-tokenizer";
import { strictStoryRelationTitleEvidence } from
  "./story-relation-title-evidence";

import { hasSharedIndependentNewsLawsuitEvent } from "./story-news-verification-evidence";
import { samePrimaryReleaseEvent } from "./story-release-event-identity";
import {
  hasIndependentNewsPublishers,
  isMultiSourceStoryHost,
  isPlatformStoryCopy,
  storyKeyHost,
  storySourceIndependence,
} from "./story-source-identity";

export const belongsToVerifiedStoryCluster = (
  item: SummaryEvidenceItem,
  clusterItems: readonly SummaryEvidenceItem[],
  policy: StoryRankingPolicy,
  verifiedStoryRelationPairs?: ReadonlySet<string>,
  verifiedStrictTitleRelationPairs?: ReadonlySet<string>,
  facts: StoryClusteringFacts = uncachedStoryClusteringFacts,
): boolean =>
  clusterItems.length > 0 &&
  clusterItems.every((candidate) => {
    if (isDeterministicIndependentSourceStoryMatch(item, candidate, policy, facts)) {
      return true;
    }

    const pairKey = verifiedStoryRelationPairKey(
      item.feedItemId,
      candidate.feedItemId,
    );
    return verifiedStrictTitleRelationPairs?.has(pairKey) === true
      ? isVerifiedStrictTitleRelationGuardEligible(item, candidate, policy, facts)
      : verifiedStoryRelationPairs?.has(pairKey) === true &&
          isVerifiedStoryRelationGuardEligible(item, candidate, policy, facts);
  });

export const hasCrossProviderClaimFacetConflict = (
  item: SummaryEvidenceItem,
  clusterItems: readonly SummaryEvidenceItem[],
  policy: StoryRankingPolicy,
  facts: StoryClusteringFacts = uncachedStoryClusteringFacts,
): boolean =>
  clusterItems.some(
    (candidate) =>
      candidate.providerKey !== item.providerKey &&
      !storyClaimFacetsAreCompatible(item, candidate, policy, facts),
  );

/**
 * Deterministic same-story match of two posts from independent sources:
 * different providers, or different publishers/authors on a multi-source
 * host. How much evidence counts depends on that independence (see
 * `storySourceIndependence`): posts of one platform need a copy (exact
 * headline plus the same body or origin link), Google News publishers an
 * exact or semantic headline match.
 */
export const isDeterministicIndependentSourceStoryMatch = (
  item: SummaryEvidenceItem,
  head: SummaryEvidenceItem,
  policy: StoryRankingPolicy,
  facts: StoryClusteringFacts = uncachedStoryClusteringFacts,
): boolean => {
  const itemKey = facts.storyKey(item, policy);
  const headKey = facts.storyKey(head, policy);
  const independence = storySourceIndependence(item, itemKey, head, headKey);
  if (independence === undefined) {
    return false;
  }
  if (itemKey !== headKey && canonicalStoryKeysConflict(itemKey, headKey)) {
    return false;
  }

  if (independence === "platform_copy") {
    return hasStrongExactTitleIdentity(item, head, facts) && isPlatformStoryCopy(item, head);
  }
  if (hasStrongExactTitleIdentity(item, head, facts)) {
    return true;
  }

  if (!storyClaimFacetsAreCompatible(item, head, policy, facts)) {
    return false;
  }

  const itemTokens = facts.storyTopicTokens(item, policy);
  const headTokens = facts.storyTopicTokens(head, policy);
  const sharedTokens = sharedStoryTopicTokenCount(itemTokens, headTokens);
  const sharedAnchorTokens = sharedStoryTopicTokenCount(
    facts.storyTopicAnchorTokens(itemTokens),
    facts.storyTopicAnchorTokens(headTokens),
  );
  const sharedSpecificProductTokens = sharedStoryTopicTokenCount(
    facts.storyTopicSpecificProductTokens(itemTokens),
    facts.storyTopicSpecificProductTokens(headTokens),
  );
  const sharedEventTokens = sharedStoryTopicTokenCount(
    facts.storyTopicEventTokens(itemTokens),
    facts.storyTopicEventTokens(headTokens),
  );
  const sharedModelVersionTokens = sharedStoryTopicTokenCount(
    facts.storyTopicModelVersionTokens(itemTokens),
    facts.storyTopicModelVersionTokens(headTokens),
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

  return semanticMatch || (independence === "provider" && productEventMatch);
};

export const storyClaimFacetsAreCompatible = (
  item: SummaryEvidenceItem,
  head: SummaryEvidenceItem,
  policy: StoryRankingPolicy,
  facts: StoryClusteringFacts = uncachedStoryClusteringFacts,
): boolean => {
  const itemPrimaryFacet = facts.storyPrimaryClaimFacet(item);
  const headPrimaryFacet = facts.storyPrimaryClaimFacet(head);
  if (
    itemPrimaryFacet !== undefined &&
    headPrimaryFacet !== undefined &&
    itemPrimaryFacet !== headPrimaryFacet
  ) {
    return false;
  }
  const itemFacets = facts.storyClaimFacetTokens(item);
  const headFacets = facts.storyClaimFacetTokens(head);
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
    facts.storyTopicEventTokens(facts.storyTopicTokens(facetedItem, policy)).length > 0
  );
};

/** Emphasis can differ only when both primary subjects bind the same release. */
export const verifiedStoryClaimFacetsAreCompatible = (
  item: SummaryEvidenceItem,
  candidate: SummaryEvidenceItem,
  policy: StoryRankingPolicy,
  facts: StoryClusteringFacts = uncachedStoryClusteringFacts,
): boolean => storyClaimFacetsAreCompatible(item, candidate, policy, facts) || (
  [item, candidate].every((post) => {
    const facet = facts.storyPrimaryClaimFacet(post);
    return facet !== undefined &&
      ["release", "benchmark", "comparison", "efficiency"].includes(facet);
  }) && samePrimaryReleaseEvent(item, candidate)
);

export const hasSharedStoryEventFacet = (
  item: SummaryEvidenceItem,
  candidate: SummaryEvidenceItem,
  facts: StoryClusteringFacts = uncachedStoryClusteringFacts,
): boolean => {
  const itemEventFacets = facts.storyClaimFacetTokens(item).filter((facet) =>
    facet.startsWith("event:"),
  );
  const candidateEventFacets = new Set(
    facts.storyClaimFacetTokens(candidate).filter((facet) =>
      facet.startsWith("event:"),
    ),
  );

  return itemEventFacets.some((facet) => candidateEventFacets.has(facet));
};

/**
 * Two different canonical keys that name different stories by construction:
 * two repositories, or two URLs of one ordinary site. URLs on a multi-source
 * host (news.google.com, x.com, reddit.com) are posts of different sources
 * and do not conflict.
 */
export const canonicalStoryKeysConflict = (
  left: string,
  right: string,
): boolean => {
  if (left.startsWith("github-repo:") && right.startsWith("github-repo:")) {
    return true;
  }
  const host = storyKeyHost(left);
  return host !== undefined && host === storyKeyHost(right) &&
    !isMultiSourceStoryHost(host);
};

export const verifiedStoryRelationPairKey = (
  leftFeedItemId: string,
  rightFeedItemId: string,
): string => [leftFeedItemId, rightFeedItemId].sort().join("\u0000");

export const isVerifiedStoryRelationGuardEligible = (
  item: SummaryEvidenceItem,
  candidate: SummaryEvidenceItem,
  policy: StoryRankingPolicy,
  facts: StoryClusteringFacts = uncachedStoryClusteringFacts,
): boolean => {
  const independentNews = hasIndependentNewsPublishers(item, candidate);
  if (readerPostProviderFamily(item.providerKey) ===
      readerPostProviderFamily(candidate.providerKey) && !independentNews) {
    return false;
  }
  const sameAuthorSeries =
    item.providerKey === candidate.providerKey &&
    isVerifiedSameAuthorStorySeriesCandidate(item, candidate);
  if (item.providerKey === candidate.providerKey && !sameAuthorSeries && !independentNews) {
    return false;
  }
  const itemKey = facts.storyKey(item, policy);
  const candidateKey = facts.storyKey(candidate, policy);
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
  if (!verifiedStoryClaimFacetsAreCompatible(item, candidate, policy, facts)) {
    return false;
  }
  if (
    Math.abs(item.publishedAt.getTime() - candidate.publishedAt.getTime()) >
    VERIFIED_STORY_RELATION_MAX_TIME_DISTANCE_MS
  ) {
    return false;
  }
  const itemTokens = facts.storyIdentityTokens(item, policy);
  const candidateTokens = facts.storyIdentityTokens(candidate, policy);
  const sharedTopicTokens = sharedStoryTopicTokenCount(
    itemTokens,
    candidateTokens,
  );
  const candidateTokenSet = new Set(candidateTokens);
  const sharedAnchorTokens = new Set(
    facts.storyIdentityAnchorTokens(itemTokens).filter((token) =>
      candidateTokenSet.has(token),
    ),
  );
  const sharedEventTokens = new Set(
    facts.storyTopicEventTokens(itemTokens).filter((token) =>
      candidateTokenSet.has(token),
    ),
  );
  const sharedEntityAnchorTokenCount = new Set(
    [...sharedAnchorTokens].filter((token) => !sharedEventTokens.has(token)),
  ).size;
  const sharedNonAnchorTokenCount = sharedNonAnchorStoryTopicTokenCount(
    itemTokens,
    candidateTokens,
    facts.storyIdentityAnchorTokens,
  );
  const sharedModelVersionTokenCount = sharedStoryTopicTokenCount(
    facts.storyTopicModelVersionTokens(itemTokens),
    facts.storyTopicModelVersionTokens(candidateTokens),
  );
  const hasConcreteSubject =
    sharedEntityAnchorTokenCount > 0 ||
    sharedStoryTopicTokenCount(
      facts.storyIdentitySpecificProductTokens(itemTokens),
      facts.storyIdentitySpecificProductTokens(candidateTokens),
    ) > 0 ||
    sharedNonAnchorTokenCount >= MIN_VERIFIED_SHARED_SUBJECT_TOKENS;
  const sharedStoryEventFacet = hasSharedStoryEventFacet(item, candidate, facts) ||
    hasSharedIndependentNewsLawsuitEvent(item, candidate);
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

const isVerifiedStrictTitleRelationGuardEligible = (
  item: SummaryEvidenceItem,
  candidate: SummaryEvidenceItem,
  policy: StoryRankingPolicy,
  facts: StoryClusteringFacts = uncachedStoryClusteringFacts,
): boolean => {
  if (readerPostProviderFamily(item.providerKey) ===
      readerPostProviderFamily(candidate.providerKey)) {
    return false;
  }
  const itemKey = facts.storyKey(item, policy);
  const candidateKey = facts.storyKey(candidate, policy);
  return (itemKey === candidateKey ||
      !canonicalStoryKeysConflict(itemKey, candidateKey)) &&
    verifiedStoryClaimFacetsAreCompatible(item, candidate, policy, facts) &&
    Math.abs(item.publishedAt.getTime() - candidate.publishedAt.getTime()) <=
      VERIFIED_STORY_RELATION_MAX_TIME_DISTANCE_MS &&
    strictStoryRelationTitleEvidence(item.title, candidate.title) !== undefined;
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
  facts: StoryClusteringFacts = uncachedStoryClusteringFacts,
): boolean => {
  const leftTitle = facts.storyTitleIdentity(left);
  const rightTitle = facts.storyTitleIdentity(right);

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
