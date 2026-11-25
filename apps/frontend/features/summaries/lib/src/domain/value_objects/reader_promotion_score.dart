import 'reader_promotion_comparator.dart';
import 'reader_promotion_popularity.dart';

/// Popularity weight W of the hybrid score, in thousandths (0.6).
const readerPromotionPopularityWeightPerMille = 600;

/// Model part for an important post, in thousandths (1.0).
const readerPromotionModelScoreImportantPerMille = 1000;

/// Model part for a useful post, in thousandths (0.5).
const readerPromotionModelScoreUsefulPerMille = 500;

const _scalePerMille = 1000;

/// Exact hybrid score of a ranked post ("Top posts" and "Show more"):
///
///   score = (1 - W) * model + W * popularity
///
/// With S = 1000, W = 600, M = 1000 (important) or 500 (useful) and the
/// popularity counts n = cohortSize, b = below, e = equal (n = 1, b = e = 0
/// for an unknown metric):
///
///   numerator   = (S - W) * M * 2n + W * S * (2b + e)
///   denominator = 2n * S * S
///
/// Scores compare by cross-multiplication with [BigInt], never by double
/// division: on Flutter web `int` is a JavaScript double and loses exactness
/// past 2^53. Mirrors `readerPromotionScore` in
/// `libs/summary/domain/policies/reader-promotion-score.ts`.
final class ReaderPromotionScore {
  const ReaderPromotionScore._(this.numerator, this.denominator);

  /// Returns `null` for a gate-rejected usefulness or impossible counts,
  /// where the backend throws.
  static ReaderPromotionScore? tryCreate({
    required ReaderPromotionUsefulness usefulness,
    required ReaderPromotionPopularity? popularity,
  }) {
    final model = switch (usefulness) {
      ReaderPromotionUsefulness.important =>
        readerPromotionModelScoreImportantPerMille,
      ReaderPromotionUsefulness.useful =>
        readerPromotionModelScoreUsefulPerMille,
      _ => null,
    };
    final counts = popularity ?? ReaderPromotionPopularity.unknown;
    if (model == null || !counts.isValid) return null;
    final scale = BigInt.from(_scalePerMille);
    final weight = BigInt.from(readerPromotionPopularityWeightPerMille);
    final twiceCohort = BigInt.two * BigInt.from(counts.cohortSize);
    return ReaderPromotionScore._(
      (scale - weight) * BigInt.from(model) * twiceCohort +
          weight *
              scale *
              (BigInt.two * BigInt.from(counts.below) +
                  BigInt.from(counts.equal)),
      twiceCohort * scale * scale,
    );
  }

  final BigInt numerator;
  final BigInt denominator;

  /// Higher score first: negative when this score ranks before [other],
  /// zero for equal fractions (also across different cohort sizes).
  int compareDescending(ReaderPromotionScore other) =>
      (other.numerator * denominator).compareTo(numerator * other.denominator);
}
