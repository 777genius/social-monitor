import 'package:flutter/foundation.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/queries/list_feed_items_query.dart';
import '../../application/queries/load_feed_item_query.dart';
import '../../application/use_cases/list_feed_items_use_case.dart';
import '../../application/use_cases/load_feed_item_use_case.dart';
import '../../domain/entities/feed_item.dart';
import '../../domain/value_objects/feed_item_filter.dart';
import '../../domain/value_objects/feed_item_id.dart';

final class FeedItemsStore extends ChangeNotifier {
  FeedItemsStore({
    required ListFeedItemsUseCase listFeedItems,
    required LoadFeedItemUseCase loadFeedItem,
    required WorkspaceScope scope,
    String? initialTopicId,
    OperationGenerationGuard? listGuard,
    OperationGenerationGuard? detailGuard,
  }) : _listFeedItems = listFeedItems,
       _loadFeedItem = loadFeedItem,
       _scope = scope,
       _filter = FeedItemFilter(topicId: initialTopicId).normalized(),
       _listGuard = listGuard ?? OperationGenerationGuard(),
       _detailGuard = detailGuard ?? OperationGenerationGuard();

  final ListFeedItemsUseCase _listFeedItems;
  final LoadFeedItemUseCase _loadFeedItem;
  final OperationGenerationGuard _listGuard;
  final OperationGenerationGuard _detailGuard;

  WorkspaceScope _scope;
  FeedItemFilter _filter;
  FeedItemId? _selectedItemId;
  String? _nextCursor;

  AsyncViewState<PageResult<FeedItem>> state =
      const InitialViewState<PageResult<FeedItem>>();
  AsyncViewState<FeedItem> detailState = const InitialViewState<FeedItem>();

  WorkspaceScope get scope => _scope;

  FeedItemFilter get filter => _filter;

  String? get nextCursor => _nextCursor;

  bool get hasExplicitSelection => _selectedItemId != null;

  FeedItem? get selectedListItem {
    final current = state;
    if (current is! ReadyViewState<PageResult<FeedItem>>) {
      return null;
    }
    for (final item in current.value.items) {
      if (item.id == _selectedItemId) {
        return item;
      }
    }
    return current.value.items.firstOrNull;
  }

  FeedItem? get selectedDetailItem {
    final detail = detailState;
    if (detail is ReadyViewState<FeedItem>) {
      return detail.value;
    }
    return selectedListItem;
  }

  void updateScope(WorkspaceScope nextScope) {
    if (nextScope == _scope) {
      return;
    }
    _scope = nextScope;
    _listGuard.invalidate();
    _detailGuard.invalidate();
    _nextCursor = null;
    _selectedItemId = null;
    state = const InitialViewState<PageResult<FeedItem>>();
    detailState = const InitialViewState<FeedItem>();
    notifyListeners();
  }

  Future<void> updateSearch(String value) async {
    _filter = _filter.copyWith(search: value);
    await refresh();
  }

  Future<void> clearTopicFilter() async {
    _filter = _filter.copyWith(clearTopicId: true);
    await refresh();
  }

  Future<void> updateProviderFilter(String? providerKey) async {
    _filter = providerKey == null
        ? _filter.copyWith(clearProviderKey: true)
        : _filter.copyWith(providerKey: providerKey);
    await refresh();
  }

  Future<void> updateRepositoryTrendWindowFilter(String? trendWindow) async {
    _filter = trendWindow == null
        ? _filter.copyWith(clearRepositoryTrendWindow: true)
        : _filter.copyWith(repositoryTrendWindow: trendWindow);
    await refresh();
  }

  Future<void> updateRepositoryLanguageFilter(String? language) async {
    _filter = language == null
        ? _filter.copyWith(clearRepositoryLanguage: true)
        : _filter.copyWith(repositoryLanguage: language);
    await refresh();
  }

  Future<void> updateRepositoryTopicFilter(String? topic) async {
    _filter = topic == null
        ? _filter.copyWith(clearRepositoryTopic: true)
        : _filter.copyWith(repositoryTopic: topic);
    await refresh();
  }

