import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/reader_posts_page.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/top_posts_sort_order.dart';

import '../../support/reader_posts_browse_test_catalog.dart';
import '../../support/top_posts_show_more_test_app.dart';
import '../../support/top_posts_sort_test_fixtures.dart';

void main() {
  test(
    'sort and filter refill the revealed window; collapse keeps first twelve',
    () async {
      final catalog = ControlledReaderPostCatalog();
      final store = catalog.createStore();
      addTearDown(store.dispose);
      final summary = showMoreSummaryFixture();
      store.bind(summary, TopPostsSortOrder.modelRank);
      await _settle();
      catalog.responses[0].complete(
        Result.success(_page('model', 0, cursor: 'm12')),
      );
      await _settle();
      final more = store.showMore();
      catalog.responses[1].complete(
        Result.success(_page('model', 12, cursor: 'm24')),
      );
      await more;
      expect(
        (store.state as ReadyViewState<ReaderPostsPage>).value.items,
        hasLength(24),
      );

      store.bind(summary, TopPostsSortOrder.engagement);
      await _settle();
      catalog.responses[2].complete(
        Result.success(_page('likes', 0, cursor: 'l12')),
      );
      await _settle();
      expect(catalog.queries[3].cursor, 'l12');
      expect(catalog.queries[3].order, TopPostsSortOrder.engagement);
      catalog.responses[3].complete(
        Result.success(_page('likes', 12, cursor: 'l24')),
      );
      await _settle();
      final sorted = (store.state as ReadyViewState<ReaderPostsPage>).value;
      expect(sorted.items, hasLength(24));
      expect(sorted.items.first.title, 'Post likes-0');

      store.toggleProvider('reddit');
      catalog.responses[4].complete(
        Result.success(_page('filtered', 0, cursor: 'f12', total: 15)),
      );
      await _settle();
      expect(catalog.queries[5].excludedProviders, {'reddit'});
      catalog.responses[5].complete(
        Result.success(_page('filtered', 12, count: 3, total: 15)),
      );
      await _settle();
      expect(
        (store.state as ReadyViewState<ReaderPostsPage>).value.items,
        hasLength(15),
      );
      store.showLess();
      final collapsed = (store.state as ReadyViewState<ReaderPostsPage>).value;
      expect(collapsed.items, hasLength(12));
      expect(collapsed.items.first.title, 'Post filtered-0');
      expect(collapsed.nextCursor, 'f12');
    },
  );

  test(
    'a late automatic refill cannot cross a selected-post scope change',
    () async {
      final catalog = ControlledReaderPostCatalog();
      final store = catalog.createStore();
      addTearDown(store.dispose);
      final summary = showMoreSummaryFixture();
      store.bind(summary, TopPostsSortOrder.modelRank);
      await _settle();
      catalog.responses[0].complete(
        Result.success(_page('model', 0, cursor: 'm12')),
      );
      await _settle();
      final more = store.showMore();
      catalog.responses[1].complete(
        Result.success(_page('model', 12, cursor: 'm24')),
      );
      await more;
      store.bind(summary, TopPostsSortOrder.engagement);
      await _settle();
      catalog.responses[2].complete(
        Result.success(_page('likes', 0, cursor: 'l12')),
      );
      await _settle();
      expect(catalog.queries, hasLength(4));
      store.selectOnly(true);
      catalog.responses[3].complete(Result.success(_page('late', 12)));
      await _settle();
      expect(store.selectedOnly, isTrue);
      expect(store.state, isA<InitialViewState<ReaderPostsPage>>());
    },
  );
}

Future<void> _settle() => Future<void>.delayed(Duration.zero);

ReaderPostsPage _page(
  String prefix,
  int start, {
  int count = 12,
  int total = 36,
  String? cursor,
}) => ReaderPostsPage(
  items: List.generate(
    count,
    (i) => engagementTopPost('$prefix-${start + i}', engagement: 100.0 - i),
  ),
  total: total,
  providerKeys: const ['x-twitter', 'reddit'],
  nextCursor: cursor,
);
