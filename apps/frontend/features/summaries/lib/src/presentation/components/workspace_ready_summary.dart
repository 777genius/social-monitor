part of 'workspace_summary_panel.dart';

class _ReadySummary extends StatelessWidget {
  const _ReadySummary({
    required this.summary,
    required this.readerActionState,
    required this.topicRecommendationState,
    required this.activeReaderActionIdempotencyKey,
    required this.lastReaderActionIdempotencyKey,
    required this.onGenerate,
    required this.intentForAction,
    required this.onAction,
    required this.topPostRatingFor,
    required this.onTopPostRating,
    required this.onTopicRecommendationDecision,
    required this.onOpenUrl,
    required this.includeTopPosts,
    this.isRefreshing = false,
  });

  final ReaderSummary summary;
  final AsyncViewState<ReaderActionResult> readerActionState;
  final AsyncViewState<ReaderSummaryTopicRecommendationQueue>
  topicRecommendationState;
  final String? activeReaderActionIdempotencyKey;
  final String? lastReaderActionIdempotencyKey;
  final VoidCallback onGenerate;
  final UserActionIntent Function(ReaderSummary summary, ReaderAction action)
  intentForAction;
  final void Function(
    ReaderSummary summary,
    ReaderAction action, [
    ReaderFeedbackReason? feedbackReason,
  ])
  onAction;
  final int? Function(ReaderSummary summary, TopRead item) topPostRatingFor;
  final Future<bool> Function(
    ReaderSummary summary,
    TopRead item,
    int rating,
    PostRatingReason? reason,
  )
  onTopPostRating;
  final Future<void> Function(
    ReaderSummaryTopicRecommendation recommendation,
    ReaderSummaryTopicRecommendationDecisionStatus status,
  )
  onTopicRecommendationDecision;
  final void Function(ReaderSummary summary, String url) onOpenUrl;
  final bool includeTopPosts;
  final bool isRefreshing;

  @override
  Widget build(BuildContext context) {
    return ReaderSummaryView(
      summary: summary,
      isRefreshing: isRefreshing,
      readerActionState: readerActionState,
      topicRecommendationState: topicRecommendationState,
      activeReaderActionIdempotencyKey: activeReaderActionIdempotencyKey,
      lastReaderActionIdempotencyKey: lastReaderActionIdempotencyKey,
      onGenerate: onGenerate,
      intentForAction: (action) => intentForAction(summary, action),
      onAction: (action, [feedbackReason]) =>
          onAction(summary, action, feedbackReason),
      topPostRatingFor: (item) => topPostRatingFor(summary, item),
      onTopPostRating: (item, rating, reason) =>
          onTopPostRating(summary, item, rating, reason),
      onTopicRecommendationDecision: onTopicRecommendationDecision,
      onOpenUrl: (url) => onOpenUrl(summary, url),
      includeTopPosts: includeTopPosts,
    );
  }
}
