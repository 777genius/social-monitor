import '../../domain/aggregates/reader_summary.dart';
import '../formatters/top_post_metrics.dart';

enum ReaderSummaryTopPostSort {
  relevance('Relevance'),
  engagement('Engagement'),
  githubPosition('GitHub position'),
  forYou('For you'),
  starsGained('Stars gained');

  const ReaderSummaryTopPostSort(this.label);

  final String label;
}

const readerSummaryPostSortOptions = <ReaderSummaryTopPostSort>[
  ReaderSummaryTopPostSort.relevance,
  ReaderSummaryTopPostSort.engagement,
];

const readerSummaryGithubTrendingSortOptions = <ReaderSummaryTopPostSort>[
  ReaderSummaryTopPostSort.githubPosition,
  ReaderSummaryTopPostSort.forYou,
  ReaderSummaryTopPostSort.starsGained,
];

int compareReaderSummaryTopPosts(
  TopRead first,
  TopRead second,
  ReaderSummaryTopPostSort sort,
) {
  return switch (sort) {
    ReaderSummaryTopPostSort.relevance ||
    ReaderSummaryTopPostSort.forYou => _compareForYou(first, second),
    ReaderSummaryTopPostSort.engagement => topPostEngagementScore(
      second,
    ).compareTo(topPostEngagementScore(first)),
    ReaderSummaryTopPostSort.githubPosition => _compareGithubPosition(
      first,
      second,
    ),
    ReaderSummaryTopPostSort.starsGained => _compareGithubStarsGained(
      first,
      second,
    ),
  };
}

int _compareGithubPosition(TopRead first, TopRead second) {
  final contextDiff = _compareGithubRankingContext(first, second);
  if (contextDiff != 0) {
    return contextDiff;
  }

  final positionDiff = _compareNullableAscending(
    githubTrendingPosition(first),
    githubTrendingPosition(second),
  );
  if (positionDiff != 0) {
    return positionDiff;
  }

  final starsDiff = _compareNullableDescending(
    githubTrendingStarsGained(first),
    githubTrendingStarsGained(second),
  );
  return starsDiff != 0 ? starsDiff : _compareForYou(first, second);
}

int _compareGithubStarsGained(TopRead first, TopRead second) {
  final contextDiff = _compareGithubRankingContext(first, second);
  if (contextDiff != 0) {
    return contextDiff;
  }

  final starsDiff = _compareNullableDescending(
    githubTrendingStarsGained(first),
    githubTrendingStarsGained(second),
  );
  if (starsDiff != 0) {
    return starsDiff;
  }

  final positionDiff = _compareNullableAscending(
    githubTrendingPosition(first),
    githubTrendingPosition(second),
  );
  return positionDiff != 0 ? positionDiff : _compareForYou(first, second);
}

int _compareGithubRankingContext(TopRead first, TopRead second) {
  final firstRanking = first.providerRanking;
  final secondRanking = second.providerRanking;
  if (firstRanking == null) {
    return secondRanking == null ? 0 : 1;
  }
  if (secondRanking == null) {
    return -1;
  }

  final capturedAtDiff = secondRanking.capturedAt.compareTo(
    firstRanking.capturedAt,
  );
  if (capturedAtDiff != 0) {
    return capturedAtDiff;
  }

  final windowDiff = firstRanking.window.name.compareTo(
    secondRanking.window.name,
  );
  if (windowDiff != 0) {
    return windowDiff;
  }

  return firstRanking.scope.comparisonKey.compareTo(
    secondRanking.scope.comparisonKey,
  );
}

int _compareForYou(TopRead first, TopRead second) {
  final relevanceDiff = topPostRelevanceSortScore(
    second,
  ).compareTo(topPostRelevanceSortScore(first));
  if (relevanceDiff != 0) {
    return relevanceDiff;
  }

  final signalDiff = second.signalScore.value.compareTo(
    first.signalScore.value,
  );
  if (signalDiff != 0) {
    return signalDiff;
  }

  return topPostEngagementScore(
    second,
  ).compareTo(topPostEngagementScore(first));
}

int _compareNullableAscending(num? first, num? second) {
  if (first == null) {
    return second == null ? 0 : 1;
  }
  if (second == null) {
    return -1;
  }
  return first.compareTo(second);
}

int _compareNullableDescending(num? first, num? second) {
  if (first == null) {
    return second == null ? 0 : 1;
  }
  if (second == null) {
    return -1;
  }
  return second.compareTo(first);
}
