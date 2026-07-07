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
  testWidgets(
    'expands citation-backed cross-source evidence under a top post',
    (tester) async {
      tester.view.physicalSize = const Size(1280, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      String? openedUrl;
      final summary = const SummaryMapper().readerSummaryToDomain(
        readerSummaryApiDto(
          content: readerSummaryContentApiDto(
            topReads: const [
              TopReadApiDto(
                title: 'Cross-source agent workflow story',
                providerKey: 'x-twitter',
                reason: 'X and Reddit point at the same agent workflow story.',
                matchedInterestIds: ['ai-developer-tools'],
                signalScore: 2.8,
                confidence: TopReadConfidenceApiDto(
                  level: 'high',
                  score: 0.74,
                  rationale: 'Different providers support the same story.',
                ),
                confirmedProviderKeys: ['x-twitter', 'reddit'],
                citationIds: ['evidence-x', 'evidence-reddit'],
              ),
            ],
          ),
          citations: [
            summaryCitationApiDto(
              id: 'evidence-x',
              sourceLabel: 'X post about agent workflow loops',
              providerKey: 'x-twitter',
              canonicalUrl: 'https://x.example/status/1',
            ),
            summaryCitationApiDto(
              id: 'evidence-reddit',
              sourceLabel: 'Reddit thread confirming workflow pain',
              providerKey: 'reddit',
              canonicalUrl: 'https://reddit.example/r/ai/comments/1',
            ),
          ],
        ),
      );

      await tester.pumpWidget(
        _TestApp(summary: summary, onOpenUrl: (url) => openedUrl = url),
      );
      await tester.pumpAndSettle();

      final rowFinder = find.byKey(const ValueKey('reader-summary-top-post-0'));
      expect(
        find.descendant(
          of: rowFinder,
          matching: find.text('Cross-source · 2 sources · Show evidence'),
        ),
        findsOneWidget,
      );
      expect(find.text('X post about agent workflow loops'), findsNothing);
      expect(find.text('Reddit thread confirming workflow pain'), findsNothing);

      final toggleFinder = find.descendant(
        of: rowFinder,
        matching: find.byKey(
          const ValueKey('reader-summary-top-post-evidence-toggle'),
        ),
      );
      await tester.scrollUntilVisible(
        toggleFinder,
        120,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(toggleFinder);
      await tester.pumpAndSettle();

      expect(
        find.descendant(
          of: rowFinder,
          matching: find.text('Cross-source · 2 sources · Hide evidence'),
        ),
        findsOneWidget,
      );
      expect(find.text('X post about agent workflow loops'), findsOneWidget);
      expect(
        find.text('Reddit thread confirming workflow pain'),
        findsOneWidget,
      );

      await tester.tap(
        find.byKey(
          const ValueKey(
            'reader-summary-top-post-evidence-source-evidence-reddit',
          ),
        ),
      );
      await tester.pump();

      expect(openedUrl, 'https://reddit.example/r/ai/comments/1');
    },
  );

  testWidgets('keeps same-source evidence labeled as same-source support', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1280, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    final summary = const SummaryMapper().readerSummaryToDomain(
      readerSummaryApiDto(
        content: readerSummaryContentApiDto(
          topReads: const [
            TopReadApiDto(
              title: 'Reddit agent workflow trend',
              providerKey: 'reddit',
              reason: 'Two Reddit threads discuss the same workflow trend.',
              matchedInterestIds: ['ai-developer-tools'],
              signalScore: 2.4,
              confidence: TopReadConfidenceApiDto(
                level: 'medium',
                score: 0.58,
                rationale: 'Multiple Reddit citations support the story.',
              ),
              confirmedProviderKeys: ['reddit'],
              citationIds: ['reddit-a', 'reddit-b'],
            ),
          ],
        ),
        citations: [
          summaryCitationApiDto(
            id: 'reddit-a',
            sourceLabel: 'Reddit thread about agent workflows',
            providerKey: 'reddit',
            canonicalUrl: 'https://reddit.example/r/ai/comments/a',
          ),
          summaryCitationApiDto(
            id: 'reddit-b',
            sourceLabel: 'Reddit follow-up on workflow costs',
            providerKey: 'reddit',
            canonicalUrl: 'https://reddit.example/r/ai/comments/b',
          ),
        ],
      ),
    );

    await tester.pumpWidget(_TestApp(summary: summary));
    await tester.pumpAndSettle();

    final rowFinder = find.byKey(const ValueKey('reader-summary-top-post-0'));
    expect(
      find.descendant(
        of: rowFinder,
        matching: find.text('Same-source support · 2 posts · Show evidence'),
      ),
      findsOneWidget,
    );
    expect(
      find.descendant(of: rowFinder, matching: find.text('Cross-source')),
      findsNothing,
    );

    final toggleFinder = find.descendant(
      of: rowFinder,
      matching: find.byKey(
        const ValueKey('reader-summary-top-post-evidence-toggle'),
      ),
    );
    await tester.scrollUntilVisible(
      toggleFinder,
      120,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(toggleFinder);
    await tester.pumpAndSettle();

    expect(find.text('Reddit thread about agent workflows'), findsOneWidget);
    expect(find.text('Reddit follow-up on workflow costs'), findsOneWidget);
  });
}

class _TestApp extends StatelessWidget {
  const _TestApp({required this.summary, this.onOpenUrl});

  final ReaderSummary summary;
  final ValueChanged<String>? onOpenUrl;

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
                onOpenUrl: onOpenUrl ?? (_) {},
              ),
            ),
          ),
        ),
      ),
    );
  }
}
