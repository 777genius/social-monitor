import 'dart:convert';

import '../value_objects/reader_promotion_comparator.dart';
import '../value_objects/reader_promotion_exact_timestamp.dart';
import '../value_objects/reader_promotion_score.dart';

/// Block sizes of the reader promotion board.
///
/// "Top posts" is the first [top] ranked posts; "Show more" continues the same
/// sequence up to [rankedTotal] ranked posts; "News without rating" holds up
/// to [news] posts. There is no per-network cap: networks are made comparable
/// by the per-family percentile instead. Mirrors `READER_PROMOTION_LIMITS`.
abstract final class ReaderPromotionLimits {
  static const top = 12;
  static const rankedTotal = 48;
  static const news = 16;
}

/// A metric is mature when it was observed at least this many hours after
/// the post was published; earlier snapshots count as unknown.
const readerPromotionMetricMaturityHours = 6;

final _maturityMicros =
    BigInt.from(readerPromotionMetricMaturityHours) *
    BigInt.from(Duration.microsecondsPerHour);

/// `observedAt - publishedAt >= 6h`, exact to the microsecond.
bool readerPromotionMetricMature({
  required ReaderPromotionExactTimestamp observedAt,
  required ReaderPromotionExactTimestamp publishedAt,
}) => observedAt.microsecondsSince(publishedAt) >= _maturityMicros;

/// Admission gate: useful or important, and relevant or central.
bool readerPromotionSemanticallyAdmitted(ReaderPromotionComparator value) =>
    (value.usefulness == ReaderPromotionUsefulness.useful ||
        value.usefulness == ReaderPromotionUsefulness.important) &&
    (value.relevance == ReaderPromotionRelevance.relevant ||
        value.relevance == ReaderPromotionRelevance.central);

/// Block, maturity and popularity presence agree with each other.
///
/// A news post never carries a metric; a ranked metric is mature exactly
/// when the six-hour rule holds; popularity exists only for a mature metric
/// from a family that reaches the minimum cohort. A mature metric of a
/// smaller family legitimately has no popularity; the board policy keeps
/// that uniform per family.
bool readerPromotionComparatorIsCoherent(ReaderPromotionComparator value) {
  final engagement = value.engagement;
  final mature =
      value.block == ReaderPromotionBlock.ranked &&
      engagement != null &&
      readerPromotionMetricMature(
        observedAt: engagement.observedAt,
        publishedAt: value.publishedAt,
      );
  final popularity = value.popularity;
  return (value.block == ReaderPromotionBlock.ranked || engagement == null) &&
      value.metricMature == mature &&
      (popularity == null || (mature && popularity.isSigned));
}

/// Card "Signal" value the backend must have published: percentile * 10 for
/// a ranked post with popularity, otherwise 0.
double readerPromotionCardSignalScore(ReaderPromotionComparator value) =>
    value.popularity?.signalScore ?? 0;

/// Order inside "Top posts" and "Show more" (one sequence):
///
/// 1. exact hybrid score, descending (see [ReaderPromotionScore]);
/// 2. publishedAt, newest first;
/// 3. candidateId, UTF-8 bytes ascending.
///
/// Negative when [left] ranks before [right]. Callers must check admission
/// first; a non-admitted key sorts last so a forged order never passes.
int compareRankedReaderPromotion(
  ReaderPromotionComparator left,
  ReaderPromotionComparator right,
) {
  final leftScore = ReaderPromotionScore.tryCreate(
    usefulness: left.usefulness,
    popularity: left.popularity,
  );
  final rightScore = ReaderPromotionScore.tryCreate(
    usefulness: right.usefulness,
    popularity: right.popularity,
  );
  if (leftScore == null || rightScore == null) {
    return leftScore == null ? 1 : -1;
  }
  final score = leftScore.compareDescending(rightScore);
  if (score != 0) return score;
  return _compareRecencyThenIdentity(left, right);
}

/// Order inside "News without rating": usefulness, then publishedAt newest
/// first, then candidateId. Popularity is never read here.
int compareUnrankedReaderPromotion(
  ReaderPromotionComparator left,
  ReaderPromotionComparator right,
) {
  final usefulness =
      _usefulnessRank[right.usefulness]! - _usefulnessRank[left.usefulness]!;
  if (usefulness != 0) return usefulness;
  return _compareRecencyThenIdentity(left, right);
}

int _compareRecencyThenIdentity(
  ReaderPromotionComparator left,
  ReaderPromotionComparator right,
) {
  final recency = right.publishedAt.compareTo(left.publishedAt);
  if (recency != 0) return recency;
  return compareReaderPromotionUtf8(left.candidateId, right.candidateId);
}

/// Byte order of the UTF-8 encodings, like `Buffer.compare` on the backend.
/// Dart `String.compareTo` compares UTF-16 units and differs for
/// supplementary characters.
int compareReaderPromotionUtf8(String left, String right) {
  final leftBytes = utf8.encode(left);
  final rightBytes = utf8.encode(right);
  final shared = leftBytes.length < rightBytes.length
      ? leftBytes.length
      : rightBytes.length;
  for (var index = 0; index < shared; index += 1) {
    final difference = leftBytes[index] - rightBytes[index];
    if (difference != 0) return difference;
  }
  return leftBytes.length - rightBytes.length;
}

const _usefulnessRank = <ReaderPromotionUsefulness, int>{
  ReaderPromotionUsefulness.important: 3,
  ReaderPromotionUsefulness.useful: 2,
  ReaderPromotionUsefulness.context: 1,
  ReaderPromotionUsefulness.noise: 0,
  ReaderPromotionUsefulness.insufficientContext: -1,
};
