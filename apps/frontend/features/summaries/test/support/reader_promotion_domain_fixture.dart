import 'package:social_monitor_summaries/src/domain/policies/reader_promotion_board_policy.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/reader_promotion_comparator.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/reader_promotion_exact_timestamp.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/reader_promotion_popularity.dart';

import 'reader_promotion_comparator_fixture.dart';

/// Ranked comparator; [counts] makes the metric mature, `null` keeps it
/// unknown.
ReaderPromotionComparator rankedComparator(
  String candidateId, {
  ReaderPromotionUsefulness usefulness = ReaderPromotionUsefulness.useful,
  (int, int, int)? counts,
  double metric = 10,
  String family = 'reddit',
  String publishedAt = '2026-10-28T08:00:00.000000Z',
  Duration observedAfter = const Duration(hours: 7),
}) {
  final published = exactTimestamp(publishedAt);
  final popularity = counts == null
      ? null
      : ReaderPromotionPopularity(
          cohortSize: counts.$1,
          below: counts.$2,
          equal: counts.$3,
        );
  return ReaderPromotionComparator(
    block: ReaderPromotionBlock.ranked,
    providerFamily: family,
    usefulness: usefulness,
    relevance: ReaderPromotionRelevance.central,
    engagement: popularity == null
        ? null
        : ReaderPromotionEngagement(
            method: ReaderPromotionSignalMethod.redditScore,
            value: metric,
            observedAt: exactTimestamp(
              exactPromotionTimestamp(
                DateTime.parse(publishedAt).add(observedAfter),
              ),
            ),
          ),
    metricMature: popularity != null,
    popularity: popularity,
    newsPublisher: null,
    publishedAt: published,
    candidateId: candidateId,
  );
}

/// "News without rating" comparator from an RSS source.
ReaderPromotionComparator newsComparator(
  String candidateId, {
  ReaderPromotionUsefulness usefulness = ReaderPromotionUsefulness.useful,
  String publishedAt = '2026-10-28T08:00:00.000000Z',
  String? publisher,
}) => ReaderPromotionComparator(
  block: ReaderPromotionBlock.unranked,
  providerFamily: 'rss',
  usefulness: usefulness,
  relevance: ReaderPromotionRelevance.relevant,
  engagement: null,
  metricMature: false,
  popularity: null,
  newsPublisher: publisher,
  publishedAt: exactTimestamp(publishedAt),
  candidateId: candidateId,
);

ReaderPromotionBoardEntry boardEntry(
  ReaderPromotionComparator comparator, {
  String? storyId,
}) => ReaderPromotionBoardEntry(
  storyId: storyId ?? 'story-${comparator.candidateId}',
  comparator: comparator,
);

ReaderPromotionExactTimestamp exactTimestamp(String value) =>
    ReaderPromotionExactTimestamp.tryParse(value)!;
