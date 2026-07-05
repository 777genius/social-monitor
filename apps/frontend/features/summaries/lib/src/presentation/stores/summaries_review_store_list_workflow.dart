part of 'summaries_review_store.dart';

extension SummariesReviewStoreListWorkflow on SummariesReviewStore {
  Future<void> _loadPrimaryReaderSummary() async {
    unawaited(loadTopicRecommendations());

    await loadWorkspaceSummary();
    if (!_shouldLoadGeneratedSummaryHistoryFallback()) {
      return;
    }

    await loadGeneratedSummaryHistoryFallback();
  }

  Future<void> loadGeneratedSummaryHistoryFallback() async {
    final loadKey = _generatedSummaryHistoryLoadKey(_scope);
    final activeLoad = _activeGeneratedSummaryHistoryLoad;
    if (activeLoad != null &&
        _activeGeneratedSummaryHistoryLoadKey == loadKey) {
      await activeLoad;
      return;
    }

    final generation = _listGenerationGuard.markOperationStarted();
    final load = _loadGeneratedSummaryHistoryForStore(generation);
    _activeGeneratedSummaryHistoryLoad = load;
    _activeGeneratedSummaryHistoryLoadKey = loadKey;
    try {
      await load;
    } finally {
      if (_activeGeneratedSummaryHistoryLoadKey == loadKey) {
        _activeGeneratedSummaryHistoryLoad = null;
        _activeGeneratedSummaryHistoryLoadKey = null;
      }
    }
  }

  bool _shouldLoadGeneratedSummaryHistoryFallback() {
    return switch (workspaceSummaryState) {
      ReadyViewState<WorkspaceSummarySnapshot>(:final value) =>
        value.current == null,
      FailureViewState<WorkspaceSummarySnapshot>() => true,
      _ => false,
    };
  }

  Future<void> _loadGeneratedSummaryHistoryForStore(int generation) async {
    final previous = switch (listState) {
      ReadyViewState<PageResult<GeneratedSummary>>(:final value) => value,
      LoadingViewState<PageResult<GeneratedSummary>>(:final previousValue) =>
        previousValue,
      _ => null,
    };
    listState = LoadingViewState<PageResult<GeneratedSummary>>(
      previousValue: previous,
    );
    _notifyStateChanged();

    final result = await _dependencies.listSummaries(
      ListSummariesQuery(scope: _scope),
    );
    if (!_listGenerationGuard.isCurrent(generation)) {
      return;
    }

    listState = result.fold(
      onSuccess: (page) {
        if (page.items.isEmpty) {
          _selectedSummaryId = null;
          detailState = const InitialViewState<GeneratedSummary>();
          return const EmptyViewState<PageResult<GeneratedSummary>>(
            reason: 'summaries.empty',
          );
        }
        _clearSelectionIfMissing(page.items);
        return ReadyViewState<PageResult<GeneratedSummary>>(
          PageResult<GeneratedSummary>(
            items: page.items,
            request: page.request,
            nextCursor: page.nextCursor,
            isPartial: page.isPartial,
          ),
        );
      },
      onFailure: (failure) =>
          FailureViewState<PageResult<GeneratedSummary>>(failure: failure),
    );
    _notifyStateChanged();
  }
}

String _generatedSummaryHistoryLoadKey(WorkspaceScope scope) {
  return [
    scope.tenantId,
    scope.workspaceId,
    'generated-summary-history',
  ].join('|');
}
