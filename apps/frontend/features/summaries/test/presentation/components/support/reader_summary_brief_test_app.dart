import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/domain/entities/summary_citation.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_brief_surface.dart';

Future<void> pumpReaderSummaryBrief(
  WidgetTester tester,
  ReaderSummary summary, {
  Map<String, SummaryCitation>? citationsById,
  ValueChanged<String>? onOpenUrl,
}) async {
  final theme = AppTheme.dark();
  await tester.pumpWidget(
    AppHeadlessScope(
      theme: theme,
      appBuilder: (overlayBuilder) => MaterialApp(
        theme: theme,
        builder: overlayBuilder,
        home: Scaffold(
          body: SingleChildScrollView(
            child: ReaderSummaryBriefSurface(
              summary: summary,
              citationsById: citationsById ??
                  {
                    for (final citation in summary.citations)
                      citation.id: citation,
                  },
              isRefreshing: false,
              onOpenUrl: onOpenUrl ?? (_) {},
            ),
          ),
        ),
      ),
    ),
  );
}
