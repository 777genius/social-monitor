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
  testWidgets('renders X aliases as same-source support', (tester) async {
    tester.view.physicalSize = const Size(1280, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    final summary = const SummaryMapper().readerSummaryToDomain(
      readerSummaryApiDto(
        bindPromotionAttestations: false,
        content: readerSummaryContentApiDto(
          topReads: [
            TopReadApiDto(
              storyClusterId: 'story:x-alias-family',
              cardKind: 'curated_top_read',
              promotionAttestation: ReaderPostPromotionAttestationApiDto(
                candidateId: 'fixture:story:x-alias-family',
                canonicalIdentity: 'story:x-alias-family',
                placement: 'top',
                slot: 0,
                decision: 'promote_top',
                citationIds: ['x-twitter-citation', 'twitter-citation'],
              ),
              title: 'Two X aliases cover one story',
              providerKey: 'x-twitter',
              reason: 'Two posts from X cover the same story.',
              matchedInterestIds: ['ai-developer-tools'],
              signalScore: 2.4,
              confidence: TopReadConfidenceApiDto(
                level: 'medium',
                score: 0.58,
                rationale: 'Multiple same-family posts support the story.',
              ),
              confirmedProviderKeys: ['x'],
              citationIds: ['x-twitter-citation', 'twitter-citation'],
            ),
          ],
        ),
        citations: [
          summaryCitationApiDto(
            id: 'x-twitter-citation',
            providerKey: 'x-twitter',
            sourceLabel: 'First X post',
            canonicalUrl: 'https://x.example/status/1',
          ),
          summaryCitationApiDto(
            id: 'twitter-citation',
            providerKey: 'twitter',
            sourceLabel: 'Second X post',
            canonicalUrl: 'https://x.example/status/2',
          ),
        ],
      ),
    );

    await tester.pumpWidget(_AliasTestApp(summary: summary));
    await tester.pumpAndSettle();

    final row = find.byKey(
      const ValueKey(
        'reader-summary-top-post-cluster:story:x-alias-family',
      ),
    );
    expect(
      find.descendant(
        of: row,
        matching: find.text('Same-source support · 2 posts · Show evidence'),
      ),
      findsOneWidget,
    );
    expect(
      find.descendant(of: row, matching: find.textContaining('Cross-source')),
      findsNothing,
    );
  });
}

class _AliasTestApp extends StatelessWidget {
  const _AliasTestApp({required this.summary});

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
    );
  }
}
