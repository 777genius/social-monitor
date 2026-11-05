import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/top_posts_sort_order.dart';
import 'package:social_monitor_summaries/src/infrastructure/storage/browser_top_posts_sort_preference_store.dart';

void main() {
  const key = 'social_monitor.summaries.top_posts_sort_order.v1';

  BrowserTopPostsSortPreferenceStore storeOver(Map<String, String> storage) =>
      BrowserTopPostsSortPreferenceStore(
        read: (key) => storage[key],
        write: (key, value) => storage[key] = value,
      );

  test('round-trips both orders under one versioned key', () {
    final storage = <String, String>{};
    final store = storeOver(storage);

    store.save(TopPostsSortOrder.engagement);
    expect(storage, {key: 'engagement'});
    expect(store.load(), TopPostsSortOrder.engagement);

    store.save(TopPostsSortOrder.modelRank);
    expect(storage, {key: 'model_rank'});
    expect(store.load(), TopPostsSortOrder.modelRank);
  });

  test('missing, foreign or corrupted values read as nothing saved', () {
    expect(storeOver({}).load(), isNull);
    for (final value in ['', 'likes', 'ENGAGEMENT', '{"order":1}']) {
      expect(storeOver({key: value}).load(), isNull, reason: value);
    }
  });

  test('outside the browser nothing is remembered and nothing throws', () {
    const store = BrowserTopPostsSortPreferenceStore();

    store.save(TopPostsSortOrder.engagement);

    expect(store.load(), isNull);
  }, testOn: 'vm');
}
