part of '../stores/published_summary_store.dart';

extension PublishedSummaryInitialLoadWorkflow on PublishedSummaryStore {
  Future<void> _loadInitialSummaryAndHistory(int generation) async {
    final query = LoadWorkspaceSummaryQuery(
      scope: _scope,
      period: SummaryPeriodPreset.daily.resolve(),
    );
    final latestFuture = _loadLatest(query);
    final historyFuture = _loadHistory(query);

    final latestResult = await latestFuture;
    if (!_generationGuard.isCurrent(generation)) {
      return;
    }

    final latestSnapshot = latestResult.fold(
      onSuccess: (snapshot) => snapshot,
      onFailure: (_) => null,
    );
    var current = latestSnapshot?.current;
    if (current != null) {
      _publishInitialResult(latestResult);
    }

    final historyResult = await historyFuture;
    if (!_generationGuard.isCurrent(generation)) {
      return;
    }
    final history = historyResult.fold(
      onSuccess: (snapshot) => snapshot,
      onFailure: (_) => null,
    );

    final latestReference = _latestReference(
      history?.availableSummaryReferences ?? const [],
      SummaryPeriodPreset.daily,
    );
    if (current == null ||
        (latestReference != null && latestReference.summaryId != current.id)) {
      final fallbackResult = latestReference == null
          ? latestResult
          : await _loadPublished(
              LoadPublishedSummaryQuery(
                scope: _scope,
                summaryId: latestReference.summaryId,
              ),
            );
      if (!_generationGuard.isCurrent(generation)) {
        return;
      }
      current = _publishInitialResult(fallbackResult, history: history);
    } else if (history != null) {
      availablePeriods = mergeSummaryPeriods(
        availablePeriods,
        history.availablePeriods,
      );
      availableSummaryReferences = mergePublishedSummaryReferences(
        availableSummaryReferences,
        history.availableSummaryReferences,
      );
      _notifyChanged();
    }

    if (current != null && history?.availablePeriodsAreComplete != true) {
      await _refreshAvailablePeriods();
    }
    _prefetchAdjacentSummaries();
  }
}
