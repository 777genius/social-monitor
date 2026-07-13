import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/presentation/formatters/top_post_metrics.dart';

void main() {
  test('orders and caps GitHub Trending posts by the reported rank', () {
    final posts = [
      12,
      2,
      10,
      1,
      8,
      5,
      11,
      4,
      9,
      3,
      7,
      6,
    ].map(_githubTrend).toList(growable: false);

    expect(orderGitHubTrendingPosts(posts).map((post) => post.title), [
      for (var rank = 1; rank <= 10; rank++) 'owner/repo-$rank',
    ]);
  });

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

TopRead _githubTrend(int rank, {int starsToday = 100}) => TopRead(
  title: 'owner/repo-$rank',
  providerKey: 'github-trending-page',
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
      label: 'GitHub Trending today',
      value: '#$rank, +$starsToday stars today',
    ),
  ],
  whyImportant: const [],
  whyNow: 'Trending today.',
  citationIds: ['github-c-$rank'],
);
