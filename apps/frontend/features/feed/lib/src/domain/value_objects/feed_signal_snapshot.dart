enum FeedSignalBand { noSignal, low, normal, high, breakout, unknown }

final class FeedSignalCohort {
  const FeedSignalCohort({
    required this.providerKey,
    required this.sourceKey,
    required this.contentType,
    required this.ageBucket,
    required this.baselineWindow,
    required this.sampleSize,
    required this.percentile,
    required this.zScore,
    required this.fallback,
  });

  final String providerKey;
  final String sourceKey;
  final String contentType;
  final String ageBucket;
  final String baselineWindow;
  final int sampleSize;
  final double percentile;
  final double zScore;
  final String fallback;
}

final class FeedSignalSnapshot {
  const FeedSignalSnapshot({
    required this.score,
    required this.band,
    required this.confidence,
    required this.basis,
    required this.computedAt,
    required this.cohort,
  });

  final int score;
  final FeedSignalBand band;
  final double confidence;
  final String basis;
  final DateTime computedAt;
  final FeedSignalCohort cohort;
}
