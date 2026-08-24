import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/presentation/formatters/top_post_metrics.dart';

void main() {
  test('preserves an exact canonical GitHub Top 10', () {
    final posts = List.generate(10, (index) => _githubTrend(index + 1));

    expect(orderGitHubTrendingPosts(posts).map((post) => post.title), [
      for (var rank = 1; rank <= 10; rank++) 'owner/repo-$rank',
    ]);
  });

  test('rejects the whole GitHub board on a gap or reordered rank', () {
    final posts = List.generate(10, (index) => _githubTrend(index + 1));

    expect(
      orderGitHubTrendingPosts([...posts.take(8), posts[9], posts[8]]),
      isEmpty,
    );
    expect(orderGitHubTrendingPosts(posts.take(9)), isEmpty);
    expect(orderGitHubTrendingPosts([...posts, _githubTrend(11)]), isEmpty);
  });

  test('rejects duplicate and invalid repository identities', () {
    final posts = List.generate(10, (index) => _githubTrend(index + 1));
    final duplicate = [
      ...posts.take(9),
      _githubTrend(10, canonicalUrl: posts.first.canonicalUrl),
    ];
    final invalid = [
      ...posts.take(9),
      _githubTrend(10, canonicalUrl: 'https://github.com/owner/repo/issues/1'),
    ];

    expect(orderGitHubTrendingPosts(duplicate), isEmpty);
    expect(orderGitHubTrendingPosts(invalid), isEmpty);
  });

  test('rejects non-GitHub providers and non-canonical rank metrics', () {
    final posts = List.generate(10, (index) => _githubTrend(index + 1));

    expect(
      orderGitHubTrendingPosts([
        ...posts.take(9),
        _githubTrend(10, providerKey: 'github-issues'),
      ]),
      isEmpty,
    );
    expect(
      orderGitHubTrendingPosts([
        ...posts.take(9),
        _githubTrend(10, trendingMetricLabel: 'Not GitHub Trending today'),
      ]),
      isEmpty,
    );
  });

  test('rejects duplicate citation identity for the whole board', () {
    final posts = List.generate(10, (index) => _githubTrend(index + 1));
    final duplicateCitation = [
      ...posts.take(9),
      _githubTrend(10, citationId: posts.first.citationIds.single),
    ];

    expect(orderGitHubTrendingPosts(duplicateCitation), isEmpty);
  });

  test(
    'rejects missing or ambiguous citation identity for the whole board',
    () {
      final posts = List.generate(10, (index) => _githubTrend(index + 1));

      expect(
        orderGitHubTrendingPosts([
          ...posts.take(9),
          _githubTrend(10, citationIds: const []),
        ]),
        isEmpty,
      );
      expect(
        orderGitHubTrendingPosts([
          ...posts.take(9),
          _githubTrend(10, citationIds: const ['github-c-10', 'github-c-11']),
        ]),
        isEmpty,
      );
      expect(
        orderGitHubTrendingPosts([
          ...posts.take(9),
          _githubTrend(10, citationId: '  '),
        ]),
        isEmpty,
      );
    },
  );

  for (final invalidUrl in const [
    'https://user@github.com/owner/repo-10',
    'https://user:secret@github.com/owner/repo-10',
    'https://github.com:443/owner/repo-10',
    'https://github.com/owner/repo-10/',
    'https://github.com//owner/repo-10',
    'https://github.com/owner/./repo-10',
  ]) {
    test('rejects non-canonical GitHub identity $invalidUrl', () {
      final posts = List.generate(10, (index) => _githubTrend(index + 1));

      expect(
        orderGitHubTrendingPosts([
          ...posts.take(9),
          _githubTrend(10, canonicalUrl: invalidUrl),
        ]),
        isEmpty,
      );
    });
  }

  test('emphasizes only a strict breakout above 1,000 stars today', () {
    final breakout = topPostMetricsFor(_githubTrend(1, starsToday: 1001));
    final boundary = topPostMetricsFor(_githubTrend(2, starsToday: 1000));

    expect(
      breakout
          .singleWhere((metric) => metric.label == 'Stars today')
          .emphasized,
      isTrue,
    );
    expect(
      boundary
          .singleWhere((metric) => metric.label == 'Stars today')
          .emphasized,
      isFalse,
    );
  });
}

TopRead _githubTrend(
  int rank, {
  int starsToday = 100,
  String? canonicalUrl,
  String? citationId,
  List<String>? citationIds,
  String providerKey = 'github-trending-page',
  String trendingMetricLabel = 'GitHub Trending today',
}) => TopRead(
  title: 'owner/repo-$rank',
  providerKey: providerKey,
  reason: 'Repository ranked by GitHub Trending.',
  matchedInterestIds: const ['ai-developer-tools'],
  matchedRules: const [],
  signalScore: SignalScore.normalized(1),
  confidence: const TopReadConfidence(
    level: 'medium',
    score: 0.6,
    rationale: 'GitHub Trending page evidence.',
  ),
  confirmedProviderKeys: const ['github-trending-page'],
  providerMetrics: [
    const ProviderMetric(label: 'Stars', value: '12,000'),
    ProviderMetric(
      label: trendingMetricLabel,
      value: '#$rank, +$starsToday stars today',
    ),
  ],
  whyImportant: const [],
  whyNow: 'Trending today.',
  canonicalUrl: canonicalUrl ?? 'https://github.com/owner/repo-$rank',
  citationIds: citationIds ?? [citationId ?? 'github-c-$rank'],
);
