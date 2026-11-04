import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/top_posts_sort_order.dart';

import '../../support/top_posts_sort_test_fixtures.dart';

void main() {
  test('starts in Likes order when nothing is remembered', () {
    final store = topPostsSortStoreFor(FakeTopPostsSortPreferenceStore());
    addTearDown(store.dispose);

    expect(store.order, TopPostsSortOrder.engagement);
  });

  test('remembers a new choice and restores it after a reload', () {
    final preferences = FakeTopPostsSortPreferenceStore();
    final store = topPostsSortStoreFor(preferences);
    var notifications = 0;
    store.addListener(() => notifications += 1);

    store.select(TopPostsSortOrder.modelRank);

    expect(store.order, TopPostsSortOrder.modelRank);
    expect(preferences.saves, [TopPostsSortOrder.modelRank]);
    expect(notifications, 1);
    store.dispose();

    // A page reload builds a new store over the same browser storage.
    final reloaded = topPostsSortStoreFor(preferences);
    addTearDown(reloaded.dispose);
    expect(reloaded.order, TopPostsSortOrder.modelRank);
  });

  test('re-selecting the current order neither writes nor notifies', () {
    final preferences = FakeTopPostsSortPreferenceStore(
      TopPostsSortOrder.engagement,
    );
    final store = topPostsSortStoreFor(preferences);
    addTearDown(store.dispose);
    var notifications = 0;
    store.addListener(() => notifications += 1);

    store.select(TopPostsSortOrder.engagement);

    expect(preferences.saves, isEmpty);
    expect(notifications, 0);
  });
}
