import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/domain/entities/reader_summary_topic_recommendation.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/reader_action_target.dart';
import 'package:social_monitor_summaries/src/infrastructure/api/summary_api_dto.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/summary_mapper.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_view.dart';

import '../../support/summaries_test_fixtures.dart';

void main() {
  testWidgets('hides raw coverage diagnostics by default', (tester) async {
    final summary = const SummaryMapper().readerSummaryToDomain(
      readerSummaryApiDto(
        coverage: const ReaderSummaryCoverageApiDto(
          collectedFeedItemCount: 128,
          selectedFeedItemCount: 42,
          topReadCount: 10,
          citationCount: 40,
          lowRelevanceFeedItemCount: 7,
          mutedFeedItemCount: 3,
          userRatedFeedItemCount: 2,
          topicBreakdown: [
            ReaderSummaryTopicCoverageApiDto(
              topicKey: 'interest-ai',
              topicLabel: 'AI agents',
              collectedFeedItemCount: 64,
              lowRelevanceFeedItemCount: 4,
              mutedFeedItemCount: 1,
            ),
          ],
          queryBreakdown: [
            ReaderSummaryQueryCoverageApiDto(
              query: 'claude code OR codex',
              collectedFeedItemCount: 37,
              lowRelevanceFeedItemCount: 2,
              mutedFeedItemCount: 1,
            ),
          ],
        ),
      ),
    );

    await tester.pumpWidget(_TestApp(summary: summary));
    await tester.pumpAndSettle();

    expect(find.text('Coverage by source'), findsOneWidget);
    expect(find.text('Coverage signals'), findsNothing);
    expect(find.text('7 low rel.'), findsNothing);
    expect(find.text('3 muted'), findsNothing);
    expect(find.text('2 rated'), findsNothing);
    expect(find.text('AI agents'), findsNothing);
    expect(find.text('claude code OR codex'), findsNothing);
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
          body: SingleChildScrollView(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: ReaderSummaryView(
                summary: summary,
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
                onTopPostRating: (_, _, _) async => true,
                onTopicRecommendationDecision: (_, _) async {},
                onOpenUrl: (_) {},
                includeTopPosts: false,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
