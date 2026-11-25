import '../../domain/value_objects/reader_promotion_comparator.dart';
import '../../domain/value_objects/reader_promotion_exact_timestamp.dart';
import '../../domain/value_objects/reader_promotion_popularity.dart';

/// Strict decoder of the signed V3 attestation comparator
/// (`ReaderPostPromotionComparator` on the backend).
///
/// It translates wire language into the summaries domain and fails closed:
/// a missing or extra key, an unknown enum value, a non-canonical timestamp,
/// a fractional or unsafe count or a negative metric returns `null`. It only
/// decodes; agreement with the rest of the attestation and the board is
/// checked by the verifier and the board policy.
ReaderPromotionComparator? decodeReaderPromotionComparator(Object? value) {
  if (value is! Map<String, Object?> || !_exactKeys(value, _comparatorKeys)) {
    return null;
  }
  final block = _blocks[value['block']];
  final usefulness = _usefulness[value['usefulness']];
  final relevance = _relevance[value['relevance']];
  final providerFamily = value['providerFamily'];
  final candidateId = value['candidateId'];
  final metricMature = value['metricMature'];
  final newsPublisher = value['newsPublisher'];
  final publishedAt = ReaderPromotionExactTimestamp.tryParse(
    value['publishedAt'],
  );
  final engagement = _engagement(value['engagement']);
  final popularity = _popularity(value['popularity']);
  if (block == null ||
      usefulness == null ||
      relevance == null ||
      providerFamily is! String ||
      providerFamily.trim().isEmpty ||
      candidateId is! String ||
      candidateId.trim().isEmpty ||
      metricMature is! bool ||
      (newsPublisher != null && newsPublisher is! String) ||
      publishedAt == null ||
      (value['engagement'] != null && engagement == null) ||
      (value['popularity'] != null && popularity == null)) {
    return null;
  }
  return ReaderPromotionComparator(
    block: block,
    providerFamily: providerFamily,
    usefulness: usefulness,
    relevance: relevance,
    engagement: engagement,
    metricMature: metricMature,
    popularity: popularity,
    newsPublisher: newsPublisher as String?,
    publishedAt: publishedAt,
    candidateId: candidateId,
  );
}

ReaderPromotionEngagement? _engagement(Object? value) {
  if (value is! Map<String, Object?> ||
      !_exactKeys(value, const {'method', 'value', 'observedAt'})) {
    return null;
  }
  final method = _signalMethods[value['method']];
  final metric = value['value'];
  final observedAt = ReaderPromotionExactTimestamp.tryParse(
    value['observedAt'],
  );
  if (method == null ||
      metric is! num ||
      !metric.isFinite ||
      metric < 0 ||
      observedAt == null) {
    return null;
  }
  return ReaderPromotionEngagement(
    method: method,
    value: metric.toDouble(),
    observedAt: observedAt,
  );
}

ReaderPromotionPopularity? _popularity(Object? value) {
  if (value is! Map<String, Object?> ||
      !_exactKeys(value, const {'cohortSize', 'below', 'equal'})) {
    return null;
  }
  final cohortSize = _safeCount(value['cohortSize']);
  final below = _safeCount(value['below']);
  final equal = _safeCount(value['equal']);
  if (cohortSize == null || below == null || equal == null) return null;
  return ReaderPromotionPopularity(
    cohortSize: cohortSize,
    below: below,
    equal: equal,
  );
}

/// `Number.isSafeInteger(value) && value >= 0`, also for an integral double
/// produced by a JSON decoder.
int? _safeCount(Object? value) {
  if (value is! num || !value.isFinite || value < 0) return null;
  if (value != value.truncateToDouble() || value > _maxSafeInteger) {
    return null;
  }
  return value.toInt();
}

bool _exactKeys(Map<String, Object?> value, Set<String> keys) =>
    value.length == keys.length && keys.every(value.containsKey);

const _maxSafeInteger = 9007199254740991;

const _comparatorKeys = {
  'block',
  'providerFamily',
  'usefulness',
  'relevance',
  'engagement',
  'metricMature',
  'popularity',
  'newsPublisher',
  'publishedAt',
  'candidateId',
};

const _blocks = <Object?, ReaderPromotionBlock>{
  'ranked': ReaderPromotionBlock.ranked,
  'unranked': ReaderPromotionBlock.unranked,
};

const _usefulness = <Object?, ReaderPromotionUsefulness>{
  'important': ReaderPromotionUsefulness.important,
  'useful': ReaderPromotionUsefulness.useful,
  'context': ReaderPromotionUsefulness.context,
  'noise': ReaderPromotionUsefulness.noise,
  'insufficient_context': ReaderPromotionUsefulness.insufficientContext,
};

const _relevance = <Object?, ReaderPromotionRelevance>{
  'central': ReaderPromotionRelevance.central,
  'relevant': ReaderPromotionRelevance.relevant,
  'adjacent': ReaderPromotionRelevance.adjacent,
  'unrelated': ReaderPromotionRelevance.unrelated,
  'insufficient_context': ReaderPromotionRelevance.insufficientContext,
};

const _signalMethods = <Object?, ReaderPromotionSignalMethod>{
  'likes_plus_two_reposts': ReaderPromotionSignalMethod.likesPlusTwoReposts,
  'reddit_score': ReaderPromotionSignalMethod.redditScore,
  'hacker_news_points': ReaderPromotionSignalMethod.hackerNewsPoints,
  'max_stars_or_half_forks': ReaderPromotionSignalMethod.maxStarsOrHalfForks,
};
