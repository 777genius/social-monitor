import '../../application/contracts/top_posts_sort_preference_store.dart';
import '../../domain/value_objects/top_posts_sort_order.dart';
import 'browser_preference_storage.dart';

/// Keeps the Top posts order in per-origin browser preference storage
/// (ADR 398). The value is one stable code; anything else reads as nothing
/// saved, so a corrupted or foreign value falls back to the model order.
final class BrowserTopPostsSortPreferenceStore
    implements TopPostsSortPreferenceStore {
  const BrowserTopPostsSortPreferenceStore({
    String? Function(String key) read = readBrowserPreference,
    void Function(String key, String value) write = writeBrowserPreference,
  }) : _read = read,
       _write = write;

  /// Versioned key: a new value format gets a new key instead of a migration.
  static const storageKey = 'social_monitor.summaries.top_posts_sort_order.v1';

  final String? Function(String key) _read;
  final void Function(String key, String value) _write;

  @override
  TopPostsSortOrder? load() => switch (_read(storageKey)) {
    _modelRankCode => TopPostsSortOrder.modelRank,
    _engagementCode => TopPostsSortOrder.engagement,
    _ => null,
  };

  @override
  void save(TopPostsSortOrder order) => _write(storageKey, switch (order) {
    TopPostsSortOrder.modelRank => _modelRankCode,
    TopPostsSortOrder.engagement => _engagementCode,
  });
}

const _modelRankCode = 'model_rank';
const _engagementCode = 'engagement';
