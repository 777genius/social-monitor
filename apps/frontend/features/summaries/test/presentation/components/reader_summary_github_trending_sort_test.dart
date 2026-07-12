import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_brief_surface.dart';
import 'package:social_monitor_summaries/src/presentation/formatters/top_post_metrics.dart';
import 'package:social_monitor_summaries/src/presentation/view_models/reader_summary_top_post_sorting.dart';

void main() {
  final rankOne = _githubRead(
    title: 'rank-one/repository',
    position: 1,
    starsGained: 100,
    signalScore: 1,
  );
  final rankTwo = _githubRead(
    title: 'rank-two/repository',
    position: 2,
    starsGained: 900,
    signalScore: 5,
  );
  final rankThree = _githubRead(
    title: 'rank-three/repository',
    position: 3,
    starsGained: 300,
    signalScore: 10,
  );

  test('GitHub sort policy reuses position and native stars gained', () {
    expect(githubTrendingPosition(rankOne), 1);
    expect(githubTrendingStarsGained(rankTwo), 900);

    final byPosition = [rankThree, rankTwo, rankOne]
      ..sort(
        (first, second) => compareReaderSummaryTopPosts(
          first,
          second,
          ReaderSummaryTopPostSort.githubPosition,
        ),
      );
    expect(byPosition.map((item) => item.title), [
      'rank-one/repository',
      'rank-two/repository',
      'rank-three/repository',
    ]);

    final byStarsGained = [rankOne, rankThree, rankTwo]
      ..sort(
        (first, second) => compareReaderSummaryTopPosts(
          first,
          second,
          ReaderSummaryTopPostSort.starsGained,
        ),
      );
    expect(byStarsGained.first.title, 'rank-two/repository');
  });

  test('GitHub position does not interleave snapshots or language scopes', () {
    final latestCapturedAt = DateTime.utc(2026, 7, 12, 8);
    final latestRankOne = _githubRead(
      title: 'latest/rank-one',
      position: 1,
      starsGained: 80,
      signalScore: 1,
      providerRanking: _ranking(position: 1, capturedAt: latestCapturedAt),
    );
    final latestRankTwo = _githubRead(
      title: 'latest/rank-two',
      position: 2,
      starsGained: 700,
      signalScore: 8,
      providerRanking: _ranking(position: 2, capturedAt: latestCapturedAt),
    );
    final olderRankOne = _githubRead(
      title: 'older/rank-one',
      position: 1,
      starsGained: 900,
      signalScore: 9,
      providerRanking: _ranking(
        position: 1,
        capturedAt: latestCapturedAt.subtract(const Duration(days: 1)),
      ),
    );
    final latestPythonRankOne = _githubRead(
      title: 'latest-python/rank-one',
      position: 1,
      starsGained: 600,
      signalScore: 7,
      providerRanking: _ranking(
        position: 1,
        capturedAt: latestCapturedAt,
        programmingLanguage: 'python',
      ),
    );

    final sorted =
        [olderRankOne, latestPythonRankOne, latestRankTwo, latestRankOne]..sort(
          (first, second) => compareReaderSummaryTopPosts(
            first,
            second,
            ReaderSummaryTopPostSort.githubPosition,
          ),
        );

    expect(sorted.map((item) => item.title), [
      'latest/rank-one',
      'latest/rank-two',
      'latest-python/rank-one',
      'older/rank-one',
    ]);
  });

  testWidgets(
    'GitHub tab defaults to position and switches to For you and Stars gained',
    (tester) async {
      tester.view.physicalSize = const Size(1200, 1000);
      tester.view.devicePixelRatio = 1;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      await tester.pumpWidget(_TestApp(items: [rankThree, rankTwo, rankOne]));
      await tester.pumpAndSettle();

      expect(find.text('GitHub position'), findsOneWidget);
      _expectBefore(tester, 'rank-one/repository', 'rank-two/repository');

      await _selectSort(tester, 'For you');

      expect(find.text('For you'), findsOneWidget);
      _expectBefore(tester, 'rank-three/repository', 'rank-two/repository');

      await _selectSort(tester, 'Stars gained');

      expect(find.text('Stars gained'), findsOneWidget);
      _expectBefore(tester, 'rank-two/repository', 'rank-three/repository');
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('Top posts keeps only Relevance and Engagement sorts', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1000, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    await tester.pumpWidget(
      _TestApp(
        items: [
          _genericRead(title: 'generic/post'),
          rankOne,
        ],
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Relevance'), findsOneWidget);
    await tester.tap(
      find.byKey(const ValueKey('reader-summary-top-posts-sort')),
    );
    await tester.pumpAndSettle();

    expect(find.text('Engagement'), findsOneWidget);
    expect(find.text('GitHub position'), findsNothing);
    expect(find.text('For you'), findsNothing);
    expect(find.text('Stars gained'), findsNothing);
  });
}

Future<void> _selectSort(WidgetTester tester, String label) async {
  await tester.tap(find.byKey(const ValueKey('reader-summary-top-posts-sort')));
  await tester.pumpAndSettle();
  await tester.tap(find.text(label).last);
  await tester.pumpAndSettle();
}

void _expectBefore(WidgetTester tester, String first, String second) {
  expect(
    tester.getTopLeft(find.text(first)).dy,
    lessThan(tester.getTopLeft(find.text(second)).dy),
  );
}

TopRead _githubRead({
  required String title,
  required int position,
  required int starsGained,
  required double signalScore,
  GitHubTrendingRanking? providerRanking,
}) {
  return TopRead(
    title: title,
    providerKey: 'github-trending-page',
    reason: 'Trending repository selected for this test.',
    matchedInterestIds: const ['developer-tools'],
    matchedRules: const ['interest:developer-tools'],
    signalScore: SignalScore.normalized(signalScore),
    confidence: const TopReadConfidence(
      level: 'medium',
      score: 0.5,
      rationale: 'Deterministic test confidence.',
    ),
    confirmedProviderKeys: const ['github-trending-page'],
    providerMetrics: [
      ProviderMetric(
        label: 'GitHub Trending today',
        value: '#$position, +$starsGained stars today',
      ),
    ],
    whyImportant: const ['Useful test repository.'],
    whyNow: 'Present in the current snapshot.',
    citationIds: const [],
    canonicalUrl: 'https://github.example/$title',
    providerRanking: providerRanking,
  );
}

GitHubTrendingRanking _ranking({
  required int position,
  required DateTime capturedAt,
  String programmingLanguage = 'dart',
}) {
  return GitHubTrendingRanking(
    position: position,
    starsGained: position * 100,
    window: GitHubTrendingWindow.daily,
    capturedAt: capturedAt,
    scope: GitHubTrendingScope(programmingLanguage: programmingLanguage),
  );
}

TopRead _genericRead({required String title}) {
  return TopRead(
    title: title,
    providerKey: 'reddit',
    reason: 'Generic post selected for this test.',
    matchedInterestIds: const ['developer-tools'],
    matchedRules: const ['interest:developer-tools'],
    signalScore: SignalScore.normalized(3),
    confidence: const TopReadConfidence(
      level: 'medium',
      score: 0.5,
      rationale: 'Deterministic test confidence.',
    ),
    confirmedProviderKeys: const ['reddit'],
    providerMetrics: const [ProviderMetric(label: 'Upvotes', value: '500')],
    whyImportant: const ['Useful test post.'],
    whyNow: 'Present in the current snapshot.',
    citationIds: const [],
    canonicalUrl: 'https://reddit.example/$title',
  );
}

class _TestApp extends StatelessWidget {
  const _TestApp({required this.items});

  final List<TopRead> items;

  @override
  Widget build(BuildContext context) {
    final theme = AppTheme.light();
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
                  items: items,
                  curatedTopPostCount: items.length,
                  selectedPostCount: items.length,
                  period: SummaryPeriodPreset.daily.resolve(
                    now: DateTime.utc(2026, 7, 12),
                  ),
                  citationsById: const {},
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
