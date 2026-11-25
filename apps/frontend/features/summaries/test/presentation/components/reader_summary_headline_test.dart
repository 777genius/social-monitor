import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/summary_mapper.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_view.dart';

import '../../support/summaries_test_fixtures.dart';

void main() {
  testWidgets('renders summary headline without a terminal full stop', (
    tester,
  ) async {
    const headline =
        'Developers are routing GPT-5.6 Sol through Claude Code as cost, limits and agent workflows dominate.';
    const expectedHeadline =
        'Developers are routing GPT-5.6 Sol through Claude Code as cost, limits and agent workflows dominate';
    const mapper = SummaryMapper();
    final summary = mapper.readerSummaryToDomain(
      readerSummaryApiDto(
        content: readerSummaryContentApiDto(headline: headline),
      ),
    );

    final theme = AppTheme.dark();
    await tester.pumpWidget(
      AppHeadlessScope(
        theme: theme,
        appBuilder: (overlayBuilder) => MaterialApp(
          theme: theme,
          builder: overlayBuilder,
          home: Scaffold(
            body: SingleChildScrollView(
              child: ReaderSummaryView.readOnly(
                summary: summary,
                isRefreshing: false,
                onOpenUrl: (_) {},
                includeTopPosts: false,
              ),
            ),
          ),
        ),
      ),
    );

    expect(find.text(expectedHeadline), findsOneWidget);
    expect(find.text(headline), findsNothing);
  });
}
