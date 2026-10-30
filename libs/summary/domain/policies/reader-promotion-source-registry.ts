/**
 * Whether a source family carries a popularity rating.
 *
 * - `ranked`: the post competes in "Top posts". Its popularity is compared
 *   only with posts from the same family (as a percentile), never with raw
 *   numbers from another network.
 * - `unranked`: the post never enters "Top posts". It goes to the separate
 *   "News without rating" block, ordered by usefulness and recency.
 */
export type ReaderPromotionEngagementClass = "ranked" | "unranked";

export type ReaderPromotionSourceRow = {
  /** Normalized family used for percentile cohorts and the minimum cohort. */
  readonly family: string;
  /** Persisted provider keys (lowercase) that belong to this family. */
  readonly providerKeys: readonly string[];
  readonly engagementClass: ReaderPromotionEngagementClass;
};

export type ReaderPromotionSourceRegistry = readonly ReaderPromotionSourceRow[];

const row = (
  family: string,
  providerKeys: readonly string[],
  engagementClass: ReaderPromotionEngagementClass,
): ReaderPromotionSourceRow => Object.freeze({
  family, providerKeys: Object.freeze([...providerKeys]), engagementClass,
});

/**
 * The single table that decides which block a source belongs to.
 *
 * Block membership is never inferred from a provider name inside the policy
 * (there is no `if (rss)` anywhere). A new source without a rating is one
 * row, for example:
 *
 *   row("mastodon", ["mastodon"], "unranked"),
 *
 * Its posts then land in "News without rating" without touching the ordering
 * policy, the attestation or its validators.
 */
export const READER_PROMOTION_SOURCE_REGISTRY: ReaderPromotionSourceRegistry =
  Object.freeze([
    row("x", ["x", "twitter", "x-twitter"], "ranked"),
    row("reddit", ["reddit"], "ranked"),
    row("hacker_news", ["hn", "hacker_news", "hacker-news"], "ranked"),
    row("github_radar", ["github", "github_radar", "github-repo-radar",
      "github-trending-page"], "ranked"),
    row("rss", ["rss"], "unranked"),
  ]);

export const readerPromotionSourceForProviderKey = (
  providerKey: string,
  registry: ReaderPromotionSourceRegistry = READER_PROMOTION_SOURCE_REGISTRY,
): ReaderPromotionSourceRow | undefined => {
  const key = providerKey.trim().toLowerCase();
  return registry.find((entry) => entry.providerKeys.includes(key));
};

export const readerPromotionEngagementClass = (
  family: string,
  registry: ReaderPromotionSourceRegistry = READER_PROMOTION_SOURCE_REGISTRY,
): ReaderPromotionEngagementClass | undefined =>
  registry.find((entry) => entry.family === family)?.engagementClass;
