import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/reader_posts_page.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/top_posts_sort_order.dart';

import '../../support/reader_posts_browse_test_catalog.dart';
import '../../support/top_posts_sort_test_fixtures.dart';

void main() {
  test('missing-day binding forces likes and disables AI picks', () async {
    final catalog = ControlledReaderPostCatalog();
    final store = catalog.createStore();
    addTearDown(store.dispose);
    final day7 = _day(7);

    store.bindUnpublishedDay(day7);
    await _settle();
    expect(store.selectedOnly, isFalse);
    expect(catalog.queries.single.order, TopPostsSortOrder.engagement);
    expect(catalog.queries.single.period, day7);

    catalog.responses.single.complete(
      const Result.success(
        ReaderPostsPage(items: [], total: 0, providerKeys: []),
      ),
    );
    await _settle();
    expect(store.state, isA<ReadyViewState<ReaderPostsPage>>());
  });

  test('changing from November 7 to 8 discards late 7th response', () async {
    final catalog = ControlledReaderPostCatalog();
    final store = catalog.createStore();
    addTearDown(store.dispose);
    store.bindUnpublishedDay(_day(7));
    await _settle();

    store.bindUnpublishedDay(_day(8));
    await _settle();
    expect(catalog.queries, hasLength(2));
    expect(catalog.queries.last.period, _day(8));

    catalog.responses.last.complete(
      Result.success(
        ReaderPostsPage(
          items: [engagementTopPost('nov8', engagement: 120)],
          total: 1,
          providerKeys: const ['reddit'],
        ),
      ),
    );
    await _settle();
    catalog.responses.first.complete(
      Result.success(
        ReaderPostsPage(
          items: [engagementTopPost('nov7', engagement: 200)],
          total: 1,
          providerKeys: const ['reddit'],
        ),
      ),
    );
    await _settle();

    final loaded = store.state as ReadyViewState<ReaderPostsPage>;
    expect(loaded.value.items.single.title, 'Post nov8');
    expect(store.selectedOnly, isFalse);
  });
}

SummaryPeriod _day(int day) => SummaryPeriodPreset.daily.resolveForCalendarDate(
  DateTime(2026, 11, day),
  now: DateTime.utc(2026, 11, 8, 12),
);

Future<void> _settle() => Future<void>.delayed(Duration.zero);
