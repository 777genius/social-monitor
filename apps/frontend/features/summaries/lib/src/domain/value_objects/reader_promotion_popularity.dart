/// Smallest family cohort whose percentile counts
/// (`READER_PROMOTION_MIN_POPULARITY_COHORT`). A family with fewer mature
/// gate-passed posts has no popularity at all, exactly like an immature
/// metric; the fifth mature post switches the whole family on at once.
const readerPromotionMinPopularityCohort = 5;

/// Mid-rank position of a ranked post inside its own source family.
///
/// `below` counts cohort members with a strictly smaller metric, `equal` the
/// members with the same metric. The cohort contains only gate-passed posts
/// of the same family with a mature metric, one entry per source item.
/// Networks are therefore never compared by raw numbers.
final class ReaderPromotionPopularity {
  const ReaderPromotionPopularity({
    required this.cohortSize,
    required this.below,
    required this.equal,
  });

  /// Contribution of an unknown metric to the hybrid score: popularity 0.
  static const unknown = ReaderPromotionPopularity(
    cohortSize: 1,
    below: 0,
    equal: 0,
  );

  final int cohortSize;
  final int below;
  final int equal;

  /// Same rule as `validReaderPostPromotionPopularity` on the backend.
  bool get isValid =>
      cohortSize >= 1 &&
      below >= 0 &&
      equal >= 0 &&
      below + equal <= cohortSize;

  /// Counts the backend may sign: structurally valid and from a family that
  /// reaches [readerPromotionMinPopularityCohort].
  bool get isSigned =>
      isValid && cohortSize >= readerPromotionMinPopularityCohort;

  /// Card "Signal" value: `10 * (below + equal / 2) / cohortSize`, rounded to
  /// three decimals exactly like `Number(value.toFixed(3))` in JavaScript.
  /// Display only; the order never reads it.
  double get signalScore {
    final value = 10 * ((below + equal / 2) / cohortSize);
    return value.isFinite && value > 0
        ? double.parse(value.toStringAsFixed(3))
        : 0;
  }

  @override
  bool operator ==(Object other) =>
      other is ReaderPromotionPopularity &&
      other.cohortSize == cohortSize &&
      other.below == below &&
      other.equal == equal;

  @override
  int get hashCode => Object.hash(cohortSize, below, equal);
}
