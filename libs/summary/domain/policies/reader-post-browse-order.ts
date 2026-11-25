import { readerPromotionProviderIsPost, readerPromotionSourceForProviderKey } from "./reader-promotion-source-registry";
import type { ReaderPostPromotionPopularity } from "./reader-post-promotion-engagement";
import { readerPostPromotionPopularityByCandidate, readerPostPromotionMetricEligible } from "./reader-post-promotion-engagement";
import { compareReaderPromotionScoreDesc, readerPromotionScore } from "./reader-promotion-score";

import { READER_PROMOTION_POLICY_STAMP } from "./reader-promotion-policy-version";

type BrowsePost = {
  readonly id: string; readonly sourceItemId: string;
  readonly providerKey: string;
  readonly providerFamily: string; readonly publishedAt: string;
  readonly engagement: number | null; readonly engagementObservedAt: string | null;
  readonly likeCount?: number | null;
  readonly usefulness: string | null; readonly relevance: string | null;
};

const usefulness = ["important", "useful", "context", "noise", "insufficient_context"];
const relevance = ["central", "relevant", "adjacent", "unrelated", "insufficient_context"];
const ordinal = (labels: readonly string[], value: string | null): number => {
  const index = value === null ? -1 : labels.indexOf(value);
  return index < 0 ? labels.length : index;
};
const admitted = (post: BrowsePost): boolean =>
  ordinal(usefulness, post.usefulness) < 2 && ordinal(relevance, post.relevance) < 2;

/** Same hybrid order for admitted posts; other assessments and unknowns follow. */
export function readerPostsInBrowseOrder<T extends BrowsePost>(
  posts: readonly T[], order: "model" | "likes", ingestionCutoff: string,
): readonly T[] {
  const eligible = posts.filter((post) => readerPromotionProviderIsPost(post.providerKey));
  const stableOrder = (left: T, right: T) => right.publishedAt.localeCompare(left.publishedAt) ||
    Buffer.compare(Buffer.from(left.id), Buffer.from(right.id));
  if (order === "likes") {
    const value = (post: T) => readerPromotionSourceForProviderKey(post.providerKey)?.family === "x"
      ? post.likeCount ?? null : post.engagement;
    return [...eligible].sort((left, right) => {
      const a = value(left), b = value(right);
      if (a !== b) {
        if (a === null) return 1;
        if (b === null) return -1;
        return b - a;
      }
      return stableOrder(left, right);
    });
  }
  const popularity = readerPostPromotionPopularityByCandidate(eligible.filter((post) =>
    admitted(post) && post.engagement !== null && post.engagement >= 0 &&
    post.engagementObservedAt !== null && readerPostPromotionMetricEligible({
      observedAt: post.engagementObservedAt,
    }, post.publishedAt, { policyVersion: READER_PROMOTION_POLICY_STAMP,
      ingestionCutoff })).map((post) => ({
    candidateId: post.id, sourceItemId: post.sourceItemId,
    providerFamily: post.providerFamily, value: post.engagement!,
  })));
  const score = (post: T) => readerPromotionScore({
    usefulness: post.usefulness!,
    popularity: popularity.get(post.id) as ReaderPostPromotionPopularity | undefined ?? null,
  });
  return [...eligible].sort((left, right) => {
    const leftAdmitted = admitted(left), rightAdmitted = admitted(right);
    if (leftAdmitted !== rightAdmitted) return leftAdmitted ? -1 : 1;
    const compared = leftAdmitted
      ? compareReaderPromotionScoreDesc(score(left), score(right))
      : ordinal(relevance, left.relevance) - ordinal(relevance, right.relevance) ||
        ordinal(usefulness, left.usefulness) - ordinal(usefulness, right.usefulness);
    return compared || stableOrder(left, right);
  });
}
