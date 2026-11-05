import '../../domain/aggregates/reader_summary.dart';
import '../../domain/value_objects/top_posts_sort_order.dart';
import 'reader_summary_top_posts_order.dart';
import 'reader_summary_top_posts_projection.dart';

/// Local reveal, filtering and ordering of the backend's ranked sequence.
/// News never enter this display, and no attested membership is changed.
final class ReaderSummaryRankedPostsDisplay {
  ReaderSummaryRankedPostsDisplay({
    required ReaderSummaryTopPostsProjection projection,
    required int additionalVisibleCount,
    required TopPostsSortOrder sortOrder,
    required Set<String> hiddenProviders,
  }) {
    bool included(TopRead item) => !hiddenProviders.contains(item.providerKey);
    final available = projection.items.where(included).toList(growable: false);
    final ordered = readerSummaryTopPostsInOrder(available, sortOrder);
    // Filter and order the complete pool before revealing a page. Additional
    // membership must not hide a popular post from the first Likes page.
    final initialCount = projection.curatedPosts.isEmpty
        ? 12
        : projection.curatedPosts.length;
    items = ordered
        .take(initialCount + additionalVisibleCount)
        .toList(growable: false);
    availableCount = ordered.length;
    remainingCount = availableCount - items.length;
    showRevealControl =
        remainingCount > 0 ||
        (additionalVisibleCount > 0 && availableCount > initialCount);
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
