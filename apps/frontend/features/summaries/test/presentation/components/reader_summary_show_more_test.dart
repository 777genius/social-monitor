import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/top_posts_sort_order.dart';

import '../../support/top_posts_show_more_test_app.dart';
import '../../support/top_posts_sort_test_fixtures.dart';
import '../../support/top_posts_test_fixtures.dart';

const _showMore = ValueKey('reader-summary-top-posts-show-more');

void main() {
  testWidgets('additional-only ranked board is immediately visible', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1200, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final summary = topPostsSummaryFixture(
      topReads: const [],
      selectedPosts: [
        engagementTopPost(
          'extra',
          engagement: 900,
          placement: ReaderPostPromotionPlacement.additional,
        ),
      ],
    );
    for (final sliver in [false, true]) {
      await tester.pumpWidget(
        TopPostsShowMoreTestApp(
          key: ValueKey(sliver),
          sliver: sliver,
          builder: (_) => (summary, TopPostsSortOrder.modelRank),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Post extra'), findsOneWidget);
      expect(find.text('Showing 1 of 1 ranked posts'), findsOneWidget);
      expect(
        find.text('No posts match the current source filters.'),
        findsNothing,
      );
      expect(find.byKey(_showMore), findsNothing);
      expect(find.text('Show less'), findsNothing);
    }
  });

  for (final sliver in [false, true]) {
    testWidgets(
      '${sliver ? 'sliver' : 'inline'} reveals one sorted ranked list',
      (tester) async {
        tester.view.physicalSize = const Size(1200, 2400);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        var summary = _summary();
        var order = TopPostsSortOrder.modelRank;
        late StateSetter update;
        await tester.pumpWidget(
          TopPostsShowMoreTestApp(
            sliver: sliver,
            builder: (setState) {
              update = setState;
              return (summary, order);
            },
            onSort: (value) => update(() => order = value),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.text('Additional stories'), findsNothing);
        expect(find.text('Showing 2 of 3 ranked posts'), findsOneWidget);
        expect(find.text('Show more (1)'), findsOneWidget);
        expect(_rankedOrder(tester), ['first', 'second']);
        expect(find.text('Post news'), findsOneWidget);

        await tester.tap(
          find.byKey(const ValueKey('reader-summary-top-posts-sort-likes')),
        );
        await tester.pumpAndSettle();
        expect(_rankedOrder(tester), ['second', 'first']);
        await tester.ensureVisible(find.byKey(_showMore));
        await tester.tap(find.byKey(_showMore));
        await tester.pumpAndSettle();
        expect(find.text('Showing 3 of 3 ranked posts'), findsOneWidget);
        expect(_rankedOrder(tester), ['extra', 'second', 'first']);
        expect(order, TopPostsSortOrder.engagement);
        expect(
          tester.getTopLeft(find.text('Post news')).dy,
          greaterThan(tester.getTopLeft(find.byKey(_showMore)).dy),
        );

        await tester.tap(
          find.byKey(const ValueKey('reader-summary-top-posts-sort-model')),
        );
        await tester.pumpAndSettle();
        expect(_rankedOrder(tester), ['first', 'second', 'extra']);
        await tester.tap(
          find.byKey(const ValueKey('reader-summary-top-posts-filters')),
        );
        await tester.pumpAndSettle();
        await tester.tap(
          find.widgetWithText(CheckedPopupMenuItem<String>, 'X (Twitter)'),
        );
        await tester.pumpAndSettle();
        expect(_rankedOrder(tester), ['first', 'second']);
        expect(find.text('Showing 2 of 2 ranked posts'), findsOneWidget);
        await tester.tap(
          find.byKey(const ValueKey('reader-summary-top-posts-filters')),
        );
        await tester.pumpAndSettle();
        await tester.tap(
          find.widgetWithText(CheckedPopupMenuItem<String>, 'X (Twitter)'),
        );
        await tester.pumpAndSettle();
        await tester.ensureVisible(find.byKey(_showMore));
        await tester.tap(find.byKey(_showMore));
        await tester.pumpAndSettle();
        expect(_rankedOrder(tester), ['first', 'second']);
        expect(find.text('Show more (1)'), findsOneWidget);

        await tester.tap(find.byKey(_showMore));
        await tester.pumpAndSettle();
        update(() => summary = _summary(nextPeriod: true));
        await tester.pumpAndSettle();
        expect(find.text('Show more (1)'), findsOneWidget);
        expect(_rankedOrder(tester), ['first', 'second']);
        await tester.tap(find.byKey(_showMore));
        await tester.pumpAndSettle();
        update(
          () => summary = _summary(nextPeriod: true, extra: 'replacement'),
        );
        await tester.pumpAndSettle();
        expect(find.text('Post replacement'), findsNothing);
        expect(find.text('Show more (1)'), findsOneWidget);
        expect(tester.takeException(), isNull);
      },
    );
  }
}

ReaderSummary _summary({bool nextPeriod = false, String extra = 'extra'}) =>
    topPostsSummaryFixture(
      topReads: [
        engagementTopPost('first', engagement: 10),
        engagementTopPost('second', engagement: 100),
      ],
      selectedPosts: [
        engagementTopPost(
          extra,
          engagement: 900,
          providerKey: 'x-twitter',
          placement: ReaderPostPromotionPlacement.additional,
        ),
      ],
      newsWithoutRatingPosts: [
        engagementTopPost(
          'news',
          engagement: 9000,
          placement: ReaderPostPromotionPlacement.news,
        ),
      ],
      period: SummaryPeriod(
        cadence: SummaryPeriodCadence.daily,
        startedAt: DateTime.utc(2026, 10, nextPeriod ? 29 : 28),
        endedAt: DateTime.utc(2026, 10, nextPeriod ? 30 : 29),
        timezone: 'UTC',
      ),
    );

List<String> _rankedOrder(WidgetTester tester) {
  final rows = <(double, String)>[];
  for (final slug in ['first', 'second', 'extra', 'replacement']) {
    final row = find.byKey(
      ValueKey('reader-summary-top-post-cluster:story:$slug'),
    );
    if (row.evaluate().isNotEmpty) rows.add((tester.getTopLeft(row).dy, slug));
  }
  rows.sort((a, b) => a.$1.compareTo(b.$1));
  return [for (final row in rows) row.$2];
}
