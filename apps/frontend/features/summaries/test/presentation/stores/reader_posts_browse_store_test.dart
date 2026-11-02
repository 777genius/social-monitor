import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/reader_posts_page.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/top_posts_sort_order.dart';

import '../../support/reader_posts_browse_test_catalog.dart';
import '../../support/top_posts_show_more_test_app.dart';
import '../../support/top_posts_sort_test_fixtures.dart';

void main() {
  test(
    'selected is the default and switching back discards a late all-post response',
    () async {
      final catalog = ControlledReaderPostCatalog();
      final store = catalog.createStore();
      addTearDown(store.dispose);
      store.bind(showMoreSummaryFixture(), TopPostsSortOrder.modelRank);
      expect(store.selectedOnly, isTrue);
      expect(catalog.queries, isEmpty);
      store.selectOnly(false);
      expect(catalog.queries, hasLength(1));
      store.selectOnly(true);
      catalog.responses.single.complete(
        const Result.success(
          ReaderPostsPage(items: [], total: 0, providerKeys: []),
        ),
      );
      await Future<void>.delayed(Duration.zero);
      expect(store.selectedOnly, isTrue);
      expect(store.state, isA<InitialViewState<ReaderPostsPage>>());
    },
  );

  test(
    'sort changes discard the old page and show more uses the server cursor',
    () async {
      final catalog = ControlledReaderPostCatalog();
      final store = catalog.createStore();
      addTearDown(store.dispose);
      final summary = showMoreSummaryFixture();
      store.bind(summary, TopPostsSortOrder.modelRank);
      store.selectOnly(false);
      store.bind(summary, TopPostsSortOrder.engagement);
      await Future<void>.delayed(Duration.zero);
      catalog.responses[1].complete(
        Result.success(
          ReaderPostsPage(
            items: [engagementTopPost('new', engagement: 100)],
            total: 2,
            providerKeys: const ['x-twitter'],
            nextCursor: 'synthetic-cursor',
          ),
        ),
      );
      await Future<void>.delayed(Duration.zero);
      catalog.responses[0].complete(
        const Result.success(
          ReaderPostsPage(items: [], total: 0, providerKeys: []),
        ),
      );
      await Future<void>.delayed(Duration.zero);
      final more = store.showMore();
      expect(catalog.queries.last.cursor, 'synthetic-cursor');
      expect(catalog.queries.last.order, TopPostsSortOrder.engagement);
      catalog.responses.last.complete(
        Result.success(
          ReaderPostsPage(
            items: [engagementTopPost('next', engagement: 90)],
            total: 2,
            providerKeys: const ['x-twitter'],
          ),
        ),
      );
      await more;
      final state = store.state as ReadyViewState<ReaderPostsPage>;
      expect(state.value.items.map((item) => item.title), [
        'Post new',
        'Post next',
      ]);
    },
  );
}
