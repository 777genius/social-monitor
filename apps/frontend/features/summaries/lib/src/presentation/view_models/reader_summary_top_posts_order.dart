import '../../domain/aggregates/reader_summary.dart';
import '../../domain/value_objects/top_posts_sort_order.dart';

/// Source engagement of a ranked card, the single popularity number of the
/// "By likes" order: X likes + 2 x reposts, Reddit score, Hacker News points,
/// GitHub max(stars, forks / 2) gained in the trending window.
///
/// It is the value the backend signed into the V3 promotion comparator, read
/// as is (also before the six-hour maturity). `null` means unknown: a legacy
/// V1/V2 card, a missing snapshot or a source without a rating. Display card
/// metrics are never parsed for ordering.
double? readerSummaryTopPostEngagement(TopRead item) =>
    item.promotionAttestation?.comparator?.engagement?.value;

/// Display order of the currently visible Top posts and revealed ranked cards.
///
/// [TopPostsSortOrder.modelRank] returns [lane] untouched. For
/// [TopPostsSortOrder.engagement] cards are ordered by
/// [readerSummaryTopPostEngagement] descending; equal values keep their model
/// order, and cards without a metric follow every measured card in their model
/// order. Ordering does not change backend membership or include news.
List<TopRead> readerSummaryTopPostsInOrder(
  List<TopRead> lane,
  TopPostsSortOrder order,
) {
  switch (order) {
    case TopPostsSortOrder.modelRank:
      return lane;
    case TopPostsSortOrder.engagement:
      final ranked = [
        for (final (modelIndex, item) in lane.indexed)
          (modelIndex, readerSummaryTopPostEngagement(item), item),
      ];
      // List.sort is not stable; the model index is the explicit tie-break.
      ranked.sort((left, right) {
        final (leftIndex, leftValue, _) = left;
        final (rightIndex, rightValue, _) = right;
        if (leftValue != rightValue) {
          if (leftValue == null) return 1;
          if (rightValue == null) return -1;
          return rightValue.compareTo(leftValue);
        }
        return leftIndex - rightIndex;
      });
      return List<TopRead>.unmodifiable([
        for (final (_, _, item) in ranked) item,
      ]);
  }
}
