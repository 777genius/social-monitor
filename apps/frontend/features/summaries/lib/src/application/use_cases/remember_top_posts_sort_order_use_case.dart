import '../../domain/value_objects/top_posts_sort_order.dart';
import '../contracts/top_posts_sort_preference_store.dart';

/// Remembers the Top posts order the reader picked, best effort.
final class RememberTopPostsSortOrderUseCase {
  const RememberTopPostsSortOrderUseCase(this._preferences);

  final TopPostsSortPreferenceStore _preferences;

  void execute(TopPostsSortOrder order) => _preferences.save(order);
}
