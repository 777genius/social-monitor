import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/contracts/feed_item_catalog.dart';
import '../../application/queries/list_feed_items_query.dart';
import '../../application/queries/load_feed_item_query.dart';
import '../../domain/entities/feed_item.dart';
import '../api/feed_item_api_dto.dart';
import '../api_clients/feed_items_api_client.dart';
import '../mappers/feed_item_mapper.dart';

final class GeneratedFeedItemCatalog implements FeedItemCatalog {
  const GeneratedFeedItemCatalog({
    required FeedItemsApiClient apiClient,
    FeedItemMapper mapper = const FeedItemMapper(),
  }) : _apiClient = apiClient,
       _mapper = mapper;

  final FeedItemsApiClient _apiClient;
  final FeedItemMapper _mapper;

  @override
  Future<Result<PageResult<FeedItem>>> listFeedItems(
    ListFeedItemsQuery query,
  ) async {
    final normalized = query.normalized();
    final result = await _apiClient.listFeedItems(
      ListFeedItemsApiRequestDto(
        scope: normalized.scope,
        page: normalized.page,
        search: normalized.filter.search,
        interestId: normalized.filter.interestId,
        providerKey: normalized.filter.providerKey,
        repositoryTrendWindow: normalized.filter.repositoryTrendWindow,
        repositoryLanguage: normalized.filter.repositoryLanguage,
        repositoryTopic: normalized.filter.repositoryTopic,
      ),
    );
    return result.fold(
      onSuccess: (page) => Result.success(
        PageResult<FeedItem>(
          items: page.items.map(_mapper.toDomain).toList(growable: false),
          request: normalized.page,
          nextCursor: page.nextCursor,
        ),
      ),
      onFailure: Result<PageResult<FeedItem>>.failure,
    );
  }

  @override
  Future<Result<FeedItem>> loadFeedItem(LoadFeedItemQuery query) async {
    final result = await _apiClient.loadFeedItem(
      scope: query.scope,
      feedItemId: query.feedItemId.value,
    );
    return result.fold(
      onSuccess: (dto) => Result.success(_mapper.toDomain(dto)),
      onFailure: Result<FeedItem>.failure,
    );
  }
}
