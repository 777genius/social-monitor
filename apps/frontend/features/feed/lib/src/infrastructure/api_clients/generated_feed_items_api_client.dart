import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../api/feed_item_api_dto.dart';
import '../mappers/generated_feed_item_rest_mapper.dart';
import 'feed_items_api_client.dart';

final class GeneratedFeedItemsApiClient implements FeedItemsApiClient {
  GeneratedFeedItemsApiClient({
    required generated.GeneratedApiRuntime runtime,
    GeneratedFeedItemRestMapper mapper = const GeneratedFeedItemRestMapper(),
  }) : _runtime = runtime,
       _mapper = mapper;

  factory GeneratedFeedItemsApiClient.fromRuntime({
    required Object runtime,
    GeneratedFeedItemRestMapper mapper = const GeneratedFeedItemRestMapper(),
  }) {
    if (runtime is! generated.GeneratedApiRuntime) {
      throw ArgumentError.value(
        runtime,
        'runtime',
        'Expected GeneratedApiRuntime from packages/generated_api',
      );
    }
    return GeneratedFeedItemsApiClient(runtime: runtime, mapper: mapper);
  }

  final generated.GeneratedApiRuntime _runtime;
  final GeneratedFeedItemRestMapper _mapper;

  @override
  Future<Result<ListFeedItemsApiResponseDto>> listFeedItems(
    ListFeedItemsApiRequestDto request,
  ) async {
    final result = await _runtime.client
        .send<generated.ListFeedItemsResponseDto>(
          generated.WorkspaceRequest(scope: request.scope),
          () => _runtime.rest.feed.feedControllerList(
            xWorkspaceId: request.scope.workspaceId,
            xTenantId: request.scope.tenantId,
            q: request.search.isEmpty ? null : request.search,
            topicId: request.topicId,
            providerKey: request.providerKey,
            repositoryTrendWindow: _repositoryTrendWindow(
              request.repositoryTrendWindow,
            ),
            repositoryLanguage: request.repositoryLanguage,
            repositoryTopic: request.repositoryTopic,
            cursor: request.page.cursor,
            limit: request.page.limit,
          ),
        );
    return result.fold(
      onSuccess: (dto) => Result.success(_mapper.list(dto)),
      onFailure: Result<ListFeedItemsApiResponseDto>.failure,
    );
  }

  @override
  Future<Result<FeedItemApiDto>> loadFeedItem({
    required WorkspaceScope scope,
    required String feedItemId,
  }) async {
    final result = await _runtime.client.send<generated.GetFeedItemResponseDto>(
      generated.WorkspaceRequest(scope: scope),
      () => _runtime.rest.feed.feedControllerGet(
        feedItemId: feedItemId,
        xWorkspaceId: scope.workspaceId,
        xTenantId: scope.tenantId,
      ),
    );
    return result.fold(
      onSuccess: (dto) => Result.success(_mapper.detail(dto)),
      onFailure: Result<FeedItemApiDto>.failure,
    );
  }
}

generated.RepositoryTrendWindow? _repositoryTrendWindow(String? value) {
  return switch (value) {
    '24h' => generated.RepositoryTrendWindow.value24h,
    '7d' => generated.RepositoryTrendWindow.value7d,
    '30d' => generated.RepositoryTrendWindow.value30d,
    '90d' => generated.RepositoryTrendWindow.value90d,
    _ => null,
  };
}
