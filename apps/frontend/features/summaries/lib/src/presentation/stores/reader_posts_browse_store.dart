import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/queries/list_reader_posts_query.dart';
import '../../application/use_cases/list_reader_posts_use_case.dart';
import '../../domain/aggregates/reader_summary.dart';
import '../../domain/value_objects/reader_posts_page.dart';
import '../../domain/value_objects/top_posts_sort_order.dart';

/// One browse workflow. A scope, period, filter or order change invalidates pages.
final class ReaderPostsBrowseStore extends ChangeNotifier {
  ReaderPostsBrowseStore({
    required ListReaderPostsUseCase list,
    required WorkspaceScope scope,
  }) : _list = list,
       _scope = scope;

  final ListReaderPostsUseCase _list;
  final WorkspaceScope _scope;
  final OperationGenerationGuard _generation = OperationGenerationGuard();
  SummaryPeriod? _period;
  String? _summaryId;
  TopPostsSortOrder _order = TopPostsSortOrder.engagement;
  final Set<String> _hiddenProviders = {};
  AsyncViewState<ReaderPostsPage> _state = const InitialViewState();
  bool _selectedOnly = false;
  bool _isDisposed = false;
  ReaderPostsPage? _firstPage;
  int _visibleTarget = 12;

  bool get selectedOnly => _selectedOnly;
  Set<String> get hiddenProviders => Set.unmodifiable(_hiddenProviders);
  AsyncViewState<ReaderPostsPage> get state => _state;

  void bind(ReaderSummary summary, TopPostsSortOrder order) {
    _bind(summaryId: summary.id, period: summary.period, order: order);
  }

  /// Browse a day even when no editorial summary was published.
  /// This is always source-only and ordered by native engagement.
  void bindUnpublishedDay(SummaryPeriod period) {
    _bind(summaryId: null, period: period, order: TopPostsSortOrder.engagement);
  }

  void _bind({
    required String? summaryId,
    required SummaryPeriod period,
    required TopPostsSortOrder order,
  }) {
    if (_summaryId == summaryId && _period == period && _order == order) {
      return;
    }
    if (_summaryId != summaryId || _period != period) {
      _visibleTarget = 12;
      _firstPage = null;
    }
    _generation.invalidate();
    _summaryId = summaryId;
    _period = period;
    _order = order;
    if (summaryId == null) _selectedOnly = false;
    _state = const InitialViewState();
    if (!_selectedOnly) unawaited(Future<void>.microtask(reload));
  }

  void selectOnly(bool value) {
    if (_selectedOnly == value) return;
    _selectedOnly = value;
    _visibleTarget = 12;
    _firstPage = null;
    _generation.invalidate();
    _state = const InitialViewState();
    if (value) {
      notifyListeners();
    } else {
      unawaited(reload());
    }
  }

  void toggleProvider(String key) {
    if (!_hiddenProviders.remove(key)) _hiddenProviders.add(key);
    unawaited(reload());
  }

  Future<void> reload() => _load();

  void showLess() {
    final first = _firstPage;
    if (first == null) return;
    _generation.invalidate();
    _visibleTarget = 12;
    _state = ReadyViewState(first);
    notifyListeners();
  }

  Future<void> showMore() async {
    final current = _state;
    if (current is! ReadyViewState<ReaderPostsPage> ||
        current.value.nextCursor == null) {
      return;
    }
    _visibleTarget = current.value.items.length + 12;
    await _load(previous: current.value);
  }

  Future<void> _load({ReaderPostsPage? previous}) async {
    final period = _period;
    if (_isDisposed || period == null || _selectedOnly) return;
    final generation = _generation.markOperationStarted();
    _state = LoadingViewState(previousValue: previous);
    notifyListeners();
    ReaderPostsPage? accumulated = previous;
    while (true) {
      final result = await _list.execute(
        ListReaderPostsQuery(
          scope: _scope,
          period: period,
          order: _order,
          excludedProviders: Set.of(_hiddenProviders),
          cursor: accumulated?.nextCursor,
        ),
      );
      if (!_generation.isCurrent(generation)) return;
      final page = result.fold<ReaderPostsPage?>(
        onSuccess: (page) => page,
        onFailure: (failure) {
          _state = FailureViewState(failure: failure);
          return null;
        },
      );
      if (page == null) {
        notifyListeners();
        return;
      }
      if (accumulated == null) _firstPage = page;
      final previousCount = accumulated?.items.length ?? 0;
      final byIdentity = {
        for (final item in [...?accumulated?.items, ...page.items])
          item.storyClusterId: item,
      };
      accumulated = ReaderPostsPage(
        items: List.unmodifiable(byIdentity.values),
        total: page.total,
        providerKeys: page.providerKeys,
        nextCursor: page.nextCursor,
      );
      // Refill a previously revealed window after sort/filter changes. A
      // stale generation never advances, and duplicate pages cannot loop.
      if (_visibleTarget <= 12 ||
          accumulated.items.length >= _visibleTarget ||
          accumulated.nextCursor == null ||
          accumulated.items.length == previousCount) {
        _state = ReadyViewState(accumulated);
        notifyListeners();
        return;
      }
    }
  }

  @override
  void dispose() {
    _isDisposed = true;
    _generation.invalidate();
    super.dispose();
  }
}
