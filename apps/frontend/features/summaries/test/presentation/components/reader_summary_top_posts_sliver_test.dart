import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/infrastructure/api/summary_api_dto.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/summary_mapper.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_brief_surface.dart';
import 'package:social_monitor_summaries/src/presentation/view_models/reader_summary_top_posts_projection.dart';

import '../../support/summaries_test_fixtures.dart';

void main() {
  testWidgets('shows both tabs and keeps top posts selected by default', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 700);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    final summary = const SummaryMapper().readerSummaryToDomain(
      readerSummaryApiDto(
        content: readerSummaryContentApiDto(topReads: _topReads(1)),
        citations: _citations(1),
      ),
    );

    await tester.pumpWidget(_TestApp(summary: summary));
    await tester.pumpAndSettle();

    expect(
      find.byKey(const ValueKey('reader-summary-top-posts-board-posts')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('reader-summary-top-posts-board-github')),
      findsOneWidget,
    );
    expect(find.text('Lazy top post 0'), findsOneWidget);
    expect(tester.takeException(), isNull);

    await tester.tap(
      find.byKey(const ValueKey('reader-summary-top-posts-board-github')),
    );
    await tester.pumpAndSettle();

    expect(find.text('Lazy top post 0'), findsNothing);
    expect(
      find.text('No GitHub Trending repositories in this summary window.'),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('reveals more top posts as the user scrolls', (tester) async {
    tester.view.physicalSize = const Size(1100, 700);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    final summary = const SummaryMapper().readerSummaryToDomain(
      readerSummaryApiDto(
        content: readerSummaryContentApiDto(topReads: _topReads(36)),
        citations: _citations(36),
      ),
    );

    await tester.pumpWidget(_TestApp(summary: summary));
    await tester.pumpAndSettle();

    expect(find.text('Lazy top post 30'), findsNothing);

    await tester.scrollUntilVisible(
      find.text('Lazy top post 30'),
      420,
      scrollable: find.byType(Scrollable).first,
      maxScrolls: 80,
    );
    await tester.pumpAndSettle();

    expect(find.text('Lazy top post 30'), findsOneWidget);
  });

  testWidgets(
    'keeps backend editorial order and sorts only on engagement request',
    (tester) async {
      tester.view.physicalSize = const Size(1100, 700);
      tester.view.devicePixelRatio = 1;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      final summary = const SummaryMapper().readerSummaryToDomain(
        readerSummaryApiDto(
          content: readerSummaryContentApiDto(
            topReads: _editorialOrderTopReads(),
          ),
          citations: _citations(2),
        ),
      );

      await tester.pumpWidget(_TestApp(summary: summary));
      await tester.pumpAndSettle();

      expect(find.text('Editorial'), findsOneWidget);
      final editorialWinner = find.text('Backend editorial winner');
      final engagementWinner = find.text('Higher engagement runner-up');
      expect(
        tester.getTopLeft(editorialWinner).dy,
        lessThan(tester.getTopLeft(engagementWinner).dy),
      );

      await tester.tap(
        find.byKey(const ValueKey('reader-summary-top-posts-sort')),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Engagement').last);
      await tester.pumpAndSettle();

      expect(
        tester.getTopLeft(engagementWinner).dy,
        lessThan(tester.getTopLeft(editorialWinner).dy),
      );
    },
  );

  testWidgets(
    'continues selected posts after editorial reads and keeps GitHub separate',
    (tester) async {
      tester.view.physicalSize = const Size(1100, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      final editorialReads = _editorialOrderTopReads();
      final selectedPosts = [
        ...editorialReads,
        _longTailSelectedPost(),
        ..._githubTopReads(),
      ];
      final content = readerSummaryContentApiDto(topReads: editorialReads);
      final summary = const SummaryMapper().readerSummaryToDomain(
        readerSummaryApiDto(
          content: _contentWithSelectedPosts(content, selectedPosts),
          citations: _citations(2),
          coverage: const ReaderSummaryCoverageApiDto(
            collectedFeedItemCount: 3,
            selectedFeedItemCount: 3,
            topReadCount: 2,
            citationCount: 2,
          ),
        ),
      );

      await tester.pumpWidget(_TestApp(summary: summary));
      await tester.pumpAndSettle();

      expect(find.bySemanticsLabel('Top posts, 3 items'), findsOneWidget);
      expect(find.text('2 editorial picks from 3 selected'), findsOneWidget);
      expect(find.text('Backend editorial winner'), findsOneWidget);
      expect(find.text('Higher engagement runner-up'), findsOneWidget);

      await tester.scrollUntilVisible(
        find.text('Long-tail selected evidence'),
        320,
        scrollable: find.byType(Scrollable).first,
        maxScrolls: 20,
      );
      await tester.pumpAndSettle();

      expect(find.text('Long-tail selected evidence'), findsOneWidget);

      await tester.ensureVisible(
        find.byKey(const ValueKey('reader-summary-top-posts-board-github')),
      );
      await tester.pumpAndSettle();
      await tester.tap(
        find.byKey(const ValueKey('reader-summary-top-posts-board-github')),
      );
      await tester.pumpAndSettle();

      expect(find.bySemanticsLabel('GitHub trends, 10 items'), findsOneWidget);
      expect(find.text('owner/repo-1'), findsOneWidget);
      expect(find.text('owner/repo-2'), findsOneWidget);
    },
  );

  test('keeps selected continuation but rejects a partial GitHub board', () {
    final selectedPosts = [_longTailSelectedPost(), _githubTopReads().first];
    final summary = const SummaryMapper().readerSummaryToDomain(
      readerSummaryApiDto(
        content: _contentWithSelectedPosts(
          readerSummaryContentApiDto(topReads: const []),
          selectedPosts,
        ),
      ),
    );

    final projection = readerSummaryTopPostsProjection(summary);

    expect(projection.curatedPosts, isEmpty);
    expect(projection.posts.single.title, 'Long-tail selected evidence');
    expect(projection.githubTrendingPosts, isEmpty);
  });

  testWidgets('falls back when a new day changes the available board', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1100, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    final postsOnly = const SummaryMapper().readerSummaryToDomain(
      readerSummaryApiDto(
        content: readerSummaryContentApiDto(topReads: _topReads(1)),
        citations: _citations(1),
      ),
    );
    final githubOnly = const SummaryMapper().readerSummaryToDomain(
      readerSummaryApiDto(
        content: _contentWithSelectedPosts(
          readerSummaryContentApiDto(topReads: const []),
          _githubTopReads(),
        ),
        citations: _githubCitations(),
      ),
    );

    await tester.pumpWidget(_TestApp(summary: postsOnly));
    await tester.pumpAndSettle();
    expect(find.text('Lazy top post 0'), findsOneWidget);

    await tester.pumpWidget(_TestApp(summary: githubOnly));
    await tester.pumpAndSettle();
    expect(find.text('owner/repo-1'), findsOneWidget);
    expect(find.text('Lazy top post 0'), findsNothing);

    await tester.pumpWidget(_TestApp(summary: postsOnly));
    await tester.pumpAndSettle();
    expect(find.text('Lazy top post 0'), findsOneWidget);
    expect(find.text('owner/repo-1'), findsNothing);
  });

  testWidgets('shows GitHub top ten in rank order and hides local sorting', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1100, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    final summary = const SummaryMapper().readerSummaryToDomain(
      readerSummaryApiDto(
        content: _contentWithSelectedPosts(
          readerSummaryContentApiDto(topReads: const []),
          _githubTopReads(),
        ),
        citations: _githubCitations(),
      ),
    );

    await tester.pumpWidget(_TestApp(summary: summary));
    await tester.pumpAndSettle();
    await tester.tap(
      find.byKey(const ValueKey('reader-summary-top-posts-board-github')),
    );
    await tester.pumpAndSettle();

    expect(find.bySemanticsLabel('GitHub trends, 10 items'), findsOneWidget);
    expect(
      find.text('Top 10 repositories in GitHub Trending order'),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('reader-summary-top-posts-sort')),
      findsNothing,
    );
    expect(find.text('owner/repo-11'), findsNothing);
    expect(find.text('owner/repo-12'), findsNothing);
    expect(
      tester.getTopLeft(find.text('owner/repo-1')).dy,
      lessThan(tester.getTopLeft(find.text('owner/repo-2')).dy),
    );
    expect(
      tester.widget<Text>(find.text('owner/repo-1')).style?.fontWeight,
      FontWeight.w900,
    );
    expect(
      tester.widget<Text>(find.text('owner/repo-2')).style?.fontWeight,
      FontWeight.w700,
    );
    expect(tester.takeException(), isNull);
  });
}

