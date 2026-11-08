import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/reader_captured_source.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/reader_posts_page.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/top_posts_sort_order.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_unpublished_posts_sliver.dart';
import 'package:social_monitor_summaries/src/presentation/stores/reader_posts_browse_store.dart';

import '../../support/reader_posts_browse_test_catalog.dart';
import '../../support/top_posts_test_fixtures.dart';

void main() {
  testWidgets('7 November: renders originals and X text without AI prose', (
    tester,
  ) async {
    final catalog = ControlledReaderPostCatalog();
    final store = catalog.createStore();
    addTearDown(store.dispose);
    final day = _day(7);
    await _pumpBoard(tester, store, day);
    await tester.pump();

    expect(catalog.queries, hasLength(1));
    expect(catalog.queries.single.period, day);
    expect(catalog.queries.single.order, TopPostsSortOrder.engagement);

    catalog.responses.single.complete(
      Result.success(
        ReaderPostsPage(
          items: [_redditPost, _xPost],
          total: 2,
          providerKeys: const ['reddit', 'x-twitter'],
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Top posts by likes'), findsOneWidget);
    expect(find.text('Original Reddit headline'), findsOneWidget);
    expect(find.text('Original source excerpt for Reddit'), findsOneWidget);
    expect(find.text('Original X post, exactly as collected.'), findsOneWidget);
    expect(find.text('123'), findsWidgets);
    expect(find.text('Generated AI headline'), findsNothing);
    expect(find.text('Generated AI description'), findsNothing);
    expect(find.text('Synthetic X title'), findsNothing);
    expect(find.text('AI picks'), findsNothing);
    expect(find.textContaining('AI assessment'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('8 November: Show more uses server cursor for likes order', (
    tester,
  ) async {
    final catalog = ControlledReaderPostCatalog();
    final store = catalog.createStore();
    addTearDown(store.dispose);
    final day = _day(8);
    await _pumpBoard(tester, store, day);
    await tester.pump();

    catalog.responses.single.complete(
      Result.success(
        ReaderPostsPage(
          items: [_xPost],
          total: 2,
          providerKeys: const ['x-twitter'],
          nextCursor: 'nov-08-next',
        ),
      ),
    );
    await tester.pumpAndSettle();

    final showMore = find.text('Show more');
    expect(showMore, findsOneWidget);
    await tester.tap(showMore);
    await tester.pump();

    expect(catalog.queries, hasLength(2));
    expect(catalog.queries.last.period, day);
    expect(catalog.queries.last.order, TopPostsSortOrder.engagement);
    expect(catalog.queries.last.cursor, 'nov-08-next');

    catalog.responses.last.complete(
      Result.success(
        ReaderPostsPage(
          items: [_redditPost],
          total: 2,
          providerKeys: const ['reddit', 'x-twitter'],
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Original Reddit headline'), findsOneWidget);
    expect(find.text('Original X post, exactly as collected.'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

SummaryPeriod _day(int day) => SummaryPeriodPreset.daily.resolveForCalendarDate(
  DateTime(2026, 11, day),
  now: DateTime.utc(2026, 11, 8, 12),
);

TopRead get _redditPost => topPostFixture(
  title: 'Generated AI headline',
  summary: 'Generated AI description',
  providerKey: 'reddit',
  storyClusterId: 'source:reddit-test',
  canonicalUrl: 'https://www.reddit.com/r/example/comments/test',
  capturedSource: const ReaderCapturedSource(
    title: 'Original Reddit headline',
    body: 'Original source excerpt for Reddit',
    captureAvailability: ReaderCaptureAvailability.available,
    reviewAvailability: ReaderSourceReviewAvailability.bodyPresent,
  ),
  providerMetrics: const [ProviderMetric(label: 'Score', value: '90')],
);

TopRead get _xPost => topPostFixture(
  title: 'Synthetic X title',
  summary: 'Generated AI description',
  providerKey: 'x-twitter',
  storyClusterId: 'source:x-test',
  canonicalUrl: 'https://x.com/example/status/123',
  capturedSource: const ReaderCapturedSource(
    title: 'Synthetic X title',
    body: 'Original X post, exactly as collected.',
    captureAvailability: ReaderCaptureAvailability.available,
    reviewAvailability: ReaderSourceReviewAvailability.bodyPresent,
  ),
  providerMetrics: const [ProviderMetric(label: 'Likes', value: '123')],
);

Future<void> _pumpBoard(
  WidgetTester tester,
  ReaderPostsBrowseStore store,
  SummaryPeriod period,
) async {
  tester.view.physicalSize = const Size(1280, 820);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final theme = AppTheme.light();
  await tester.pumpWidget(
    AppHeadlessScope(
      theme: theme,
      appBuilder: (overlayBuilder) => MaterialApp(
        theme: theme,
        builder: overlayBuilder,
        home: Scaffold(
          body: CustomScrollView(
            slivers: [
              ReaderSummaryUnpublishedPostsSliver(
                store: store,
                period: period,
                contentPadding: const EdgeInsets.all(AppSpacing.md),
                onOpenUrl: (_) {},
              ),
            ],
          ),
        ),
      ),
    ),
  );
}
