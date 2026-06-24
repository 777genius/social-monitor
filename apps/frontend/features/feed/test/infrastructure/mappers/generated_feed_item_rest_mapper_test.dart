import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_feed/src/infrastructure/mappers/generated_feed_item_rest_mapper.dart';
import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;

void main() {
  test('maps generated feed list and detail DTOs', () {
    const mapper = GeneratedFeedItemRestMapper();
    final listProviderMetrics =
        generated.FeedItemDtoProviderMetricsProviderMetrics.fromJson(
          const <String, dynamic>{
            'kind': 'reddit_post',
            'providerKey': 'reddit',
            'sourceKey': 'r/startups',
            'contentType': 'post',
            'score': 55,
            'comments': 18,
            'upvoteRatio': 0.91,
          },
        );
    final detailProviderMetrics =
        generated.GetFeedItemResponseDtoProviderMetricsProviderMetrics.fromJson(
          const <String, dynamic>{
            'kind': 'reddit_post',
            'providerKey': 'reddit',
            'sourceKey': 'r/startups',
            'contentType': 'post',
            'score': 55,
            'comments': 18,
            'upvoteRatio': 0.91,
          },
        );
    final generatedItem = generated.FeedItemDto(
      id: 'feed-1',
      topicId: 'topic-demo',
      sourceItemId: 'source-item-1',
      sourceBindingId: 'binding-1',
      providerKey: 'reddit',
      canonicalUrl: 'https://reddit.com/comments/demo',
      title: 'Feed item',
      bodyPreview: 'Preview',
      authorHandle: 'u/demo',
      publishedAt: DateTime.utc(2026, 6, 23, 11),
      observedAt: DateTime.utc(2026, 6, 23, 12),
      normalizedSignal: generated.FeedNormalizedSignalDto(
        score: 84,
        band: generated.FeedNormalizedSignalDtoBandBand.high,
        confidence: 0.72,
        basis: generated.FeedNormalizedSignalDtoBasisBasis.cohortBaselineV1,
        computedAt: DateTime.utc(2026, 6, 23, 12),
        cohort: const generated.FeedSignalCohortDto(
          providerKey: 'reddit',
          sourceKey: 'r/startups',
          contentType: 'post',
          ageBucket: '1-3h',
          baselineWindow: generated
              .FeedSignalCohortDtoBaselineWindowBaselineWindow
              .value24h,
          sampleSize: 24,
          percentile: 0.91,
          zScore: 1.2,
          fallback: generated.FeedSignalCohortDtoFallbackFallback.exact,
        ),
      ),
      providerMetrics: listProviderMetrics,
      providerMetadata: const {
        'kind': 'github_repository_trend',
        'repository': {
          'fullName': 'openai/codex',
          'url': 'https://github.com/openai/codex',
        },
        'trend': {
          'totalStars': 54000,
          'stars24h': 210,
          'stars48h': 360,
          'stars7d': 1200,
          'stars30d': 4800,
          'stars90d': 11000,
          'rank': 1,
          'primaryWindow': '24h',
          'checkedAt': '2026-06-23T12:00:00.000Z',
          'source': 'gh_archive_bigquery_plus_github_live',
        },
      },
    );

    final list = mapper.list(
      generated.ListFeedItemsResponseDto(
        items: [generatedItem],
        nextCursor: 'cursor-2',
      ),
    );
    final detail = mapper.detail(
      generated.GetFeedItemResponseDto(
        id: 'feed-1',
        topicId: 'topic-demo',
        sourceItemId: 'source-item-1',
        sourceBindingId: 'binding-1',
        providerKey: 'reddit',
        canonicalUrl: 'https://reddit.com/comments/demo',
        title: 'Feed item',
        bodyPreview: 'Preview',
        authorHandle: 'u/demo',
        publishedAt: DateTime.utc(2026, 6, 23, 11),
        observedAt: DateTime.utc(2026, 6, 23, 12),
        normalizedSignal: generatedItem.normalizedSignal,
        providerMetrics: detailProviderMetrics,
        providerMetadata: const {
          'kind': 'github_repository_trend',
          'repository': {
            'fullName': 'openai/codex',
            'url': 'https://github.com/openai/codex',
          },
          'trend': {
            'totalStars': 54000,
            'stars24h': 210,
            'stars48h': 360,
            'stars7d': 1200,
            'stars30d': 4800,
            'stars90d': 11000,
            'rank': 1,
            'primaryWindow': '24h',
            'checkedAt': '2026-06-23T12:00:00.000Z',
            'source': 'gh_archive_bigquery_plus_github_live',
          },
        },
      ),
    );

    expect(list.items.single.id, 'feed-1');
    expect(list.items.single.providerMetadata, isA<Map<String, Object?>>());
    expect(list.items.single.normalizedSignal?.score, 84);
    expect(list.items.single.normalizedSignal?.cohort.baselineWindow, '24h');
    expect(list.items.single.providerMetrics, isA<Map<String, Object?>>());
    expect(list.items.single.providerMetrics, {
      'kind': 'reddit_post',
      'providerKey': 'reddit',
      'sourceKey': 'r/startups',
      'contentType': 'post',
      'score': 55,
      'comments': 18,
      'upvoteRatio': 0.91,
    });
    expect(list.nextCursor, 'cursor-2');
    expect(detail.providerMetadata, isA<Map<String, Object?>>());
    expect(detail.normalizedSignal?.cohort.sourceKey, 'r/startups');
    expect(detail.providerMetrics, isA<Map<String, Object?>>());
    expect(detail.providerMetrics, list.items.single.providerMetrics);
    expect(detail.sourceBindingId, 'binding-1');
  });
}
