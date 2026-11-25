part of 'reader_summary_top_posts_sliver_test.dart';

class _TestApp extends StatelessWidget {
  const _TestApp({required this.summary});

  final ReaderSummary summary;

  @override
  Widget build(BuildContext context) {
    final theme = AppTheme.light();
    final projection = readerSummaryTopPostsProjection(summary);
    return AppHeadlessScope(
      theme: theme,
      appBuilder: (overlayBuilder) => MaterialApp(
        theme: theme,
        builder: overlayBuilder,
        home: Scaffold(
          body: CustomScrollView(
            slivers: [
              SliverPadding(
                padding: const EdgeInsets.all(AppSpacing.md),
                sliver: ReaderSummaryTopPostsSliver(
                  projection: projection,
                  selectedPostCount:
                      summary.coverage?.selectedFeedItemCount ??
                      (summary.content.selectedPosts.isNotEmpty
                          ? summary.content.selectedPosts.length
                          : summary.content.topReads.length),
                  period: summary.period,
                  citationsById: {
                    for (final citation in summary.citations)
                      citation.id: citation,
                  },
                  ratingFor: (_) => null,
                  onRated: (_, _, _) async => true,
                  onOpenUrl: (_) {},
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
