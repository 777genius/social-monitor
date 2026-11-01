import '../../domain/value_objects/top_posts_sort_order.dart';
import '../contracts/top_posts_sort_preference_store.dart';

/// The reader's remembered Top posts order, or the model order when nothing
/// valid is remembered.
final class LoadTopPostsSortOrderUseCase {
  const LoadTopPostsSortOrderUseCase(this._preferences);

  final TopPostsSortPreferenceStore _preferences;

  TopPostsSortOrder execute() =>
      _preferences.load() ?? TopPostsSortOrder.modelRank;
}