  Future<void> clearFilters() async {
    _filter = const FeedItemFilter();
    await refresh();
  }

  Future<void> refresh() async {
    _nextCursor = null;
    await _loadPage(append: false);
  }

  Future<void> loadMore() async {
    if (_nextCursor == null) {
      return;
    }
    await _loadPage(append: true);
  }

  Future<void> selectItem(FeedItemId itemId) async {
    _selectedItemId = itemId;
    notifyListeners();
    await _loadDetail(itemId);
  }

  void clearSelection() {
    if (_selectedItemId == null) {
      return;
    }
    _selectedItemId = null;
    detailState = const InitialViewState<FeedItem>();
    notifyListeners();
  }

  Future<void> _loadPage({required bool append}) async {
    final generation = _listGuard.markOperationStarted();
    final previous = switch (state) {
      ReadyViewState<PageResult<FeedItem>>(:final value) => value,
      LoadingViewState<PageResult<FeedItem>>(:final previousValue) =>
        previousValue,
      _ => null,
    };
    state = LoadingViewState<PageResult<FeedItem>>(previousValue: previous);
    notifyListeners();

    final result = await _listFeedItems(
      ListFeedItemsQuery(
        scope: _scope,
        page: PageRequest(cursor: append ? _nextCursor : null, limit: 20),
        filter: _filter,
      ),
    );
    if (!_listGuard.isCurrent(generation)) {
      return;
    }

    state = result.fold(
      onSuccess: (page) {
        _nextCursor = page.nextCursor;
        final items = append
            ? _appendDedup(previous?.items ?? const <FeedItem>[], page.items)
            : _dedup(page.items);
        if (items.isEmpty) {
          _selectedItemId = null;
          detailState = const InitialViewState<FeedItem>();
          return const EmptyViewState<PageResult<FeedItem>>(
            reason: 'feed.empty',
          );
        }
        _clearSelectionIfMissing(items);
        return ReadyViewState<PageResult<FeedItem>>(
          PageResult<FeedItem>(
            items: items,
            request: page.request,
            nextCursor: page.nextCursor,
            isPartial: page.isPartial,
          ),
        );
      },
      onFailure: (failure) =>
          FailureViewState<PageResult<FeedItem>>(failure: failure),
    );
    notifyListeners();

    final selectedId = _selectedItemId;
    if (!append && selectedId != null) {
      await _loadDetail(selectedId);
    }
  }

  Future<void> _loadDetail(FeedItemId itemId) async {
    final generation = _detailGuard.markOperationStarted();
    final previous = switch (detailState) {
      ReadyViewState<FeedItem>(:final value) => value,
      _ => null,
    };
    detailState = LoadingViewState<FeedItem>(previousValue: previous);
    notifyListeners();

    final result = await _loadFeedItem(
      LoadFeedItemQuery(scope: _scope, feedItemId: itemId),
    );
    if (!_detailGuard.isCurrent(generation) || _selectedItemId != itemId) {
      return;
    }
    detailState = result.fold(
      onSuccess: ReadyViewState<FeedItem>.new,
      onFailure: (failure) => FailureViewState<FeedItem>(failure: failure),
    );
    notifyListeners();
  }

  List<FeedItem> _appendDedup(List<FeedItem> previous, List<FeedItem> next) {
    final byId = <FeedItemId, FeedItem>{
      for (final item in previous) item.id: item,
    };
    for (final item in next) {
      byId[item.id] = item;
    }
    return byId.values.toList(growable: false);
  }

  List<FeedItem> _dedup(List<FeedItem> items) {
    return _appendDedup(const <FeedItem>[], items);
  }

  void _clearSelectionIfMissing(List<FeedItem> items) {
    final selectedId = _selectedItemId;
    if (selectedId == null) {
      return;
    }
    final exists = items.any((item) => item.id == selectedId);
    if (!exists) {
      _selectedItemId = null;
      detailState = const InitialViewState<FeedItem>();
    }
  }
}
