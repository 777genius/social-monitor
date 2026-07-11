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
  testWidgets('compact view collapses top posts into single-line rows', (
    tester,
  ) async {
    final summary = const SummaryMapper().readerSummaryToDomain(
      readerSummaryApiDto(
        content: readerSummaryContentApiDto(
          topReads: const [
            TopReadApiDto(
              title: 'Compact mode single row post',
              providerKey: 'reddit',
              reason:
                  'A detailed explanation that only the roomy list view shows.',
              matchedInterestIds: ['ai-developer-tools'],
              signalScore: 2.4,
              confidence: TopReadConfidenceApiDto(
                level: 'medium',
                score: 0.55,
                rationale: 'Same-source support.',
              ),
              confirmedProviderKeys: ['reddit'],
              providerMetrics: [
                ProviderMetricApiDto(label: 'Likes', value: '959'),
              ],
              citationIds: ['compact-citation'],
            ),
          ],
        ),
        citations: [
          summaryCitationApiDto(id: 'compact-citation', providerKey: 'reddit'),
        ],
      ),
    );

    await tester.pumpWidget(_CompactTopPostsApp(summary: summary));
    await tester.pumpAndSettle();

    expect(find.text('Compact mode single row post'), findsOneWidget);
    expect(find.textContaining('Signal '), findsWidgets);
    expect(find.textContaining('Matching '), findsWidgets);

    await tester.tap(
      find.byKey(const ValueKey('reader-summary-top-posts-view-compact')),
    );
    await tester.pumpAndSettle();

    expect(find.text('Compact mode single row post'), findsOneWidget);
    expect(find.text('Same-source support'), findsOneWidget);
    expect(find.textContaining('Signal '), findsNothing);
    expect(find.textContaining('Matching '), findsNothing);
  });
}

class _CompactTopPostsApp extends StatelessWidget {
  const _CompactTopPostsApp({required this.summary});

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
                summary: readerSummaryWithoutTopicMap(summary),
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
              ),
            ),
          ),
        ),
      ),
    );
  }
}
