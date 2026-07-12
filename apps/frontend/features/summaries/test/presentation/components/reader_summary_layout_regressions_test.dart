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
import 'package:social_monitor_summaries/src/presentation/components/workspace_summary_period_shell.dart';

import '../../support/mixed_source_summaries_test_fixtures.dart';
import '../../support/summaries_test_fixtures.dart';

void main() {
  testWidgets('wraps top post preview media at the start of the summary text', (
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
              title: 'X post with launch screenshot',
              providerKey: 'x-twitter',
              reason: 'The original source includes a real post image.',
              matchedInterestIds: ['ai-developer-tools'],
              signalScore: 3.2,
              confidence: TopReadConfidenceApiDto(
                level: 'high',
                score: 0.81,
                rationale: 'Source item has direct media evidence.',
              ),
              providerMetrics: [
                ProviderMetricApiDto(label: 'Likes', value: '2,351'),
              ],
              canonicalUrl: 'https://x.com/example/status/123',
              previewMedia: PreviewMediaApiDto(
                kind: 'image',
                url: 'https://cdn.example.test/post-image.jpg',
                sourceUrl: 'https://x.com/example/status/123',
                altText: 'Launch screenshot',
              ),
              citationIds: ['media-citation'],
            ),
          ],
        ),
        citations: [
          summaryCitationApiDto(id: 'media-citation', providerKey: 'x-twitter'),
        ],
      ),
    );

    await tester.pumpWidget(_TestApp(summary: summary));
    await tester.pumpAndSettle();

    final rowFinder = find.byKey(const ValueKey('reader-summary-top-post-0'));
    expect(rowFinder, findsOneWidget);
    expect(
      find.descendant(of: rowFinder, matching: find.byType(Image)),
      findsOneWidget,
    );

    final wrapFinder = find.byKey(
      const ValueKey('reader-summary-top-post-preview-wrap'),
    );
    expect(wrapFinder, findsOneWidget);

    final imageTopLeft = tester.getTopLeft(
      find.descendant(of: wrapFinder, matching: find.byType(Image)),
    );
    final reasonTopLeft = tester.getTopLeft(
      find.descendant(
        of: wrapFinder,
        matching: find.text('The original source includes a real post image'),
      ),
    );
    expect(imageTopLeft.dx, lessThan(reasonTopLeft.dx));
    expect((imageTopLeft.dy - reasonTopLeft.dy).abs(), lessThan(8));
  });

  testWidgets('uses selected evidence when collected coverage is stale zero', (
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
        coverage: const ReaderSummaryCoverageApiDto(
          collectedFeedItemCount: 0,
          selectedFeedItemCount: 120,
          topReadCount: 10,
          citationCount: 120,
          providerBreakdown: [
            ReaderSummaryProviderCoverageApiDto(
              providerKey: 'reddit',
              collectedFeedItemCount: 0,
              selectedFeedItemCount: 120,
              topReadCount: 10,
              citationCount: 120,
            ),
          ],
        ),
      ),
    );

    await tester.pumpWidget(_TestApp(summary: summary));
    await tester.pumpAndSettle();

    final postsStat = find.byKey(const ValueKey('reader-summary-stat-Posts'));
    expect(postsStat, findsOneWidget);
    expect(
      find.descendant(of: postsStat, matching: find.text('120')),
      findsOneWidget,
    );
    expect(
      find.descendant(of: postsStat, matching: find.text('0')),
      findsNothing,
    );
  });

  testWidgets('shows up to six lines of a top post description', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1280, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    const description =
        'The release introduces a work agent that can continue multi-step projects across connected apps and files. It matters because the workflow moves beyond isolated coding tasks into longer operational work. Teams may be able to delegate research, document updates and follow-up actions without rebuilding context for every step. Access scope and real-world reliability still need careful evaluation.';
    final summary = const SummaryMapper().readerSummaryToDomain(
      readerSummaryApiDto(
        content: readerSummaryContentApiDto(
          topReads: const [
            TopReadApiDto(
              title: 'A work agent for longer operational projects',
              providerKey: 'x-twitter',
              reason: description,
              matchedInterestIds: ['ai-developer-tools'],
              signalScore: 3.2,
              citationIds: ['long-description-citation'],
            ),
          ],
        ),
        citations: [
          summaryCitationApiDto(
            id: 'long-description-citation',
            providerKey: 'x-twitter',
          ),
        ],
      ),
    );

    await tester.pumpWidget(_TestApp(summary: summary));
    await tester.pumpAndSettle();

    final descriptionText = tester.widget<Text>(
      find.byWidgetPredicate(
        (widget) =>
            widget is Text &&
            (widget.data?.startsWith(
                  'The release introduces a work agent that can continue',
                ) ??
                false),
      ),
    );
    expect(
      descriptionText.data,
      description.substring(0, description.length - 1),
    );
    expect(descriptionText.maxLines, 6);
  });

  testWidgets('lays provider coverage out across the expanded summary width', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1280, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    final summary = const SummaryMapper().readerSummaryToDomain(
      mixedSourceReaderSummaryApiDto(),
    );

    await tester.pumpWidget(_TestApp(summary: summary));
    await tester.pumpAndSettle();

    final section = find.byKey(
      const ValueKey('reader-summary-coverage-by-source'),
    );
    final hackerNews = find.byKey(
      const ValueKey('reader-summary-provider-coverage-hacker-news'),
    );
    final rss = find.byKey(
      const ValueKey('reader-summary-provider-coverage-rss'),
    );
    final reddit = find.byKey(
      const ValueKey('reader-summary-provider-coverage-reddit'),
    );
    final github = find.byKey(
      const ValueKey('reader-summary-provider-coverage-github-trending-page'),
    );

    expect(section, findsOneWidget);
    expect(tester.getSize(section).width, greaterThan(900));
    expect(hackerNews, findsOneWidget);
    expect(rss, findsOneWidget);
    expect(reddit, findsOneWidget);
    expect(github, findsNothing);

    final firstTop = tester.getTopLeft(hackerNews).dy;
    expect((tester.getTopLeft(rss).dy - firstTop).abs(), lessThan(1));
    expect((tester.getTopLeft(reddit).dy - firstTop).abs(), lessThan(1));
    expect(
      tester.getTopLeft(rss).dx,
      greaterThan(tester.getTopLeft(hackerNews).dx),
    );
    expect(
      tester.getTopLeft(reddit).dx,
      greaterThan(tester.getTopLeft(rss).dx),
    );
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
              child: WorkspaceSummaryPeriodShell(
                selectedPeriod: summary.period,
                selectedPreset: SummaryPeriodPreset.daily,
                availableSummaryPeriods: [summary.period],
                canNavigateToPreviousPeriod: false,
                canNavigateToNextPeriod: false,
                onPeriodChanged: (_) {},
                onPreviousPeriod: () {},
                onNextPeriod: () {},
                onCalendarDateSelected: (_) {},
                onGenerate: () {},
                isGenerating: false,
                exportSummary: summary,
                child: ReaderSummaryView(
                  summary: readerSummaryWithoutTopicMap(summary),
                  isRefreshing: false,
                  readerActionState:
                      const InitialViewState<ReaderActionResult>(),
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
      ),
    );
  }
}
