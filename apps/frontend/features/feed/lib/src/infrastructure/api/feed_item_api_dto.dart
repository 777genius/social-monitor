import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

final class ListFeedItemsApiRequestDto {
  const ListFeedItemsApiRequestDto({
    required this.scope,
    required this.page,
    required this.search,
    this.interestId,
    this.providerKey,
    this.repositoryTrendWindow,
    this.repositoryLanguage,
    this.repositoryTopic,
  });

  final WorkspaceScope scope;
  final PageRequest page;
  final String search;
  final String? interestId;
  final String? providerKey;
  final String? repositoryTrendWindow;
  final String? repositoryLanguage;
  final String? repositoryTopic;
}

final class FeedItemApiDto {
  const FeedItemApiDto({
    required this.id,
    required this.interestId,
    required this.sourceItemId,
    required this.sourceBindingId,
    required this.providerKey,
    required this.canonicalUrl,
    required this.title,
    required this.bodyPreview,
    required this.publishedAt,
    required this.observedAt,
    this.authorHandle,
    this.normalizedSignal,
    this.providerMetadata,
    this.providerMetrics,
  });

  final String id;
  final String interestId;
  final String sourceItemId;
  final String sourceBindingId;
  final String providerKey;
  final String canonicalUrl;
  final String title;
  final String bodyPreview;
  final String? authorHandle;
  final FeedSignalApiDto? normalizedSignal;
  final Object? providerMetadata;
  final Object? providerMetrics;
  final DateTime publishedAt;
  final DateTime observedAt;
}

final class FeedSignalApiDto {
  const FeedSignalApiDto({
    required this.score,
    required this.band,
    required this.confidence,
    required this.basis,
    required this.computedAt,
    required this.cohort,
  });

  final num score;
  final String band;
  final num confidence;
  final String basis;
  final DateTime computedAt;
  final FeedSignalCohortApiDto cohort;
}

final class FeedSignalCohortApiDto {
  const FeedSignalCohortApiDto({
    required this.providerKey,
    required this.sourceKey,
    required this.contentType,
    required this.ageBucket,
    required this.baselineWindow,
    required this.sampleSize,
    required this.percentile,
    required this.zScore,
    required this.fallback,
  });

  final String providerKey;
  final String sourceKey;
  final String contentType;
  final String ageBucket;
  final String baselineWindow;
  final num sampleSize;
  final num percentile;
  final num zScore;
  final String fallback;
}

final class ListFeedItemsApiResponseDto {
  const ListFeedItemsApiResponseDto({required this.items, this.nextCursor});

  final List<FeedItemApiDto> items;
  final String? nextCursor;
}
