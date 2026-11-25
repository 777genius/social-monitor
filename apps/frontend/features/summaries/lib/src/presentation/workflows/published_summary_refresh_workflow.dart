part of '../stores/published_summary_store.dart';

extension PublishedSummaryRefreshWorkflow on PublishedSummaryStore {
  Future<void> refreshIfNewer() async {
    if (!isViewingLatestDailySummary ||
        state is LoadingViewState<ReaderSummary>) {
      return;
    }
    final current = switch (state) {
      ReadyViewState<ReaderSummary>(:final value) => value,
      _ => null,
    };
    if (current == null) {
      await load();
      return;
    }

    final generation = _historyGenerationGuard.markOperationStarted();
    final result = await _loadHistory(
      LoadWorkspaceSummaryQuery(
        scope: _scope,
        period: SummaryPeriodPreset.daily.resolve(),
      ),
    );
    if (!_historyGenerationGuard.isCurrent(generation)) {
      return;
    }
    final snapshot = result.fold(
      onSuccess: (value) => value,
      onFailure: (_) => null,
    );
    if (snapshot == null) {
      return;
    }

    final refreshedPeriods = mergeSummaryPeriods(
      availablePeriods,
      snapshot.availablePeriods,
    );
    final refreshedReferences = mergePublishedSummaryReferences(
      availableSummaryReferences,
      snapshot.availableSummaryReferences,
    );
    final latest = _latestReference(
      refreshedReferences,
      SummaryPeriodPreset.daily,
    );
    if (latest == null || latest.summaryId == current.id) {
      availablePeriods = refreshedPeriods;
      availableSummaryReferences = refreshedReferences;
      _notifyChanged();
      return;
    }

    availableSummaryReferences = mergePublishedSummaryReferences(
      availableSummaryReferences,
      [latest],
    );
    _selectedPeriodEndedAt = latest.period.endedAt;
    await _loadSelectedPeriod();
    final refreshed = switch (state) {
      ReadyViewState<ReaderSummary>(:final value) =>
        value.id == latest.summaryId,
      _ => false,
    };
    if (refreshed) {
      availablePeriods = refreshedPeriods;
      availableSummaryReferences = refreshedReferences;
      _notifyChanged();
    }
  }
}
