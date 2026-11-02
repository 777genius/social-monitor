import { readerPromotionProviderIsPost } from "./reader-promotion-source-registry";
import type { ReaderPostPromotionPopularity } from "./reader-post-promotion-engagement";
import { readerPostPromotionPopularityByCandidate, readerPostPromotionMetricEligible } from "./reader-post-promotion-engagement";
import { compareReaderPromotionScoreDesc, readerPromotionScore } from "./reader-promotion-score";

import { READER_PROMOTION_POLICY_STAMP } from "./reader-promotion-policy-version";

type BrowsePost = {
  readonly id: string; readonly sourceItemId: string;
  readonly providerKey: string;
  readonly providerFamily: string; readonly publishedAt: string;
  readonly engagement: number | null; readonly engagementObservedAt: string | null;
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
    if (order === "likes" && left.engagement !== right.engagement) {
      if (left.engagement === null) return 1;
      if (right.engagement === null) return -1;
      return right.engagement - left.engagement;
    }
    const leftAdmitted = admitted(left), rightAdmitted = admitted(right);
    if (leftAdmitted !== rightAdmitted) return leftAdmitted ? -1 : 1;
    const compared = leftAdmitted
      ? compareReaderPromotionScoreDesc(score(left), score(right))
      : ordinal(relevance, left.relevance) - ordinal(relevance, right.relevance) ||
        ordinal(usefulness, left.usefulness) - ordinal(usefulness, right.usefulness);
    return compared || right.publishedAt.localeCompare(left.publishedAt) ||
      Buffer.compare(Buffer.from(left.id), Buffer.from(right.id));
  });
}
