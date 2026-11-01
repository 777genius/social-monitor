import '../../domain/aggregates/reader_summary.dart';
import '../../domain/value_objects/top_posts_sort_order.dart';
import 'reader_summary_top_posts_order.dart';
import 'reader_summary_top_posts_projection.dart';

/// Local reveal, filtering and ordering of the backend's ranked sequence.
/// News never enter this display, and no attested membership is changed.
final class ReaderSummaryRankedPostsDisplay {
  ReaderSummaryRankedPostsDisplay({
    required ReaderSummaryTopPostsProjection projection,
    required bool expanded,
    required TopPostsSortOrder sortOrder,
    required Set<String> hiddenProviders,
  }) {
    bool included(TopRead item) => !hiddenProviders.contains(item.providerKey);
    final available = projection.items.where(included).toList(growable: false);
    // A board with only additional ranked cards has no smaller Top subset.
    final hasTopSubset = projection.curatedPosts.isNotEmpty;
    final visible = expanded || !hasTopSubset
        ? available
        : projection.curatedPosts.where(included).toList(growable: false);
    items = readerSummaryTopPostsInOrder(visible, sortOrder);
    availableCount = available.length;
    remainingCount = availableCount - items.length;
    showRevealControl =
        hasTopSubset &&
        projection.additionalNotableStories.isNotEmpty &&
        (expanded || remainingCount > 0);
    providerKeys = {
      for (final item in projection.items) item.providerKey,
    }.toList(growable: false);
  }

  late final List<TopRead> items;
  late final List<String> providerKeys;
  late final int availableCount;
  late final int remainingCount;
  late final bool showRevealControl;
}
