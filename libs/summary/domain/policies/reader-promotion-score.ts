import {
  validReaderPostPromotionPopularity,
  type ReaderPostPromotionPopularity,
} from "./reader-post-promotion-engagement";

/**
 * Hybrid score of a ranked post ("Top posts" and "Show more", one sequence):
 *
 *   score = (1 - W) * model + W * popularity
 *
 * - model: the reader-value usefulness, important = 1.0, useful = 0.5;
 * - popularity: the mid-rank percentile inside the post's own network,
 *   (below + equal / 2) / cohortSize, among gate-passed posts of that family
 *   with a mature metric; 0..1;
 * - an unknown metric (missing, immature, malformed) puts 0 into the score.
 *   This is deliberate: an unmeasured post cannot outrank a measured one on
 *   popularity, and the card still shows no invented signal (signalScore 0).
 *
 * Why a hybrid: usefulness-first let an important post with a handful of
 * likes outrank every useful post with thousands. With W = 0.6 an important
 * post with a weak metric falls below a useful post with a strong one
 * (0.4 + 0.6 * 0.05 = 0.43 < 0.2 + 0.6 * 0.95 = 0.77), while an important
 * post with a strong metric still leads (0.4 + 0.6 * 0.95 = 0.97).
 *
 * The weights are fixed-point integers in thousandths, so every party can
 * reproduce the same exact rational number.
 */
export const READER_PROMOTION_POPULARITY_WEIGHT_PER_MILLE = 600;
/** Model part for an important post: 1.0. */
export const READER_PROMOTION_MODEL_SCORE_IMPORTANT_PER_MILLE = 1000;
/** Model part for a useful post: 0.5. */
export const READER_PROMOTION_MODEL_SCORE_USEFUL_PER_MILLE = 500;

const scale = 1000n;
const weight = BigInt(READER_PROMOTION_POPULARITY_WEIGHT_PER_MILLE);
const unknownPopularity: ReaderPostPromotionPopularity =
  Object.freeze({ cohortSize: 1, below: 0, equal: 0 });

/** Exact score as a fraction; compare only with `compareReaderPromotionScoreDesc`. */
export type ReaderPromotionScore = {
  readonly numerator: bigint;
  readonly denominator: bigint;
};

/**
 * Exact hybrid score from the signed comparator fields only (usefulness and
 * the popularity counts); there is no float field to trust or round.
 *
 * With S = 1000, W = 600, M = 1000 (important) or 500 (useful), n =
 * cohortSize, b = below, e = equal, and n = 1, b = e = 0 for an unknown
 * metric:
 *
 *   numerator   = (S - W) * M * 2n + W * S * (2b + e)
 *   denominator = 2n * S * S
 *
 * Two scores compare by cross-multiplication, numerator_a * denominator_b
 * against numerator_b * denominator_a. Dart must do the same with `BigInt`
 * (on Flutter web `int` is a double and loses exactness past 2^53), never
 * with double division. Example: important with b = 0, e = 1, n = 10 gives
 * (400 * 1000 * 20 + 600 * 1000 * 1) / (20 * 10^6) = 8_600_000 / 20_000_000
 * = 0.43.
 */
export const readerPromotionScore = (key: {
  readonly usefulness: string;
  readonly popularity: ReaderPostPromotionPopularity | null;
}): ReaderPromotionScore => {
  const model = key.usefulness === "important"
    ? READER_PROMOTION_MODEL_SCORE_IMPORTANT_PER_MILLE
    : key.usefulness === "useful" ? READER_PROMOTION_MODEL_SCORE_USEFUL_PER_MILLE
      : undefined;
  if (model === undefined) {
    throw new Error("Reader promotion score needs an admitted usefulness");
  }
  const popularity = key.popularity ?? unknownPopularity;
  if (!validReaderPostPromotionPopularity(popularity)) {
    throw new Error("Reader promotion popularity is invalid");
  }
  const twiceCohort = 2n * BigInt(popularity.cohortSize);
  return Object.freeze({
    numerator: (scale - weight) * BigInt(model) * twiceCohort +
      weight * scale * (2n * BigInt(popularity.below) + BigInt(popularity.equal)),
    denominator: twiceCohort * scale * scale,
  });
};

/** Higher score first; equal fractions compare as equal (0). */
export const compareReaderPromotionScoreDesc = (
  left: ReaderPromotionScore,
  right: ReaderPromotionScore,
): number => {
  const leftScaled = left.numerator * right.denominator;
  const rightScaled = right.numerator * left.denominator;
  return leftScaled === rightScaled ? 0 : leftScaled > rightScaled ? -1 : 1;
};

/** Decimal value for previews and diagnostics only; never order by it. */
export const readerPromotionScoreDecimal = (score: ReaderPromotionScore): number =>
  Number(score.numerator) / Number(score.denominator);
