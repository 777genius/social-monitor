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
      providerMetadata: dto.providerMetadata,
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
      providerMetadata: dto.providerMetadata,
      publishedAt: dto.publishedAt,
      observedAt: dto.observedAt,
    );
  }
}
