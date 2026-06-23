import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_feed/src/application/contracts/feed_item_catalog.dart';
import 'package:social_monitor_feed/src/application/queries/list_feed_items_query.dart';
import 'package:social_monitor_feed/src/application/queries/load_feed_item_query.dart';
import 'package:social_monitor_feed/src/application/use_cases/list_feed_items_use_case.dart';
import 'package:social_monitor_feed/src/application/use_cases/load_feed_item_use_case.dart';
import 'package:social_monitor_feed/src/domain/entities/feed_item.dart';
import 'package:social_monitor_feed/src/infrastructure/api/feed_item_api_dto.dart';
import 'package:social_monitor_feed/src/infrastructure/api_clients/in_memory_feed_items_api_client.dart';
import 'package:social_monitor_feed/src/infrastructure/repositories/generated_feed_item_catalog.dart';
import 'package:social_monitor_feed/src/presentation/stores/feed_items_store.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../support/feed_test_fixtures.dart';

void main() {
  test('paginates appends deduplicates and loads detail', () async {
    final store = _store([
      feedItemApiDto(id: 'feed-1'),
      feedItemApiDto(id: 'feed-2', title: 'Second item'),
      feedItemApiDto(id: 'feed-2', title: 'Second item updated'),
      feedItemApiDto(id: 'feed-3', title: 'Third item'),
    ]);

    await store.refresh();

    final state = store.state as ReadyViewState<PageResult<FeedItem>>;
    expect(state.value.items.map((item) => item.id.value), [
      'feed-1',
      'feed-2',
      'feed-3',
    ]);
    await store.selectItem(state.value.items.first.id);
    expect(store.detailState, isA<ReadyViewState<FeedItem>>());
  });

  test('filter change discards late list result', () async {
    final catalog = _DeferredFeedItemCatalog();
    final store = FeedItemsStore(
      listFeedItems: ListFeedItemsUseCase(catalog),
      loadFeedItem: LoadFeedItemUseCase(catalog),
      scope: feedWorkspaceScope,
    );

    final first = store.updateSearch('first');
    final second = store.updateSearch('second');
    expect(catalog.pending, hasLength(2));

    catalog.pending[1].completeWith([
      feedItem(id: 'feed-second', title: 'Second result'),
    ]);
    await second;

    catalog.pending[0].completeWith([
      feedItem(id: 'feed-first', title: 'First result'),
    ]);
    await first;

    final state = store.state as ReadyViewState<PageResult<FeedItem>>;
    expect(state.value.items.single.title, 'Second result');
  });

  test('workspace switch clears feed item state and selection', () async {
    final store = _store([feedItemApiDto()]);

    await store.refresh();

    store.updateScope(
      const WorkspaceScope(tenantId: 'tenant-demo', workspaceId: 'next'),
    );

    expect(store.state, isA<InitialViewState<PageResult<FeedItem>>>());
    expect(store.selectedListItem, isNull);
    expect(store.nextCursor, isNull);
  });

  test('repository metadata filters are sent through list query', () async {
    final catalog = _DeferredFeedItemCatalog();
    final store = FeedItemsStore(
      listFeedItems: ListFeedItemsUseCase(catalog),
      loadFeedItem: LoadFeedItemUseCase(catalog),
      scope: feedWorkspaceScope,
    );

    final providerRefresh = store.updateProviderFilter('github-repo-radar');
    catalog.pending.single.completeWith([
      feedItem(
        id: 'feed-codex',
        providerKey: 'github-repo-radar',
        providerMetadata: githubRepositoryTrendMetadataFixture(),
      ),
    ]);
    await providerRefresh;

    final languageRefresh = store.updateRepositoryLanguageFilter('TypeScript');
    catalog.pending.last.completeWith([
      feedItem(
        id: 'feed-codex',
        providerKey: 'github-repo-radar',
        providerMetadata: githubRepositoryTrendMetadataFixture(),
      ),
    ]);
    await languageRefresh;

    expect(catalog.pending.last.query.filter.providerKey, 'github-repo-radar');
    expect(catalog.pending.last.query.filter.repositoryLanguage, 'TypeScript');
  });
}

FeedItemsStore _store(List<FeedItemApiDto> items) {
  final catalog = GeneratedFeedItemCatalog(
    apiClient: InMemoryFeedItemsApiClient(items: items),
  );
  return FeedItemsStore(
    listFeedItems: ListFeedItemsUseCase(catalog),
    loadFeedItem: LoadFeedItemUseCase(catalog),
    scope: feedWorkspaceScope,
  );
}

final class _DeferredFeedItemCatalog implements FeedItemCatalog {
  final pending = <_PendingListRequest>[];

  @override
  Future<Result<PageResult<FeedItem>>> listFeedItems(ListFeedItemsQuery query) {
    final completer = Completer<Result<PageResult<FeedItem>>>();
    pending.add(_PendingListRequest(query: query, completer: completer));
    return completer.future;
  }

  @override
  Future<Result<FeedItem>> loadFeedItem(LoadFeedItemQuery query) {
    return Future.value(Result.success(feedItem(id: query.feedItemId.value)));
  }
}

final class _PendingListRequest {
  const _PendingListRequest({required this.query, required this.completer});

  final ListFeedItemsQuery query;
  final Completer<Result<PageResult<FeedItem>>> completer;

  void completeWith(List<FeedItem> items) {
    completer.complete(
      Result.success(feedItemPage(items, request: query.page)),
    );
  }
}
