import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

final class ListFeedItemsApiRequestDto {
  const ListFeedItemsApiRequestDto({
    required this.scope,
    required this.page,
    required this.search,
    this.topicId,
    this.providerKey,
    this.repositoryTrendWindow,
    this.repositoryLanguage,
    this.repositoryTopic,
  });

  final WorkspaceScope scope;
  final PageRequest page;
  final String search;
  final String? topicId;
  final String? providerKey;
  final String? repositoryTrendWindow;
  final String? repositoryLanguage;
  final String? repositoryTopic;
}

final class FeedItemApiDto {
  const FeedItemApiDto({
    required this.id,
    required this.topicId,
    required this.sourceItemId,
    required this.sourceBindingId,
    required this.providerKey,
    required this.canonicalUrl,
    required this.title,
    required this.bodyPreview,
    required this.publishedAt,
    required this.observedAt,
    this.authorHandle,
    this.providerMetadata,
  });

  final String id;
  final String topicId;
  final String sourceItemId;
  final String sourceBindingId;
  final String providerKey;
  final String canonicalUrl;
  final String title;
  final String bodyPreview;
  final String? authorHandle;
  final Object? providerMetadata;
  final DateTime publishedAt;
  final DateTime observedAt;
}

final class ListFeedItemsApiResponseDto {
  const ListFeedItemsApiResponseDto({required this.items, this.nextCursor});

  final List<FeedItemApiDto> items;
  final String? nextCursor;
}
