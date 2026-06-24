import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;

import '../api/feed_item_api_dto.dart';

final class GeneratedFeedItemRestMapper {
  const GeneratedFeedItemRestMapper();

  ListFeedItemsApiResponseDto list(generated.ListFeedItemsResponseDto dto) {
    return ListFeedItemsApiResponseDto(
      items: dto.items.map(item).toList(growable: false),
      nextCursor: dto.nextCursor,
    );
  }

  FeedItemApiDto item(generated.FeedItemDto dto) {
    return FeedItemApiDto(
      id: dto.id,
      topicId: dto.topicId,
      sourceItemId: dto.sourceItemId,
      sourceBindingId: dto.sourceBindingId,
      providerKey: dto.providerKey,
      canonicalUrl: dto.canonicalUrl,
      title: dto.title,
      bodyPreview: dto.bodyPreview,
      authorHandle: dto.authorHandle,
      normalizedSignal: _signal(dto.normalizedSignal),
      providerMetadata: dto.providerMetadata,
      providerMetrics: _providerMetrics(dto.providerMetrics),
      publishedAt: dto.publishedAt,
      observedAt: dto.observedAt,
    );
  }

  FeedItemApiDto detail(generated.GetFeedItemResponseDto dto) {
    return FeedItemApiDto(
      id: dto.id,
      topicId: dto.topicId,
      sourceItemId: dto.sourceItemId,
      sourceBindingId: dto.sourceBindingId,
      providerKey: dto.providerKey,
      canonicalUrl: dto.canonicalUrl,
      title: dto.title,
      bodyPreview: dto.bodyPreview,
      authorHandle: dto.authorHandle,
      normalizedSignal: _signal(dto.normalizedSignal),
      providerMetadata: dto.providerMetadata,
      providerMetrics: _providerMetrics(dto.providerMetrics),
      publishedAt: dto.publishedAt,
      observedAt: dto.observedAt,
    );
  }

  FeedSignalApiDto? _signal(generated.FeedNormalizedSignalDto? dto) {
    if (dto == null) {
      return null;
    }

    return FeedSignalApiDto(
      score: dto.score,
      band: dto.band.json ?? 'unknown',
      confidence: dto.confidence,
      basis: dto.basis.json ?? 'unknown',
      computedAt: dto.computedAt,
      cohort: FeedSignalCohortApiDto(
        providerKey: dto.cohort.providerKey,
        sourceKey: dto.cohort.sourceKey,
        contentType: dto.cohort.contentType,
        ageBucket: dto.cohort.ageBucket,
        baselineWindow: dto.cohort.baselineWindow.json ?? 'all',
        sampleSize: dto.cohort.sampleSize,
        percentile: dto.cohort.percentile,
        zScore: dto.cohort.zScore,
        fallback: dto.cohort.fallback.json ?? 'unknown',
      ),
    );
  }

