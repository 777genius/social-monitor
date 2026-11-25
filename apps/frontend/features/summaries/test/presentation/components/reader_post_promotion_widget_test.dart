import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_brief_surface.dart';
import 'package:social_monitor_summaries/src/presentation/view_models/reader_summary_top_posts_projection.dart';

import '../../support/top_posts_test_fixtures.dart';

void main() {
  testWidgets('one bad card hides the whole promotion board and targets', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1000, 700);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    final semantics = tester.ensureSemantics();
    final visible = topPostFixture(
      title: 'Attested promotion is visible',
      storyClusterId: 'cluster:visible',
      cardKind: ReaderSummaryCardKind.curatedTopRead,
      canonicalUrl: 'https://example.test/visible',
    );
    final hidden = topPostFixture(
      title: 'Markerless promotion is hidden',
      storyClusterId: 'cluster:hidden',
      cardKind: ReaderSummaryCardKind.curatedTopRead,
      canonicalUrl: 'https://example.test/hidden',
      attested: false,
    );
    final summary = topPostsSummaryFixture(topReads: [visible, hidden]);
    final opened = <String>[];

    await tester.pumpWidget(
      _PromotionTestApp(summary: summary, opened: opened),
    );
    await tester.pumpAndSettle();

    expect(find.bySemanticsLabel('Top posts, 1 items'), findsNothing);
    expect(find.text(visible.title), findsNothing);
    expect(find.text(hidden.title), findsNothing);
    expect(find.bySemanticsLabel(hidden.title), findsNothing);
    expect(opened, isEmpty);
    semantics.dispose();
  });
}

final class _PromotionTestApp extends StatelessWidget {
  const _PromotionTestApp({required this.summary, required this.opened});

  final ReaderSummary summary;
  final List<String> opened;

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
              ReaderSummaryTopPostsSliver(
                projection: readerSummaryTopPostsProjection(summary),
                selectedPostCount: summary.content.selectedPosts.length,
                period: summary.period,
                citationsById: const {},
                ratingFor: null,
                onRated: null,
                onOpenUrl: opened.add,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