List<TopReadApiDto> _githubTopReads() => List.generate(10, (index) => index + 1)
    .map(
      (rank) => TopReadApiDto(
        title: 'owner/repo-$rank is #$rank on GitHub Trending',
        providerKey: 'github-trending-page',
        reason: 'Repository $rank is trending on GitHub today.',
        matchedInterestIds: const ['ai-developer-tools'],
        signalScore: (13 - rank).toDouble(),
        confirmedProviderKeys: const ['github-trending-page'],
        providerMetrics: [
          const ProviderMetricApiDto(label: 'Stars', value: '12,000'),
          ProviderMetricApiDto(
            label: 'GitHub Trending today',
            value: '#$rank, +${rank == 1 ? 1200 : 100} stars today',
          ),
        ],
        canonicalUrl: 'https://github.com/owner/repo-$rank',
        citationIds: ['github-c-$rank'],
      ),
    )
    .toList(growable: false);

List<SummaryCitationApiDto> _githubCitations() => List.generate(
  12,
  (index) => summaryCitationApiDto(
    id: 'github-c-${index + 1}',
    sourceLabel: 'GitHub Trending',
    providerKey: 'github-trending-page',
    canonicalUrl: 'https://github.com/owner/repo-${index + 1}',
  ),
);

List<TopReadApiDto> _editorialOrderTopReads() => [
  const TopReadApiDto(
    title: 'Backend editorial winner',
    providerKey: 'x-twitter',
    reason: 'Backend ranking selected this relevant verified workflow signal.',
    matchedInterestIds: ['ai-developer-tools'],
    signalScore: 2.2,
    confidence: TopReadConfidenceApiDto(
      level: 'medium',
      score: 0.62,
      rationale: 'Relevant source evidence.',
    ),
    confirmedProviderKeys: ['x-twitter'],
    providerMetrics: [ProviderMetricApiDto(label: 'Likes', value: '100')],
    citationIds: ['lazy-c-0'],
  ),
  const TopReadApiDto(
    title: 'Higher engagement runner-up',
    providerKey: 'hacker-news',
    reason: 'Useful secondary evidence with higher native engagement.',
    matchedInterestIds: ['ai-developer-tools'],
    signalScore: 2.6,
    confidence: TopReadConfidenceApiDto(
      level: 'high',
      score: 0.82,
      rationale: 'Multiple source groups surfaced the item.',
    ),
    confirmedProviderKeys: ['hacker-news', 'reddit'],
    providerMetrics: [ProviderMetricApiDto(label: 'Points', value: '10,000')],
    citationIds: ['lazy-c-1'],
  ),
];

