part of '../stores/published_summary_store.dart';

const _publishedSummaryCacheLimit = 7;

extension PublishedSummaryNavigationWorkflow on PublishedSummaryStore {
  Future<void> selectPeriodPreset(SummaryPeriodPreset preset) async {
    if (preset == selectedPeriodPreset) {
      return;
    }
    final previousPreset = selectedPeriodPreset;
    final previousPeriodEndedAt = _selectedPeriodEndedAt;
    selectedPeriodPreset = preset;
    _selectedPeriodEndedAt = null;
    _notifyChanged();
    await _refreshAvailablePeriods();
    final periods = availablePeriodsForPreset;
    if (periods.isEmpty) {
      selectedPeriodPreset = previousPreset;
      _selectedPeriodEndedAt = previousPeriodEndedAt;
      _notifyChanged();
      return;
    }
    _selectedPeriodEndedAt = periods.last.endedAt;
    await _loadSelectedPeriod();
  }

  Future<void> showPreviousPeriod() => _showAdjacentPeriod(-1);

  Future<void> showNextPeriod() => _showAdjacentPeriod(1);

  Future<void> showCurrentPeriod() async {
    final periods = availablePeriodsForPreset;
    if (periods.isEmpty) {
      return;
    }
    _selectedPeriodEndedAt = periods.last.endedAt;
    await _loadSelectedPeriod();
  }

  Future<void> selectCalendarDate(DateTime date) async {
    final requested = selectedPeriodPreset.resolveForCalendarDate(date);
    final available = availablePeriodsForPreset.where(
      (period) => sameSummaryPeriodWindow(period, requested),
    );
    if (available.isEmpty) {
      return;
    }
    _selectedPeriodEndedAt = available.first.endedAt;
    await _loadSelectedPeriod();
  }

  Future<void> _showAdjacentPeriod(int offset) async {
    final adjacent = _adjacentAvailablePeriod(offset);
    if (adjacent == null) {
      return;
    }
    _selectedPeriodEndedAt = adjacent.endedAt;
    await _loadSelectedPeriod();
  }

  Future<void> _loadSelectedPeriod() async {
    final generation = _generationGuard.markOperationStarted();
    final previous = switch (state) {
      ReadyViewState<ReaderSummary>(:final value) => value,
      LoadingViewState<ReaderSummary>(:final previousValue) => previousValue,
      _ => null,
    };
    final reference = _referenceForPeriod(selectedPeriod);
    var cached = _cachedSummary(reference);
    if (cached != null) {
      _publishSelectedSummary(cached, previous: previous);
      return;
    }

    state = LoadingViewState<ReaderSummary>(previousValue: previous);
    _notifyChanged();
    final prefetch = reference == null
        ? null
        : _summaryPrefetches[reference.summaryId];
    if (prefetch != null) {
      await prefetch;
      if (!_generationGuard.isCurrent(generation)) {
        return;
      }
      cached = _cachedSummary(reference);
      if (cached != null) {
        _publishSelectedSummary(cached, previous: previous);
        return;
      }
    }

    final result = reference == null
        ? await _loadLatest(
            LoadWorkspaceSummaryQuery(
              scope: _scope,
              period: selectedPeriod,
              allowLatestFallback: false,
            ),
          )
        : await _loadPublished(
            LoadPublishedSummaryQuery(
              scope: _scope,
              summaryId: reference.summaryId,
            ),
          );
    if (!_generationGuard.isCurrent(generation)) {
      return;
    }
    ReaderSummary? selectedSummary;
    state = result.fold(
      onSuccess: (snapshot) {
        final summary = snapshot.current;
        if (summary == null) {
          return _fallbackState(previous);
        }
        selectedSummary = summary;
        _rememberSummary(summary);
        _selectPeriod(summary.period);
        availablePeriods = mergeSummaryPeriods(availablePeriods, [
          summary.period,
        ]);
        availableSummaryReferences = mergePublishedSummaryReferences(
          availableSummaryReferences,
          snapshot.availableSummaryReferences,
        );
        return ReadyViewState<ReaderSummary>(
          summary,
          isDegraded: summary.isDegraded,
        );
      },
      onFailure: (failure) => previous == null
          ? FailureViewState<ReaderSummary>(failure: failure)
          : _fallbackState(previous),
    );
    _notifyChanged();
    final selected = selectedSummary;
    if (selected != null && selected.id != previous?.id) {
      _onSummarySelected?.call(selected.id);
    }
    _prefetchAdjacentSummaries();
  }

