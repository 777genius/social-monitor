import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_feed/src/domain/value_objects/feed_provider_metadata.dart';
import 'package:social_monitor_feed/src/domain/value_objects/feed_provider_metrics.dart';
import 'package:social_monitor_feed/src/domain/value_objects/feed_signal_snapshot.dart';
import 'package:social_monitor_feed/src/infrastructure/mappers/feed_item_mapper.dart';

import '../../support/feed_test_fixtures.dart';

void main() {
  test('maps feed item DTO and redacts unsafe preview text', () {
    const mapper = FeedItemMapper();

    final item = mapper.toDomain(
      feedItemApiDto(
        bodyPreview: 'Token Bearer abc.def and sk-secret should not leak',
      ),
    );

    expect(item.id.value, 'feed-1');
    expect(item.providerKey, 'reddit');
    expect(item.bodyPreview, contains('[redacted]'));
    expect(item.bodyPreview, isNot(contains('sk-secret')));
  });

  test('falls back for invalid canonical URL', () {
    const mapper = FeedItemMapper();

    final item = mapper.toDomain(feedItemApiDto(canonicalUrl: 'not a url'));

    expect(item.canonicalUrl, 'Unavailable');
  });

  test('maps GitHub repository trend metadata into a typed domain value', () {
    const mapper = FeedItemMapper();

    final item = mapper.toDomain(
      feedItemApiDto(
        providerKey: 'github-repo-radar',
        providerMetadata: githubRepositoryTrendMetadataFixture(),
      ),
    );

    final metadata = item.providerMetadata;
    expect(metadata, isA<GitHubRepositoryTrendMetadata>());
    final trend = metadata as GitHubRepositoryTrendMetadata;
    expect(trend.repositoryFullName, 'openai/codex');
    expect(trend.totalStars, 54000);
    expect(trend.stars24h, 210);
    expect(trend.stars48h, 360);
    expect(trend.primaryWindowLabel, '+210 / 24h');
  });

  test('maps normalized signal and raw provider metrics into typed values', () {
    const mapper = FeedItemMapper();

    final item = mapper.toDomain(
      feedItemApiDto(
        normalizedSignal: feedSignalApiDto(),
        providerMetrics: redditPostMetricsFixture(),
      ),
    );

    expect(item.normalizedSignal, isA<FeedSignalSnapshot>());
    expect(item.normalizedSignal?.score, 84);
    expect(item.normalizedSignal?.band, FeedSignalBand.high);
    expect(item.normalizedSignal?.cohort.sourceKey, 'r/startups');
    expect(item.normalizedSignal?.cohort.baselineWindow, '24h');
    expect(item.providerMetrics, isA<RedditPostMetrics>());
    final metrics = item.providerMetrics as RedditPostMetrics;
    expect(metrics.score, 55);
    expect(metrics.comments, 18);
    expect(metrics.upvoteRatio, 0.91);
  });

  test('preserves negative Reddit raw score', () {
    const mapper = FeedItemMapper();

    final item = mapper.toDomain(
      feedItemApiDto(providerMetrics: redditPostMetricsFixture(score: -3)),
    );

    expect(item.providerMetrics, isA<RedditPostMetrics>());
    final metrics = item.providerMetrics as RedditPostMetrics;
    expect(metrics.score, -3);
  });

  test('maps GitHub raw 24h and 7d trend deltas', () {
    const mapper = FeedItemMapper();

    final item = mapper.toDomain(
      feedItemApiDto(providerMetrics: githubRepositoryMetricsFixture()),
    );

    expect(item.providerMetrics, isA<GitHubRepositoryMetrics>());
    final metrics = item.providerMetrics as GitHubRepositoryMetrics;
    expect(metrics.trendingDelta.window, '24h');
    expect(metrics.trendingDelta.value, 210);
    expect(
      metrics.trendDeltas.map((delta) => '${delta.value}/${delta.window}'),
      ['210/24h', '360/48h', '1200/7d', '4800/30d', '11000/90d'],
    );
  });

  test('ignores malformed provider metrics instead of fabricating zeros', () {
    const mapper = FeedItemMapper();

    const malformedPayloads = [
      {'kind': 'reddit_post', 'sourceKey': 'r/startups'},
      {'kind': 'hacker_news_story', 'sourceKey': 'hn:top'},
      {'kind': 'x_post', 'sourceKey': 'account:openai'},
      {
        'kind': 'github_repository',
        'sourceKey': 'repo-trending:24h',
        'stars': 54000,
        'forks': 6100,
        'trendingDelta': {'window': '24h'},
      },
    ];

    for (final providerMetrics in malformedPayloads) {
      final item = mapper.toDomain(
        feedItemApiDto(providerMetrics: providerMetrics),
      );

      expect(item.providerMetrics, isNull);
    }
  });

  test('keeps explicit zero provider metrics as valid values', () {
    const mapper = FeedItemMapper();

    final item = mapper.toDomain(
      feedItemApiDto(
        providerMetrics: const {
          'kind': 'x_post',
          'providerKey': 'x-twitter',
          'sourceKey': 'account:openai',
          'contentType': 'post',
          'likes': 0,
          'reposts': 0,
          'replies': 0,
          'quotes': 0,
          'bookmarks': 0,
          'impressions': 0,
        },
      ),
    );

    expect(item.providerMetrics, isA<XPostMetrics>());
    final metrics = item.providerMetrics as XPostMetrics;
    expect(metrics.likes, 0);
    expect(metrics.reposts, 0);
    expect(metrics.replies, 0);
    expect(metrics.quotes, 0);
    expect(metrics.bookmarks, 0);
    expect(metrics.impressions, 0);
  });
}
