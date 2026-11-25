import '../../domain/aggregates/reader_summary.dart';
import '../../domain/value_objects/reader_promotion_comparator.dart';
import '../../domain/value_objects/top_posts_sort_order.dart';

/// Popularity for the reader's Likes order. X uses only an exact native Likes
/// count; the signed likes-plus-reposts comparator is never a fallback. Other
/// providers retain their signed native score/points. Trending stays separate.
double? readerSummaryTopPostEngagement(TopRead item) {
  final comparator = item.promotionAttestation?.comparator;
  final isX =
      const {
        'x',
        'twitter',
        'x-twitter',
      }.contains(item.providerKey.trim().toLowerCase()) ||
      comparator?.providerFamily == 'x' ||
      comparator?.engagement?.method ==
          ReaderPromotionSignalMethod.likesPlusTwoReposts;
  if (!isX) return comparator?.engagement?.value;

  double? likes;
  for (final metric in item.providerMetrics) {
    if (!const {'like', 'likes'}.contains(metric.label.trim().toLowerCase())) {
      continue;
    }
    // Backend native metrics contain full integer counts. Rounded K/M labels
    // and combined engagement labels cannot recover an actual like count.
    final raw = metric.value.trim();
    if (!RegExp(r'^(?:\d+|\d{1,3}(?:,\d{3})+)$').hasMatch(raw)) return null;
    final count = int.tryParse(raw.replaceAll(',', ''));
    if (count == null || count > 9007199254740991) return null;
    final value = count.toDouble();
    if (likes != null && likes != value) return null;
    likes = value;
  }
  return likes;
}

/// Order the complete available ranked pool before the caller takes a page.
/// Model order is untouched. Likes ties (including missing counts) use only
/// source recency then identity, so neither reposts nor model order break ties.
List<TopRead> readerSummaryTopPostsInOrder(
  List<TopRead> lane,
  TopPostsSortOrder order,
) {
  switch (order) {
    case TopPostsSortOrder.modelRank:
      return lane;
    case TopPostsSortOrder.engagement:
      final ranked = [
        for (final item in lane) (readerSummaryTopPostEngagement(item), item),
      ];
      ranked.sort((left, right) {
        final (leftValue, leftItem) = left;
        final (rightValue, rightItem) = right;
        if (leftValue != rightValue) {
          if (leftValue == null) return 1;
          if (rightValue == null) return -1;
          return rightValue.compareTo(leftValue);
        }
        final leftTime = _publishedMicros(leftItem);
        final rightTime = _publishedMicros(rightItem);
        if (leftTime != rightTime) {
          if (leftTime == null) return 1;
          if (rightTime == null) return -1;
          return rightTime.compareTo(leftTime);
        }
        return _identity(leftItem).compareTo(_identity(rightItem));
      });
      return List<TopRead>.unmodifiable([for (final (_, item) in ranked) item]);
  }
}

BigInt? _publishedMicros(TopRead item) {
  final signed = item.promotionAttestation?.comparator?.publishedAt;
  if (signed != null) return signed.microsecondsSinceEpoch;
  final publishedAt = item.publishedAt;
  return publishedAt == null
      ? null
      : BigInt.from(publishedAt.millisecondsSinceEpoch) * BigInt.from(1000);
}

String _identity(TopRead item) =>
    item.promotionAttestation?.candidateId ??
    item.canonicalUrl ??
    item.storyClusterId ??
    '';
