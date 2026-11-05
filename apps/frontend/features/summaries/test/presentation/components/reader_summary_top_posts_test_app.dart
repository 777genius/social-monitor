part of 'reader_summary_top_posts_test.dart';

class _TestApp extends StatelessWidget {
  const _TestApp({
    required this.summary,
    this.onTopPostRating,
    this.onOpenUrl,
    this.showTopicMap = false,
  });

  final ReaderSummary summary;
  final ValueChanged<String>? onOpenUrl;
  final bool showTopicMap;
  final Future<bool> Function(
    TopRead item,
    int rating,
    PostRatingReason? reason,
  )?
  onTopPostRating;

  @override
  Widget build(BuildContext context) {
    final theme = AppTheme.light();
    final viewSummary = showTopicMap
        ? summary
        : readerSummaryWithoutTopicMap(summary);
    return AppHeadlessScope(
      theme: theme,
      appBuilder: (overlayBuilder) => MaterialApp(
        theme: theme,
        builder: overlayBuilder,
        home: Scaffold(
          body: SingleChildScrollView(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: ReaderSummaryView(
                summary: viewSummary,
                isRefreshing: false,
                readerActionState: const InitialViewState<ReaderActionResult>(),
                topicRecommendationState:
                    const InitialViewState<
                      ReaderSummaryTopicRecommendationQueue
                    >(),
                activeReaderActionIdempotencyKey: null,
                lastReaderActionIdempotencyKey: null,
                onGenerate: () {},
                intentForAction: (_) =>
                    const UserActionIntent(id: 'test-action'),
                onAction: (action, [reason]) {},
                topPostRatingFor: (_) => null,
                onTopPostRating: onTopPostRating ?? (_, _, _) async => true,
                onTopicRecommendationDecision: (_, _) async {},
                onOpenUrl: onOpenUrl ?? (_) {},
              ),
            ),
          ),
        ),
      ),
    );
  }
}
