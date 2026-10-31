import '../../domain/value_objects/top_posts_sort_order.dart';

/// Remembers the reader's Top posts order between page reloads.
///
/// Both methods are synchronous so the first frame already renders the saved
/// order. Persistence is best effort: an unavailable, blocked or full storage
/// makes [load] return `null` and [save] a no-op; neither ever throws.
abstract interface class TopPostsSortPreferenceStore {
  /// The saved order, or `null` when nothing valid is saved.
  TopPostsSortOrder? load();

  void save(TopPostsSortOrder order);
}
