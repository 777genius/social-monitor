import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/presentation/formatters/top_post_metrics.dart';

void main() {
  test('changes order only for engagement and keeps source order on ties', () {
    final first = _postWithLikes('Editorial first', 100);
    final second = _postWithLikes('Editorial second', 100);
    final high = _postWithLikes('Engagement winner', 500);
    final posts = [first, second, high];

    expect(orderTopPosts(posts, byEngagement: false), posts);
    expect(
      orderTopPosts(posts, byEngagement: true).map((post) => post.title),
      ['Engagement winner', 'Editorial first', 'Editorial second'],
    );
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

TopRead _postWithLikes(String title, int likes) => TopRead(
  title: title,
  providerKey: 'x-twitter',
  reason: 'Editorial evidence.',
  matchedInterestIds: const ['ai-developer-tools'],
  matchedRules: const [],
  signalScore: SignalScore.normalized(1),
  confidence: const TopReadConfidence(
    level: 'medium',
    score: 0.6,
    rationale: 'Provider evidence.',
  ),
  confirmedProviderKeys: const ['x-twitter'],
  providerMetrics: [ProviderMetric(label: 'Likes', value: '$likes Likes')],
  whyImportant: const [],
  whyNow: 'Current window.',
  citationIds: const [],
);

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
