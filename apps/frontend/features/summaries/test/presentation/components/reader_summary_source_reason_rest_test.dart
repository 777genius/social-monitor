import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_brief_surface.dart';
import 'package:social_monitor_summaries/src/presentation/view_models/reader_summary_top_posts_projection.dart';

import '../../support/source_reason_rest_fixture.dart';

void main() {
  for (final source in [
    'Atlas bypasses human approval.\nOnly in simulations; production writes require explicit operator approval.',
    'Atlas bypasses human approval. ${'Synthetic evaluation context. ' * 36}'
        'Only in simulations; production writes require explicit operator approval.',
  ]) {
    for (final editorial in [
      null,
      'The evaluation informs deployment planning',
    ]) {
      testWidgets('REST source ${source.length} with editorial=$editorial', (
        tester,
      ) async {
        final summary = sourceReasonRestSummary(source, editorial: editorial);
        final item = summary.content.selectedPosts.single;
        expect(item.title, source);
        expect(item.reason, isEmpty);
        expect(item.whyImportant, editorial == null ? isEmpty : [editorial]);
        final theme = AppTheme.light();
        await tester.pumpWidget(
          AppHeadlessScope(
            theme: theme,
            appBuilder: (overlayBuilder) => MaterialApp(
              theme: theme,
              builder: overlayBuilder,
              home: Scaffold(
                body: SingleChildScrollView(
                  child: ReaderSummaryTopPosts(
                    projection: readerSummaryTopPostsProjection(summary),
                    selectedPostCount: 1,
                    period: summary.period,
                    citationsById: const {},
                    ratingFor: null,
                    onRated: null,
                    onOpenUrl: (_) {},
                  ),
                ),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.textContaining('Atlas'), findsNothing);
        if (editorial != null) expect(find.text(editorial), findsWidgets);
        await tester.tap(find.widgetWithText(AppButton, 'Source text').first);
        await tester.pumpAndSettle();
        expect(find.text(source), findsOneWidget);
        expect(
          tester.widget<SelectableText>(find.byType(SelectableText)).data,
          endsWith('production writes require explicit operator approval.'),
        );
        expect(tester.takeException(), isNull);
      });
    }
  }
}
