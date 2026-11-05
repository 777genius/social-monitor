import { invalid, requireRecord } from
  "./prisma-reader-summary-promotion-schema-primitives";

const comparatorKeys = [
  "block", "providerFamily", "usefulness", "relevance", "engagement",
  "metricMature", "popularity", "newsPublisher", "publishedAt", "candidateId",
] as const;
const signalMethods = [
  "likes_plus_two_reposts", "reddit_score", "hacker_news_points",
  "max_stars_or_half_forks",
];
const exactTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/u;

/**
 * Exact persisted shape of the signed ordering material. Semantic checks
 * (registry family, maturity, order) belong to domain validation; this only
 * refuses payloads that could not have been produced by the builder.
 */
export const assertPromotionComparatorPayload = (
  value: unknown,
  expected: {
    readonly usefulness: unknown;
    readonly relevance: unknown;
    readonly publishedAt: unknown;
    readonly candidateId: unknown;
    readonly newsPlacement: boolean;
  },
): void => {
  const comparator = requireRecord(value, "comparator");
  if (Object.keys(comparator).length !== comparatorKeys.length ||
      comparatorKeys.some((key) => !Object.hasOwn(comparator, key))) {
    invalid("comparator");
  }
  if ((comparator.block !== "ranked" && comparator.block !== "unranked") ||
      (comparator.block === "unranked") !== expected.newsPlacement ||
      typeof comparator.providerFamily !== "string" ||
      comparator.providerFamily.trim().length === 0 ||
      comparator.usefulness !== expected.usefulness ||
      comparator.relevance !== expected.relevance ||
      !["useful", "important"].includes(comparator.usefulness as string) ||
      !["relevant", "central"].includes(comparator.relevance as string) ||
      comparator.publishedAt !== expected.publishedAt ||
      comparator.candidateId !== expected.candidateId ||
      typeof comparator.metricMature !== "boolean" ||
      (comparator.newsPublisher !== null &&
        (typeof comparator.newsPublisher !== "string" ||
          comparator.newsPublisher.trim().length === 0))) {
    invalid("comparator");
  }
  if (comparator.engagement !== null) {
    const engagement = requireRecord(comparator.engagement, "comparator.engagement");
    if (Object.keys(engagement).length !== 3 ||
        !signalMethods.includes(engagement.method as string) ||
        typeof engagement.value !== "number" || !Number.isFinite(engagement.value) ||
        engagement.value < 0 || typeof engagement.observedAt !== "string" ||
        !exactTimestamp.test(engagement.observedAt)) invalid("comparator.engagement");
  }
  if (comparator.popularity !== null) {
    const popularity = requireRecord(comparator.popularity, "comparator.popularity");
    const counts = [popularity.cohortSize, popularity.below, popularity.equal];
    if (Object.keys(popularity).length !== 3 ||
        counts.some((count) => typeof count !== "number" || !Number.isSafeInteger(count) ||
          count < 0) ||
        (popularity.cohortSize as number) < 1 ||
        (popularity.below as number) + (popularity.equal as number) >
          (popularity.cohortSize as number)) invalid("comparator.popularity");
  }
  // Popularity needs a mature metric; a mature metric of a family below the
  // minimum cohort has none (READER_PROMOTION_MIN_POPULARITY_COHORT).
  if (comparator.popularity !== null && comparator.metricMature !== true) {
    invalid("comparator.popularity");
  }
};
