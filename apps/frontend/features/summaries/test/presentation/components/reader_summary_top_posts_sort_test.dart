import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/top_posts_sort_order.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_top_posts_section_sliver.dart';
import 'package:social_monitor_summaries/src/presentation/stores/top_posts_sort_store.dart';

import '../../support/top_posts_sort_test_fixtures.dart';
import '../../support/top_posts_test_fixtures.dart';

const _sortControl = ValueKey('reader-summary-top-posts-sort');
const _byLikes = ValueKey('reader-summary-top-posts-sort-likes');

void main() {
  testWidgets('By likes reorders only the visible lane with stable rows', (
    tester,
  ) async {
    _useViewport(tester);
    final semantics = tester.ensureSemantics();
    final preferences = FakeTopPostsSortPreferenceStore();
    final sortStore = topPostsSortStoreFor(preferences);
    addTearDown(sortStore.dispose);
    await tester.pumpWidget(_TestApp(summary: _board(), sortStore: sortStore));
    await tester.pumpAndSettle();

    expect(find.bySemanticsLabel('Top posts order'), findsOneWidget);
    expect(
      tester.getSemantics(find.bySemanticsLabel('Sort by model rank')),
      isSemantics(isSelected: true, isInMutuallyExclusiveGroup: true),
    );
    expect(_visibleOrder(tester), ['low', 'unknown', 'high', 'mid']);
    final highRow = tester.state(find.byKey(_rowKey('high')));

    await tester.tap(find.byKey(_byLikes));
    await tester.pumpAndSettle();

    expect(_visibleOrder(tester), ['high', 'mid', 'low', 'unknown']);
    expect(
      tester.state(find.byKey(_rowKey('high'))),
      same(highRow),
      reason: 'the row keeps its element when the order moves it',
    );
    expect(
      tester.getSemantics(find.bySemanticsLabel('Sort by likes')),
      isSemantics(isSelected: true),
    );
    expect(find.textContaining('Signal '), findsNWidgets(4));
    expect(preferences.saves, [TopPostsSortOrder.engagement]);

    // "Show more" is sorted inside its own lane; no card changes lane.
    await tester.tap(
      find.byKey(
        const ValueKey('reader-summary-top-posts-board-additional-stories'),
      ),
    );
    await tester.pumpAndSettle();
    expect(_visibleOrder(tester), ['more-high', 'more-low']);
    expect(find.text('Post high'), findsNothing);

    // News without rating keeps its own model order below the boards.
    expect(
      tester.getTopLeft(find.text('Post news-first')).dy,
      lessThan(tester.getTopLeft(find.text('Post news-second')).dy),
    );
    semantics.dispose();
  });

  testWidgets('a reload restores the remembered order on the first frame', (
    tester,
  ) async {
    _useViewport(tester);
    final preferences = FakeTopPostsSortPreferenceStore(
      TopPostsSortOrder.engagement,
    );
    final sortStore = topPostsSortStoreFor(preferences);
    addTearDown(sortStore.dispose);

    await tester.pumpWidget(_TestApp(summary: _board(), sortStore: sortStore));

    expect(_visibleOrder(tester), ['high', 'mid', 'low', 'unknown']);
    expect(preferences.saves, isEmpty);
  });

  testWidgets('without a sort store the board keeps the model order only', (
    tester,
  ) async {
    _useViewport(tester);
    await tester.pumpWidget(_TestApp(summary: _board(), sortStore: null));
    await tester.pumpAndSettle();

    expect(find.byKey(_sortControl), findsNothing);
    expect(_visibleOrder(tester), ['low', 'unknown', 'high', 'mid']);
  });

  testWidgets('compact width wraps the order control without overflow', (
    tester,
  ) async {
    _useViewport(tester, const Size(360, 1600));
    final sortStore = topPostsSortStoreFor(FakeTopPostsSortPreferenceStore());
    addTearDown(sortStore.dispose);

    await tester.pumpWidget(_TestApp(summary: _board(), sortStore: sortStore));
    await tester.pumpAndSettle();

    expect(find.byKey(_sortControl), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

ReaderSummary _board() => topPostsSummaryFixture(
  topReads: [
    engagementTopPost('low', engagement: 5),
    engagementTopPost('unknown'),
    engagementTopPost('high', engagement: 900),
    engagementTopPost('mid', engagement: 100),
  ],
  selectedPosts: [
    engagementTopPost(
      'more-low',
      engagement: 1,
      placement: ReaderPostPromotionPlacement.additional,
    ),
    engagementTopPost(
      'more-high',
      engagement: 1000,
      placement: ReaderPostPromotionPlacement.additional,
    ),
  ],
  newsWithoutRatingPosts: [
    engagementTopPost(
      'news-first',
      placement: ReaderPostPromotionPlacement.news,
    ),
    engagementTopPost(
      'news-second',
      placement: ReaderPostPromotionPlacement.news,
    ),
  ],
);

ValueKey<String> _rowKey(String slug) =>
    ValueKey('reader-summary-top-post-cluster:story:$slug');

/// Slugs of the ranked rows on screen, top to bottom.
List<String> _visibleOrder(WidgetTester tester) {
  final rows = <(double, String)>[];
  for (final slug in [
    'low',
    'unknown',
    'high',
    'mid',
    'more-low',
    'more-high',
  ]) {
    final row = find.byKey(_rowKey(slug));
    if (row.evaluate().isNotEmpty) {
      rows.add((tester.getTopLeft(row).dy, slug));
    }
  }
  rows.sort((left, right) => left.$1.compareTo(right.$1));
  return [for (final (_, slug) in rows) slug];
}

void _useViewport(WidgetTester tester, [Size size = const Size(1200, 2400)]) {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(() {
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });
}

class _TestApp extends StatelessWidget {
  const _TestApp({required this.summary, required this.sortStore});

  final ReaderSummary summary;
  final TopPostsSortStore? sortStore;

  @override
  Widget build(BuildContext context) {
    final theme = AppTheme.light();
    return AppHeadlessScope(
      theme: theme,
      appBuilder: (overlayBuilder) => MaterialApp(
        theme: theme,
        builder: overlayBuilder,
        home: Scaffold(
          body: CustomScrollView(
            slivers: [
              ReaderSummaryTopPostsSectionSliver(
                summary: summary,
                contentPadding: const EdgeInsets.all(AppSpacing.md),
                sortStore: sortStore,
                onOpenUrl: (_) {},
              ),
            ],
          ),
        ),
      ),
    );
  }
}
