import { storyKey } from './story-key-normalizer';
import { storyTopicTokens, storyIdentityTokens, storyTitleIdentity,
  storyClaimFacetTokens, storyPrimaryClaimFacet, storyTopicAnchorTokens,
  storyTopicSpecificProductTokens, storyTopicEventTokens,
  storyTopicModelVersionTokens, storyIdentityAnchorTokens,
  storyIdentitySpecificProductTokens } from './story-topic-tokenizer';

export const uncachedStoryClusteringFacts = { storyKey, storyTopicTokens,
  storyIdentityTokens, storyTitleIdentity, storyClaimFacetTokens,
  storyPrimaryClaimFacet, storyTopicAnchorTokens, storyTopicSpecificProductTokens,
  storyTopicEventTokens, storyTopicModelVersionTokens, storyIdentityAnchorTokens,
  storyIdentitySpecificProductTokens };
export type StoryClusteringFacts = typeof uncachedStoryClusteringFacts;

/** Owned by one synchronous build with one fixed policy. No pair-result cache. */
export function createStoryClusteringFacts(): StoryClusteringFacts {
  return {
    storyKey: memo(storyKey), storyTopicTokens: memo(storyTopicTokens),
    storyIdentityTokens: memo(storyIdentityTokens), storyTitleIdentity: memo(storyTitleIdentity),
    storyClaimFacetTokens: memo(storyClaimFacetTokens), storyPrimaryClaimFacet: memo(storyPrimaryClaimFacet),
    storyTopicAnchorTokens: memo(storyTopicAnchorTokens),
    storyTopicSpecificProductTokens: memo(storyTopicSpecificProductTokens),
    storyTopicEventTokens: memo(storyTopicEventTokens),
    storyTopicModelVersionTokens: memo(storyTopicModelVersionTokens),
    storyIdentityAnchorTokens: memo(storyIdentityAnchorTokens),
    storyIdentitySpecificProductTokens: memo(storyIdentitySpecificProductTokens),
  };
}
function memo<A extends object, B extends readonly unknown[], R>(compute: (first: A, ...rest: B) => R) {
  const values = new WeakMap<A, { readonly rest: B; readonly value: R }>();
  return (first: A, ...rest: B): R => {
    const prior = values.get(first);
    if (prior && prior.rest.length === rest.length &&
        prior.rest.every((argument, index) => argument === rest[index])) return prior.value;
    const value = compute(first, ...rest); values.set(first, { rest, value }); return value;
  };
}
