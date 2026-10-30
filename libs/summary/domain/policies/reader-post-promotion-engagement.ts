import { canonicalReaderSummaryPreparationTimestamp } from
  "../value-objects/reader-summary-preparation";
import { normalizeSignalScore } from "../value-objects/signal-score";

/**
 * A metric is "mature" when it was observed at least this many hours after
 * the post was published. Earlier snapshots mostly measure how recently a
 * post appeared, not how much readers valued it, so they are treated exactly
 * like a missing metric ("unknown"). This is the only place the threshold
 * lives; the comparator, the attestation and its validators all derive
 * maturity from it.
 */
export const READER_PROMOTION_METRIC_MATURITY_HOURS = 6;

/**
 * Smallest family cohort whose percentile counts. The cohort is the number of
 * gate-passed posts (unique source items) of one provider family with a
 * mature metric. Below it the mid-rank is noise: three HN stories with 1-3
 * points got 5/6 and outranked an important X post. A smaller family has no
 * popularity at all, exactly like an immature metric: 0 in the hybrid score,
 * signal 0, comparator popularity `null` (metricMature still states the time
 * maturity). Deliberately coarse: the fifth mature post switches the whole
 * family on at once.
 */
export const READER_PROMOTION_MIN_POPULARITY_COHORT = 5;

const maturityMicros = BigInt(READER_PROMOTION_METRIC_MATURITY_HOURS) *
  3_600_000_000n;

/** Same signal methods as `reader_promotion_policy.v2` providerSignal. */
export type ReaderPostPromotionSignalMethod =
  | "likes_plus_two_reposts"
  | "reddit_score"
  | "hacker_news_points"
  | "max_stars_or_half_forks";

/**
 * Frozen engagement fact of a ranked source. The absence of a fact (`null`
 * where it is used) means unknown and is never coerced to zero: a missing,
 * unobserved or malformed metric says nothing about popularity.
 */
export type ReaderPostPromotionEngagement = {
  readonly method: ReaderPostPromotionSignalMethod;
  readonly value: number;
  /** Exact six-digit UTC time the metric snapshot was taken. */
  readonly observedAt: string;
};

/**
 * Mid-rank position inside one provider family. `below` counts cohort members
 * with a strictly smaller value, `equal` the members with the same value.
 */
export type ReaderPostPromotionPopularity = {
  readonly cohortSize: number;
  readonly below: number;
  readonly equal: number;
};

export const readerPostPromotionMetricMature = (
  engagement: { readonly observedAt: string },
  publishedAt: string,
): boolean =>
  exactMicros(engagement.observedAt) - exactMicros(publishedAt) >= maturityMicros;

/** Mid-rank percentile in (0, 1]: (below + equal / 2) / cohortSize. */
export const readerPostPromotionPercentile = (
  popularity: ReaderPostPromotionPopularity,
): number => (popularity.below + popularity.equal / 2) / popularity.cohortSize;

/**
 * Display value for the card ("Signal N.NN"): percentile * 10 for a mature
 * ranked metric, otherwise 0. It never mixes network scales and it is not an
 * ordering input; ordering uses the exact hybrid score of
 * `readerPromotionScore` over the popularity counts.
 */
export const readerPostPromotionSignalScore = (
  popularity: ReaderPostPromotionPopularity | null,
): number => popularity === null
  ? 0
  : normalizeSignalScore(10 * readerPostPromotionPercentile(popularity));

/** Structurally valid counts; a signed cohort must also reach the minimum. */
export const validReaderPostPromotionPopularity = (
  value: ReaderPostPromotionPopularity,
): boolean => [value.cohortSize, value.below, value.equal]
  .every((count) => Number.isSafeInteger(count) && count >= 0) &&
  value.cohortSize >= 1 && value.below + value.equal <= value.cohortSize;

export const signedReaderPostPromotionPopularity = (
  value: ReaderPostPromotionPopularity,
): boolean => validReaderPostPromotionPopularity(value) &&
  value.cohortSize >= READER_PROMOTION_MIN_POPULARITY_COHORT;

/**
 * Popularity for every member of `cohort`, computed separately per family.
 * Members sharing one source item (the same post matched by two interests)
 * count once, with the value of their lowest candidate id. Families with
 * fewer than READER_PROMOTION_MIN_POPULARITY_COHORT unique source items get
 * no entry: their members have unknown popularity.
 */
export const readerPostPromotionPopularityByCandidate = (
  cohort: readonly {
    readonly candidateId: string;
    readonly sourceItemId: string;
    readonly providerFamily: string;
    readonly value: number;
  }[],
): ReadonlyMap<string, ReaderPostPromotionPopularity> => {
  const valuesByFamily = new Map<string, Map<string, { id: string; value: number }>>();
  for (const member of cohort) {
    const family = valuesByFamily.get(member.providerFamily) ??
      new Map<string, { id: string; value: number }>();
    valuesByFamily.set(member.providerFamily, family);
    const previous = family.get(member.sourceItemId);
    if (previous === undefined || compareUtf8(member.candidateId, previous.id) < 0) {
      family.set(member.sourceItemId, { id: member.candidateId, value: member.value });
    }
  }
  const sortedByFamily = new Map([...valuesByFamily].map(([family, members]) =>
    [family, [...members.values()].map((entry) => entry.value)
      .sort((left, right) => left - right)] as const));
  const result = new Map<string, ReaderPostPromotionPopularity>();
  for (const member of cohort) {
    const values = sortedByFamily.get(member.providerFamily)!;
    if (values.length < READER_PROMOTION_MIN_POPULARITY_COHORT) continue;
    const below = firstIndex(values, (value) => value >= member.value);
    const notAbove = firstIndex(values, (value) => value > member.value);
    result.set(member.candidateId, Object.freeze({
      cohortSize: values.length, below, equal: notAbove - below,
    }));
  }
  return result;
};

/** First index whose value satisfies a monotone predicate (binary search). */
const firstIndex = (
  sorted: readonly number[],
  predicate: (value: number) => boolean,
): number => {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (predicate(sorted[middle]!)) high = middle;
    else low = middle + 1;
  }
  return low;
};

const exactMicros = (value: string): bigint => {
  const canonical = canonicalReaderSummaryPreparationTimestamp(value);
  return BigInt(Date.parse(`${canonical.slice(0, 23)}Z`)) * 1_000n +
    BigInt(canonical.slice(23, 26));
};

const compareUtf8 = (left: string, right: string): number =>
  Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
