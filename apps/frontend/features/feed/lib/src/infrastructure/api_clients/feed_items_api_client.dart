import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../api/feed_item_api_dto.dart';

abstract interface class FeedItemsApiClient {
  Future<Result<ListFeedItemsApiResponseDto>> listFeedItems(
    ListFeedItemsApiRequestDto request,
  );

  Future<Result<FeedItemApiDto>> loadFeedItem({
    required WorkspaceScope scope,
    required String feedItemId,
  });
}
