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
      expect(find.text('X post about agent workflow loops'), findsNothing);
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

  testWidgets('keeps confirmed cross-source support with one resolved citation', (
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
              title: 'Claude Code tracker raises telemetry questions',
              providerKey: 'rss',
              reason:
                  'The post explains why Claude Code tracking concerns matter for developer teams.',
              matchedInterestIds: ['ai-developer-tools'],
              signalScore: 2.69,
              confidence: TopReadConfidenceApiDto(
                level: 'high',
                score: 0.74,
                rationale: 'Two providers support this story signal.',
              ),
              confirmedProviderKeys: ['hacker-news', 'rss'],
              citationIds: ['missing-cross-source-citation'],
            ),
            TopReadApiDto(
              title: 'Token pricing and agent cost measurement get scrutiny',
              providerKey: 'hacker-news',
              reason:
                  'HN and RSS surfaced a concrete cost-analysis angle for AI product teams.',
              matchedInterestIds: ['ai-developer-tools'],
              signalScore: 2.18,
              confidence: TopReadConfidenceApiDto(
                level: 'high',
                score: 0.72,
                rationale: 'Two providers support this story signal.',
              ),
              confirmedProviderKeys: ['hacker-news', 'rss'],
              citationIds: ['pricing-hn', 'pricing-rss'],
            ),
          ],
        ),
        citations: [
          summaryCitationApiDto(
            id: 'missing-cross-source-citation',
            sourceLabel: 'RSS telemetry report',
            providerKey: 'rss',
            canonicalUrl: 'https://rss.example/telemetry-report',
          ),
          summaryCitationApiDto(
            id: 'pricing-hn',
            sourceLabel: 'Hacker News pricing discussion',
            providerKey: 'hacker-news',
            canonicalUrl: 'https://news.ycombinator.com/item?id=42',
          ),
          summaryCitationApiDto(
            id: 'pricing-rss',
            sourceLabel: 'RSS post about token pricing',
            providerKey: 'rss',
            canonicalUrl: 'https://rss.example/token-pricing',
          ),
        ],
      ),
    );

    await tester.pumpWidget(_TestApp(summary: summary));
    await tester.pumpAndSettle();

    final firstRow = find.byKey(const ValueKey('reader-summary-top-post-0'));
    expect(
      find.descendant(
        of: firstRow,
        matching: find.text('Claude Code tracker raises telemetry questions'),
      ),
      findsOneWidget,
    );
    expect(
      find.descendant(
        of: firstRow,
        matching: find.text('Cross-source · 2 sources'),
      ),
      findsOneWidget,
    );
    expect(
      find.descendant(of: firstRow, matching: find.text('High confidence')),
      findsNothing,
    );
    expect(
      find.descendant(
        of: firstRow,
        matching: find.textContaining('Show evidence'),
      ),
      findsNothing,
    );

    final secondRow = find.byKey(const ValueKey('reader-summary-top-post-1'));
    expect(
      find.descendant(
        of: secondRow,
        matching: find.text(
          'Token pricing and agent cost measurement get scrutiny',
        ),
      ),
      findsOneWidget,
    );
    expect(
      find.descendant(
        of: secondRow,
        matching: find.text('Cross-source · 2 sources · Show evidence'),
      ),
      findsOneWidget,
    );
  });

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

    expect(find.text('Reddit thread about agent workflows'), findsNothing);
    expect(find.text('Reddit follow-up on workflow costs'), findsOneWidget);
  });

  testWidgets(
    'keeps one citation single-source without duplicating global confidence',
    (tester) async {
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
                title: 'One medium-confidence source',
                providerKey: 'hacker-news',
                reason: 'One source can be plausible without corroboration.',
                matchedInterestIds: ['ai-developer-tools'],
                signalScore: 2.1,
                confidence: TopReadConfidenceApiDto(
                  level: 'medium',
                  score: 0.64,
                  rationale: 'The source is credible but not corroborated.',
                ),
                confirmedProviderKeys: ['hacker-news'],
                citationIds: ['only-citation'],
              ),
            ],
          ),
          citations: [
            summaryCitationApiDto(
              id: 'only-citation',
              sourceLabel: 'Hacker News discussion',
              providerKey: 'hacker-news',
              canonicalUrl: 'https://news.ycombinator.com/item?id=7',
            ),
          ],
        ),
      );

      await tester.pumpWidget(_TestApp(summary: summary));
      await tester.pumpAndSettle();

      final rowFinder = find.byKey(const ValueKey('reader-summary-top-post-0'));
      expect(
        find.descendant(of: rowFinder, matching: find.text('Single source')),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: rowFinder,
          matching: find.text('Medium confidence'),
        ),
        findsNothing,
      );
      expect(
        find.descendant(
          of: rowFinder,
          matching: find.text('Same-source support'),
        ),
        findsNothing,
      );

    },
  );
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