  Object? _providerMetrics(Object? metrics) {
    if (metrics == null) {
      return null;
    }

    if (metrics
        is generated.FeedItemDtoProviderMetricsProviderMetricsRedditPost) {
      return _redditMetrics(
        kind: metrics.kind.json,
        providerKey: metrics.providerKey.json,
        sourceKey: metrics.sourceKey,
        contentType: metrics.contentType.json,
        score: metrics.score,
        comments: metrics.comments,
        upvoteRatio: metrics.upvoteRatio,
      );
    }
    if (metrics
        is generated.GetFeedItemResponseDtoProviderMetricsProviderMetricsRedditPost) {
      return _redditMetrics(
        kind: metrics.kind.json,
        providerKey: metrics.providerKey.json,
        sourceKey: metrics.sourceKey,
        contentType: metrics.contentType.json,
        score: metrics.score,
        comments: metrics.comments,
        upvoteRatio: metrics.upvoteRatio,
      );
    }
    if (metrics
        is generated.FeedItemDtoProviderMetricsProviderMetricsGithubRepository) {
      return _githubRepositoryMetrics(
        kind: metrics.kind.json,
        providerKey: metrics.providerKey.json,
        sourceKey: metrics.sourceKey,
        contentType: metrics.contentType.json,
        stars: metrics.stars,
        forks: metrics.forks,
        trendingDelta: metrics.trendingDelta,
        trendDeltas: metrics.trendDeltas,
      );
    }
    if (metrics
        is generated.GetFeedItemResponseDtoProviderMetricsProviderMetricsGithubRepository) {
      return _githubRepositoryMetrics(
        kind: metrics.kind.json,
        providerKey: metrics.providerKey.json,
        sourceKey: metrics.sourceKey,
        contentType: metrics.contentType.json,
        stars: metrics.stars,
        forks: metrics.forks,
        trendingDelta: metrics.trendingDelta,
        trendDeltas: metrics.trendDeltas,
      );
    }
    if (metrics
        is generated.FeedItemDtoProviderMetricsProviderMetricsHackerNewsStory) {
      return _hackerNewsStoryMetrics(
        kind: metrics.kind.json,
        providerKey: metrics.providerKey.json,
        sourceKey: metrics.sourceKey,
        contentType: metrics.contentType.json,
        points: metrics.points,
        comments: metrics.comments,
      );
    }
    if (metrics
        is generated.GetFeedItemResponseDtoProviderMetricsProviderMetricsHackerNewsStory) {
      return _hackerNewsStoryMetrics(
        kind: metrics.kind.json,
        providerKey: metrics.providerKey.json,
        sourceKey: metrics.sourceKey,
        contentType: metrics.contentType.json,
        points: metrics.points,
        comments: metrics.comments,
      );
    }
    if (metrics is generated.FeedItemDtoProviderMetricsProviderMetricsXPost) {
      return _xPostMetrics(
        kind: metrics.kind.json,
        providerKey: metrics.providerKey.json,
        sourceKey: metrics.sourceKey,
        contentType: metrics.contentType.json,
        likes: metrics.likes,
        reposts: metrics.reposts,
        replies: metrics.replies,
        quotes: metrics.quotes,
        bookmarks: metrics.bookmarks,
        impressions: metrics.impressions,
      );
    }
    if (metrics
        is generated.GetFeedItemResponseDtoProviderMetricsProviderMetricsXPost) {
      return _xPostMetrics(
        kind: metrics.kind.json,
        providerKey: metrics.providerKey.json,
        sourceKey: metrics.sourceKey,
        contentType: metrics.contentType.json,
        likes: metrics.likes,
        reposts: metrics.reposts,
        replies: metrics.replies,
        quotes: metrics.quotes,
        bookmarks: metrics.bookmarks,
        impressions: metrics.impressions,
      );
    }

    return null;
  }

  Map<String, Object?> _redditMetrics({
    required String? kind,
    required String? providerKey,
    required String sourceKey,
    required String? contentType,
    required num score,
    required num comments,
    required num? upvoteRatio,
  }) {
    final metrics = {
      'kind': kind,
      'providerKey': providerKey,
      'sourceKey': sourceKey,
      'contentType': contentType,
      'score': score,
      'comments': comments,
    };
    if (upvoteRatio != null) {
      metrics['upvoteRatio'] = upvoteRatio;
    }

    return metrics;
  }

  Map<String, Object?> _githubRepositoryMetrics({
    required String? kind,
    required String? providerKey,
    required String sourceKey,
    required String? contentType,
    required num stars,
    required num forks,
    required generated.FeedMetricDeltaDto trendingDelta,
    required List<generated.FeedMetricDeltaDto> trendDeltas,
  }) {
    return {
      'kind': kind,
      'providerKey': providerKey,
      'sourceKey': sourceKey,
      'contentType': contentType,
      'stars': stars,
      'forks': forks,
      'trendingDelta': _trendDelta(trendingDelta),
      'trendDeltas': trendDeltas.map(_trendDelta).toList(growable: false),
    };
  }

  Map<String, Object?> _hackerNewsStoryMetrics({
    required String? kind,
    required String? providerKey,
    required String sourceKey,
    required String? contentType,
    required num points,
    required num comments,
  }) {
    return {
      'kind': kind,
      'providerKey': providerKey,
      'sourceKey': sourceKey,
      'contentType': contentType,
      'points': points,
      'comments': comments,
    };
  }

  Map<String, Object?> _xPostMetrics({
    required String? kind,
    required String? providerKey,
    required String sourceKey,
    required String? contentType,
    required num likes,
    required num reposts,
    required num replies,
    required num quotes,
    required num bookmarks,
    required num impressions,
  }) {
    return {
      'kind': kind,
      'providerKey': providerKey,
      'sourceKey': sourceKey,
      'contentType': contentType,
      'likes': likes,
      'reposts': reposts,
      'replies': replies,
      'quotes': quotes,
      'bookmarks': bookmarks,
      'impressions': impressions,
    };
  }

  Map<String, Object?> _trendDelta(generated.FeedMetricDeltaDto delta) {
    return {'window': delta.window, 'value': delta.value};
  }
}
