import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/summary_mapper.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_top_posts_section_sliver.dart';

import '../../support/reader_promotion_board_api_fixture.dart';

void main() {
  testWidgets('shows News without rating below Top posts, without a Signal', (
    tester,
  ) async {
    _useViewport(tester, const Size(1200, 1400));
    await tester.pumpWidget(
      _TestApp(
        summary: _summary(top: [1], news: [2, 3]),
      ),
    );
    await tester.pumpAndSettle();

    final header = find.byKey(
      const ValueKey('reader-summary-news-without-rating'),
    );
    expect(header, findsOneWidget);
    expect(find.text('News without rating'), findsOneWidget);
    expect(
      tester.getTopLeft(header).dy,
      greaterThan(tester.getTopLeft(find.text('Synthetic story 1')).dy),
    );
    expect(find.text('Synthetic news 2'), findsOneWidget);
    expect(find.text('Synthetic news 3'), findsOneWidget);
    // The ranked card keeps its Signal (0.00 for an unknown metric); the news
    // cards have no rating and show none.
    expect(find.textContaining('Signal '), findsOneWidget);
    for (final story in ['story-2', 'story-3']) {
      expect(
        find.descendant(
          of: find.byKey(ValueKey('reader-summary-news-post-cluster:$story')),
          matching: find.textContaining('Signal'),
        ),
        findsNothing,
      );
    }
    expect(tester.takeException(), isNull);
  });

  testWidgets('hides the news block when the board has no news', (
    tester,
  ) async {
    _useViewport(tester, const Size(1200, 900));
    await tester.pumpWidget(
      _TestApp(
        summary: _summary(top: [1], news: []),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Synthetic story 1'), findsOneWidget);
    expect(
      find.byKey(const ValueKey('reader-summary-news-without-rating')),
      findsNothing,
    );
  });

  testWidgets('shows only the news block when no source has a rating', (
    tester,
  ) async {
    _useViewport(tester, const Size(1200, 900));
    await tester.pumpWidget(
      _TestApp(
        summary: _summary(top: [], news: [1]),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Synthetic news 1'), findsOneWidget);
    expect(
      find.byKey(const ValueKey('reader-summary-top-posts-board-posts')),
      findsNothing,
    );
    expect(
      find.byKey(const ValueKey('reader-summary-top-posts-unavailable')),
      findsNothing,
    );
  });

  testWidgets('builds news rows lazily from the loaded board', (tester) async {
    _useViewport(tester, const Size(1200, 700));
    await tester.pumpWidget(
      _TestApp(
        summary: _summary(top: [], news: [for (var i = 1; i <= 16; i += 1) i]),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Synthetic news 1'), findsOneWidget);
    expect(find.text('Synthetic news 16'), findsNothing);
    await tester.scrollUntilVisible(
      find.text('Synthetic news 16'),
      400,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Synthetic news 16'), findsOneWidget);
  });

  testWidgets('explains a day that waits for a ranking rebuild', (
    tester,
  ) async {
    _useViewport(tester, const Size(1200, 900));
    final summary = _summary(
      top: [],
      news: [],
      freshnessReason: 'ranking_policy_changed',
    );
    expect(
      summary.content.promotionBoardAvailability,
      ReaderSummaryPromotionBoardAvailability.rebuildRequired,
    );
    await tester.pumpWidget(_TestApp(summary: summary));
    await tester.pumpAndSettle();

    expect(
      find.byKey(const ValueKey('reader-summary-top-posts-rebuild-required')),
      findsOneWidget,
    );
    expect(find.text('Top posts are waiting for a rebuild'), findsOneWidget);
    expect(
      find.byKey(const ValueKey('reader-summary-top-posts-unavailable')),
      findsNothing,
    );
  });
}

ReaderSummary _summary({
  required List<int> top,
  required List<int> news,
  String? freshnessReason,
}) => const SummaryMapper().readerSummaryToDomain(
  promotionBoardSummaryApiDto(
    top: top,
    news: news,
    freshnessReason: freshnessReason,
  ),
);

void _useViewport(WidgetTester tester, Size size) {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(() {
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });
}

class _TestApp extends StatelessWidget {
  const _TestApp({required this.summary});

  final ReaderSummary summary;

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
                onOpenUrl: (_) {},
              ),
            ],
          ),
        ),
      ),
    );
  }
}
