import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_brief_surface.dart';
import 'package:social_monitor_summaries/src/presentation/view_models/reader_summary_top_posts_projection.dart';

final class ReaderSummaryAdditionalStoriesApp extends StatelessWidget {
  const ReaderSummaryAdditionalStoriesApp({
    super.key,
    required this.summary,
    required this.onOpenUrl,
  });

  final ReaderSummary summary;
  final ValueChanged<String> onOpenUrl;

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
                citationsById: {
                  for (final citation in summary.citations)
                    citation.id: citation,
                },
                ratingFor: null,
                onRated: null,
                onOpenUrl: onOpenUrl,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