  AsyncViewState<ReaderSummary> _fallbackState(ReaderSummary? previous) {
    if (previous == null) {
      return const EmptyViewState<ReaderSummary>(
        reason: 'No published summary exists for this period.',
      );
    }
    _selectPeriod(previous.period);
    return ReadyViewState<ReaderSummary>(
      previous,
      isDegraded: previous.isDegraded,
    );
  }

  void _publishSelectedSummary(
    ReaderSummary summary, {
    required ReaderSummary? previous,
  }) {
    _selectPeriod(summary.period);
    state = ReadyViewState<ReaderSummary>(
      summary,
      isDegraded: summary.isDegraded,
    );
    _notifyChanged();
    if (summary.id != previous?.id) {
      _onSummarySelected?.call(summary.id);
    }
    _prefetchAdjacentSummaries();
  }

  Future<void> _refreshAvailablePeriods() async {
    final generation = _historyGenerationGuard.markOperationStarted();
    final result = await _loadHistory(
      LoadWorkspaceSummaryQuery(scope: _scope, period: selectedPeriod),
    );
    if (!_historyGenerationGuard.isCurrent(generation)) {
      return;
    }
    result.fold(
      onSuccess: (snapshot) {
        availablePeriods = mergeSummaryPeriods(
          availablePeriods,
          snapshot.availablePeriods,
        );
        availableSummaryReferences = mergePublishedSummaryReferences(
          availableSummaryReferences,
          snapshot.availableSummaryReferences,
        );
        _notifyChanged();
        _prefetchAdjacentSummaries();
      },
      onFailure: (_) {},
    );
  }

  void _rememberSummary(ReaderSummary summary) {
    _summaryCache.remove(summary.id);
    _summaryCache[summary.id] = summary;
    while (_summaryCache.length > _publishedSummaryCacheLimit) {
      _summaryCache.remove(_summaryCache.keys.first);
    }
  }

  ReaderSummary? _cachedSummary(PublishedSummaryReference? reference) {
    if (reference == null) {
      return null;
    }
    final cached = _summaryCache.remove(reference.summaryId);
    if (cached != null) {
      _summaryCache[reference.summaryId] = cached;
    }
    return cached;
  }

  void _prefetchAdjacentSummaries() {
    for (final offset in const [-1, 1]) {
      final period = _adjacentAvailablePeriod(offset);
      final reference = period == null ? null : _referenceForPeriod(period);
      if (reference != null) {
        unawaited(_prefetchSummary(reference));
      }
    }
  }

  Future<void> _prefetchSummary(PublishedSummaryReference reference) async {
    if (_summaryCache.containsKey(reference.summaryId) ||
        _summaryPrefetches.containsKey(reference.summaryId)) {
      return;
    }
    final generation = _prefetchGenerationGuard.generation;
    late final Future<void> operation;
    operation = () async {
      final result = await _loadPublished(
        LoadPublishedSummaryQuery(
          scope: _scope,
          summaryId: reference.summaryId,
        ),
      );
      if (!_prefetchGenerationGuard.isCurrent(generation)) {
        return;
      }
      result.fold(
        onSuccess: (snapshot) {
          final summary = snapshot.current;
          if (summary != null && summary.id == reference.summaryId) {
            _rememberSummary(summary);
          }
        },
        onFailure: (_) {},
      );
    }();
    _summaryPrefetches[reference.summaryId] = operation;
    try {
      await operation;
    } finally {
      if (identical(_summaryPrefetches[reference.summaryId], operation)) {
        unawaited(_summaryPrefetches.remove(reference.summaryId));
      }
    }
  }
}