TopReadApiDto _longTailSelectedPost() => const TopReadApiDto(
  title: 'Long-tail selected evidence',
  providerKey: 'reddit',
  reason: 'Selected evidence that is not an editorial top read.',
  matchedInterestIds: ['ai-developer-tools'],
  signalScore: 1.4,
  citationIds: ['long-tail-citation'],
);

ReaderSummaryContentApiDto _contentWithSelectedPosts(
  ReaderSummaryContentApiDto content,
  List<TopReadApiDto> selectedPosts,
) => ReaderSummaryContentApiDto(
  headline: content.headline,
  oneLineTakeaway: content.oneLineTakeaway,
  bullets: content.bullets,
  narrativeSections: content.narrativeSections,
  mainTopics: content.mainTopics,
  topicMap: content.topicMap,
  qualityState: content.qualityState,
  interestSections: content.interestSections,
  sourceMix: content.sourceMix,
  topReads: content.topReads,
  selectedPosts: selectedPosts,
  claimBoard: content.claimBoard,
  reliabilityReport: content.reliabilityReport,
  trendDelta: content.trendDelta,
  openQuestions: content.openQuestions,
  risks: content.risks,
  nextActions: content.nextActions,
);

List<TopReadApiDto> _topReads(int count) {
  return List<TopReadApiDto>.generate(count, (index) {
    return TopReadApiDto(
      title: 'Lazy top post $index',
      providerKey: 'reddit',
      reason: 'Post $index explains why this signal matters.',
      matchedInterestIds: const ['ai-developer-tools'],
      signalScore: (count - index).toDouble(),
      confidence: const TopReadConfidenceApiDto(
        level: 'medium',
        score: 0.55,
        rationale: 'Same-source support.',
      ),
      confirmedProviderKeys: const ['reddit'],
      providerMetrics: [
        ProviderMetricApiDto(label: 'Likes', value: '${1000 - index}'),
      ],
      citationIds: ['lazy-c-$index'],
    );
  });
}

List<SummaryCitationApiDto> _citations(int count) {
  return List<SummaryCitationApiDto>.generate(count, (index) {
    return summaryCitationApiDto(
      id: 'lazy-c-$index',
      providerKey: 'reddit',
      canonicalUrl: 'https://reddit.example/post/$index',
    );
  });
}

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
