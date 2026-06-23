import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_feed/src/domain/value_objects/feed_provider_metadata.dart';
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
    expect(trend.primaryWindowLabel, '+210 / 24h');
  });
}
