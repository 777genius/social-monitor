/// Signed V3 comparator JSON in the backend wire shape
/// (`ReaderPostPromotionComparator`).
///
/// A ranked post with [popularity] gets a mature metric observed
/// [observedAfter] after publication; without it the metric is unknown.
Map<String, Object?> rankedComparatorJson({
  required String candidateId,
  required String publishedAt,
  String usefulness = 'useful',
  String relevance = 'central',
  String providerFamily = 'reddit',
  ReaderPromotionCountsFixture? popularity,
  num engagementValue = 10,
  Duration observedAfter = const Duration(hours: 7),
  String method = 'reddit_score',
}) {
  final published = DateTime.parse(publishedAt);
  return {
    'block': 'ranked',
    'providerFamily': providerFamily,
    'usefulness': usefulness,
    'relevance': relevance,
    'engagement': popularity == null
        ? null
        : {
            'method': method,
            'value': engagementValue,
            'observedAt': exactPromotionTimestamp(published.add(observedAfter)),
          },
    'metricMature': popularity != null,
    'popularity': popularity?.toJson(),
    'newsPublisher': null,
    'publishedAt': publishedAt,
    'candidateId': candidateId,
  };
}

/// Comparator of a "News without rating" post: no metric, no popularity.
Map<String, Object?> newsComparatorJson({
  required String candidateId,
  required String publishedAt,
  String usefulness = 'useful',
  String relevance = 'central',
  String? newsPublisher,
}) => {
  'block': 'unranked',
  'providerFamily': 'rss',
  'usefulness': usefulness,
  'relevance': relevance,
  'engagement': null,
  'metricMature': false,
  'popularity': null,
  'newsPublisher': newsPublisher,
  'publishedAt': publishedAt,
  'candidateId': candidateId,
};

/// Popularity counts inside one provider family.
final class ReaderPromotionCountsFixture {
  const ReaderPromotionCountsFixture(this.cohortSize, this.below, this.equal);

  final int cohortSize;
  final int below;
  final int equal;

  Map<String, Object?> toJson() => {
    'cohortSize': cohortSize,
    'below': below,
    'equal': equal,
  };
}

/// Six-digit UTC timestamp, the only form the backend signs.
String exactPromotionTimestamp(DateTime value) {
  final utc = value.toUtc();
  String two(int part) => part.toString().padLeft(2, '0');
  final micros = utc.millisecond * 1000 + utc.microsecond;
  return '${utc.year.toString().padLeft(4, '0')}-${two(utc.month)}-'
      '${two(utc.day)}T${two(utc.hour)}:${two(utc.minute)}:${two(utc.second)}.'
      '${micros.toString().padLeft(6, '0')}Z';
}
