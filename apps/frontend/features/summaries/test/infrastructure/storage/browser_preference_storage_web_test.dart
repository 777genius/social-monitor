@TestOn('browser')
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/top_posts_sort_order.dart';
import 'package:social_monitor_summaries/src/infrastructure/storage/browser_top_posts_sort_preference_store.dart';

// Runs only with `fvm flutter test --platform chrome`: proves the real
// per-origin storage binding, which the VM suite replaces with the stub.
void main() {
  test('the browser remembers the order for the next store instance', () {
    const BrowserTopPostsSortPreferenceStore().save(
      TopPostsSortOrder.engagement,
    );
    expect(
      const BrowserTopPostsSortPreferenceStore().load(),
      TopPostsSortOrder.engagement,
    );

    const BrowserTopPostsSortPreferenceStore().save(
      TopPostsSortOrder.modelRank,
    );
    expect(
      const BrowserTopPostsSortPreferenceStore().load(),
      TopPostsSortOrder.modelRank,
    );
  });
}
