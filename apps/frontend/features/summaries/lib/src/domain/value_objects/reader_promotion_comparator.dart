import 'reader_promotion_exact_timestamp.dart';
import 'reader_promotion_popularity.dart';

/// Which block a promoted post belongs to, decided by its source family.
///
/// - [ranked]: "Top posts" and "Show more", one ordered sequence.
/// - [unranked]: "News without rating" for sources without a popularity
///   rating, such as RSS.
enum ReaderPromotionBlock { ranked, unranked }

/// Reader-value usefulness answer. Only [important] and [useful] are
/// admitted to a promotion block.
enum ReaderPromotionUsefulness {
  important,
  useful,
  context,
  noise,
  insufficientContext,
}

/// Reader-value relevance answer. It is an admission gate (relevant or
/// central), never an order key.
enum ReaderPromotionRelevance {
  central,
  relevant,
  adjacent,
  unrelated,
  insufficientContext,
}

/// How a ranked source turns its native numbers into one signal value.
enum ReaderPromotionSignalMethod {
  likesPlusTwoReposts,
  redditScore,
  hackerNewsPoints,
  maxStarsOrHalfForks,
}

/// Frozen metric of a ranked source at the time it was observed.
final class ReaderPromotionEngagement {
  const ReaderPromotionEngagement({
    required this.method,
    required this.value,
    required this.observedAt,
  });

  final ReaderPromotionSignalMethod method;

  /// Provider signal: an integer except GitHub half forks (`x.5`).
  final double value;
  final ReaderPromotionExactTimestamp observedAt;
}

/// The signed ordering material of one promoted post.
///
/// Every value comes from the attestation comparator; card fields are never
/// ordering input. The hybrid score is rebuilt exactly from [usefulness] and
/// [popularity]; there is deliberately no float score here.
final class ReaderPromotionComparator {
  const ReaderPromotionComparator({
    required this.block,
    required this.providerFamily,
    required this.usefulness,
    required this.relevance,
    required this.engagement,
    required this.metricMature,
    required this.popularity,
    required this.newsPublisher,
    required this.publishedAt,
    required this.candidateId,
  });

  final ReaderPromotionBlock block;
  final String providerFamily;
  final ReaderPromotionUsefulness usefulness;
  final ReaderPromotionRelevance relevance;

  /// `null` means unknown: missing, not yet observed or malformed.
  final ReaderPromotionEngagement? engagement;
  final bool metricMature;

  /// Present only for a ranked post with a mature metric.
  final ReaderPromotionPopularity? popularity;

  /// Real publisher of a news.google.com item in the news block.
  final String? newsPublisher;
  final ReaderPromotionExactTimestamp publishedAt;
  final String candidateId;
}
