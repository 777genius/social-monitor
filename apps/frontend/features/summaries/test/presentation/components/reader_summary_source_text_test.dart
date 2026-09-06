import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_brief_surface.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_sections.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_source_text.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_top_read_details.dart';
import 'package:social_monitor_summaries/src/presentation/view_models/reader_summary_top_posts_projection.dart';

import '../../support/source_context_test_fixtures.dart';
import '../../support/top_posts_test_fixtures.dart';

void main() {
  testWidgets('interest evidence preserves contextual titles', (tester) async {
    await tester.pumpWidget(
      _app(
        ReaderSummaryInterestSections(
          sections: [
            ReaderInterestSection(
              title: 'Test interest',
              insight: 'Synthetic insight',
              items: [topPostFixture(title: sourceContextText)],
              citationIds: const [],
            ),
          ],
        ),
        scale: 2,
      ),
    );
    expect(find.textContaining('Atlas'), findsNothing);
    await tester.tap(find.widgetWithText(AppButton, 'Source text'));
    await tester.pumpAndSettle();
    expect(find.text(sourceContextText), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'evidence snippet reveals qualification without opening its URL',
    (tester) async {
      String? opened;
      await tester.pumpWidget(
        _app(
          ReaderSummaryTopReadDetails(
            index: 0,
            item: topPostFixture(
              title: 'Ordinary title',
              citationIds: [sourceContextCitation.id],
            ),
            citations: const [sourceContextCitation],
            citationsInitiallyExpanded: true,
            onOpenUrl: (url) => opened = url,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.textContaining('Atlas'), findsNothing);
      expect(find.text('Source text'), findsOneWidget);
      await tester.ensureVisible(find.text('Source text'));
      await tester.tap(find.widgetWithText(AppButton, 'Source text'));
      await tester.pumpAndSettle();
      expect(find.text(sourceContextText), findsOneWidget);
      expect(opened, isNull);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('fallback brief headline exposes the full source', (
    tester,
  ) async {
    await tester.pumpWidget(
      _app(
        ReaderSummaryExecutiveBrief(
          summary: sourceContextSummary(),
          citationsById: const {},
          onOpenUrl: (_) {},
        ),
      ),
    );
    expect(find.text('Source text'), findsOneWidget);
    expect(find.textContaining('Atlas'), findsNothing);
    await tester.tap(find.widgetWithText(AppButton, 'Source text'));
    await tester.pumpAndSettle();
    expect(find.text(sourceContextText), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('keyboard disclosure exposes qualification and resets', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    try {
      await tester.pumpWidget(
        _app(const ReaderSummarySourceText(sourceContextText)),
      );
      expect(find.text('Source text'), findsOneWidget);
      expect(find.bySemanticsLabel('Source text'), findsOneWidget);
      expect(find.textContaining('Atlas'), findsNothing);
      await tester.sendKeyEvent(LogicalKeyboardKey.tab);
      await tester.pump();
      expect(FocusManager.instance.primaryFocus, isNotNull);
      await tester.sendKeyEvent(LogicalKeyboardKey.enter);
      await tester.pumpAndSettle();
      expect(find.text(sourceContextText), findsOneWidget);
      expect(find.byType(SelectableText), findsOneWidget);
      await tester.sendKeyEvent(LogicalKeyboardKey.space);
      await tester.pumpAndSettle();
      expect(find.byType(SelectableText), findsNothing);
      await tester.sendKeyEvent(LogicalKeyboardKey.enter);
      await tester.pumpAndSettle();
      expect(find.byType(SelectableText), findsOneWidget);
      await tester.pumpWidget(
        _app(
          const ReaderSummarySourceText(
            'Replacement source. Qualification for the next item.',
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Source text'), findsOneWidget);
      expect(find.text(sourceContextText), findsNothing);
      expect(find.byType(SelectableText), findsNothing);
    } finally {
      semantics.dispose();
    }
  });

  testWidgets('enormous source stays bounded and its end can be read', (
    tester,
  ) async {
    final source = '${'Synthetic context. ' * 15000}END: approval required.';
    await tester.pumpWidget(_app(ReaderSummarySourceText(source), scale: 2));
    await tester.tap(find.widgetWithText(AppButton, 'Source text'));
    await tester.pumpAndSettle();
    final scroll = find
        .descendant(
          of: find.byType(ReaderSummarySourceText),
          matching: find.byType(Scrollable),
        )
        .first;
    final position = tester.state<ScrollableState>(scroll).position;
    expect(
      tester.getSize(find.byType(ReaderSummarySourceText)).height,
      lessThan(330),
    );
    position.jumpTo(position.maxScrollExtent);
    await tester.pumpAndSettle();
    expect(position.extentAfter, 0);
    expect(
      tester.widget<SelectableText>(find.byType(SelectableText)).data,
      endsWith('END: approval required.'),
    );
    expect(tester.takeException(), isNull);
  });

  for (final kind in [
    ReaderSummaryCardKind.curatedTopRead,
    ReaderSummaryCardKind.additionalNotableStory,
  ]) {
    for (final dense in [false, true]) {
      testWidgets(
        '$kind dense=$dense retains source context at narrow large text',
        (tester) async {
          tester.view.physicalSize = const Size(390, 1000);
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          final item = topPostFixture(
            title: sourceContextText,
            cardKind: kind,
            storyClusterId: 'synthetic-context',
            canonicalUrl: 'https://example.test/source',
          );
          final summary = topPostsSummaryFixture(
            topReads: kind == ReaderSummaryCardKind.curatedTopRead
                ? [item]
                : [],
            selectedPosts: kind == ReaderSummaryCardKind.additionalNotableStory
                ? [item]
                : [],
          );
          String? opened;
          await tester.pumpWidget(
            _app(
              ReaderSummaryTopPosts(
                projection: readerSummaryTopPostsProjection(summary),
                selectedPostCount: 1,
                period: summary.period,
                citationsById: const {},
                ratingFor: null,
                onRated: null,
                onOpenUrl: (url) => opened = url,
              ),
              scale: 2,
            ),
          );
          await tester.pumpAndSettle();
          if (dense) {
            await tester.tap(
              find.byKey(
                const ValueKey('reader-summary-top-posts-view-compact'),
              ),
            );
            await tester.pumpAndSettle();
          }
          expect(find.text('Source text'), findsWidgets);
          expect(find.textContaining('Atlas'), findsNothing);
          await tester.tap(find.widgetWithText(AppButton, 'Source text').first);
          await tester.pumpAndSettle();
          expect(find.text(sourceContextText), findsOneWidget);
          expect(opened, isNull);
          expect(tester.takeException(), isNull);
        },
      );
    }
  }

  testWidgets('ordinary short title remains readable', (tester) async {
    await tester.pumpWidget(
      _app(const ReaderSummarySourceText('Atlas release')),
    );
    expect(find.text('Atlas release'), findsOneWidget);
    expect(find.text('Source text'), findsNothing);
    expect(find.byTooltip('Atlas release'), findsOneWidget);
  });
}

Widget _app(Widget child, {double scale = 1}) {
  final theme = AppTheme.light();
  return AppHeadlessScope(
    theme: theme,
    appBuilder: (overlayBuilder) => MaterialApp(
      theme: theme,
      builder: overlayBuilder,
      home: Scaffold(
        body: MediaQuery(
          data: MediaQueryData(textScaler: TextScaler.linear(scale)),
          child: SingleChildScrollView(
            child: SizedBox(width: 358, child: child),
          ),
        ),
      ),
    ),
  );
}
