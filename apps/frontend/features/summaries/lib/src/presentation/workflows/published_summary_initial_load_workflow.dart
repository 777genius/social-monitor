part of '../stores/published_summary_store.dart';

extension PublishedSummaryInitialLoadWorkflow on PublishedSummaryStore {
  Future<void> _loadInitialSummaryAndHistory(int generation) async {
    final query = LoadWorkspaceSummaryQuery(
      scope: _scope,
      period: SummaryPeriodPreset.daily.resolve(),
    );
    final latestFuture = _loadLatest(query);
    final historyFuture = _loadHistory(query);

    // The public summaries route can browse raw posts for a day without an
    // article. A historical AI publication must not hijack its initial date.
    if (canBrowseUnpublishedDaily) {
      await _loadInitialCollectedDailyPeriod(
        generation,
        latestFuture,
        historyFuture,
      );
      return;
    }

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
  Future<void> _loadInitialCollectedDailyPeriod(
    int generation,
    Future<Result<WorkspaceSummarySnapshot>> latestFuture,
    Future<Result<WorkspaceSummarySnapshot>> historyFuture,
  ) async {
    final latestResult = await latestFuture;
    if (!_generationGuard.isCurrent(generation)) return;
    final latest = latestResult.fold<WorkspaceSummarySnapshot?>(
      onSuccess: (snapshot) => snapshot,
      onFailure: (_) => null,
    );
    final published = latest?.current;

    if (published != null &&
        sameSummaryPeriodWindow(published.period, selectedPeriod)) {
      _publishInitialResult(latestResult);
    } else {
      if (latest != null) {
        availablePeriods = mergeSummaryPeriods(
          availablePeriods,
          [
            ...latest.availablePeriods,
            if (published != null) published.period,
          ],
        );
        availableSummaryReferences = mergePublishedSummaryReferences(
          availableSummaryReferences,
          [
            ...latest.availableSummaryReferences,
            if (published != null)
              PublishedSummaryReference(
                summaryId: published.id,
                period: published.period,
              ),
          ],
        );
      }
      // Show this day's source posts immediately, without waiting for the
      // history request or rendering a different day's AI article.
      state = latestResult.fold<AsyncViewState<ReaderSummary>>(
        onSuccess: (_) => const EmptyViewState<ReaderSummary>(
          reason: 'No published daily summary exists for this day.',
        ),
        onFailure: (failure) =>
            FailureViewState<ReaderSummary>(failure: failure),
      );
      _notifyChanged();
    }

    final historyResult = await historyFuture;
    if (!_generationGuard.isCurrent(generation)) return;
    final history = historyResult.fold<WorkspaceSummarySnapshot?>(
      onSuccess: (snapshot) => snapshot,
      onFailure: (_) => null,
    );
    if (history != null) {
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

    // History can uncover a newly published article or a newer version for
    // the current day. Never replace it with an article from a different day.
    final visible = switch (state) {
      ReadyViewState<ReaderSummary>(:final value) => value,
      _ => null,
    };
    final reference = _referenceForPeriod(selectedPeriod);
    if (reference != null && reference.summaryId != visible?.id) {
      final result = await _loadPublished(
        LoadPublishedSummaryQuery(
          scope: _scope,
          summaryId: reference.summaryId,
        ),
      );
      if (!_generationGuard.isCurrent(generation)) return;
      final candidate = result.fold<ReaderSummary?>(
        onSuccess: (snapshot) => snapshot.current,
        onFailure: (_) => null,
      );
      if (candidate != null &&
          sameSummaryPeriodWindow(candidate.period, selectedPeriod)) {
        _publishInitialResult(result, history: history);
      } else if (state is! ReadyViewState<ReaderSummary>) {
        // A referenced publication failed to load. Keep source browsing
        // available, but do not mislabel an API failure as an unpublished day.
        result.fold<void>(
          onSuccess: (_) {},
          onFailure: (failure) {
            state = FailureViewState<ReaderSummary>(failure: failure);
            _notifyChanged();
          },
        );
      }
    }
    _prefetchAdjacentSummaries();
  }
}
