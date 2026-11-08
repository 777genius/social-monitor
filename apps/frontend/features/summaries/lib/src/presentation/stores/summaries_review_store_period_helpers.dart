part of 'summaries_review_store.dart';

String _summaryPeriodAvailabilityKey(SummaryPeriod period) {
  return summaryPeriodAvailabilityKey(period);
}

List<SummaryPeriod> _snapshotSummaryPeriods(WorkspaceSummarySnapshot snapshot) {
  final periodsByKey = <String, SummaryPeriod>{};
  void add(SummaryPeriod period) {
    periodsByKey[_summaryPeriodAvailabilityKey(period)] = period;
  }

  for (final period in snapshot.availablePeriods) {
    add(period);
  }
  final current = snapshot.current;
  if (current != null) {
    add(current.period);
  }

  return periodsByKey.values.toList(growable: false);
}

List<SummaryPeriod> _mergeSummarySnapshotPeriods(
  WorkspaceSummarySnapshot? previous,
  WorkspaceSummarySnapshot next,
) {
  return mergeSummaryPeriods(
    previous == null ? const [] : _snapshotSummaryPeriods(previous),
    _snapshotSummaryPeriods(next),
  );
}

WorkspaceSummarySnapshot? _summarySnapshotForSelectedPreset(
  WorkspaceSummarySnapshot? snapshot,
  SummaryPeriodPreset preset,
) {
  final current = snapshot?.current;
  if (snapshot == null ||
      current == null ||
      summaryPeriodPresetFor(current.period) == preset) {
    return snapshot;
  }
  return WorkspaceSummarySnapshot(
    availablePeriods: _snapshotSummaryPeriods(snapshot),
    availablePeriodsAreComplete: snapshot.availablePeriodsAreComplete,
  );
}

bool _sameSummaryPeriodWindow(SummaryPeriod left, SummaryPeriod right) {
  return sameSummaryPeriodWindow(left, right);
}

bool _periodMatchesPreset(SummaryPeriod period, SummaryPeriodPreset preset) {
  return summaryPeriodMatchesPreset(period, preset);
}

/// Navigation policy shared by a published day and an original-posts fallback.
bool _isSelectedSummaryPeriodCurrent(SummariesReviewStore store) {
  if (store.allowUnpublishedDays &&
      store.selectedSummaryPeriodPreset == SummaryPeriodPreset.daily) {
    return store.selectedSummaryPeriod.endedAt ==
        SummaryPeriodPreset.daily.currentPeriodEndedAt();
  }
  if (store._selectedSummaryPeriodEndedAt == null) {
    return true;
  }
  final latestAvailable = store._latestAvailableSummaryPeriodForSelectedPreset;
  if (latestAvailable != null) {
    return _sameSummaryPeriodWindow(store.selectedSummaryPeriod, latestAvailable);
  }
  return store.selectedSummaryPeriod.endedAt ==
      store.selectedSummaryPeriodPreset.currentPeriodEndedAt();
}

bool _canShowPreviousSummaryPeriod(SummariesReviewStore store) {
  if (store.allowUnpublishedDays &&
      store.selectedSummaryPeriodPreset == SummaryPeriodPreset.daily) {
    return store.selectedSummaryPeriod.startedAt.isAfter(DateTime.utc(2020));
  }
  if (store.availableWorkspaceSummaryPeriods.isNotEmpty) {
    return store._previousAvailableSummaryPeriodForSelectedPreset != null;
  }
  return false;
}

bool _canShowNextSummaryPeriod(SummariesReviewStore store) {
  if (store.allowUnpublishedDays &&
      store.selectedSummaryPeriodPreset == SummaryPeriodPreset.daily) {
    return store.selectedSummaryPeriodPreset.canNavigateNext(
      store.selectedSummaryPeriod.endedAt,
    );
  }
  if (store.availableWorkspaceSummaryPeriods.isNotEmpty) {
    return store._nextAvailableSummaryPeriodForSelectedPreset != null;
  }
  return store.selectedSummaryPeriodPreset.canNavigateNext(
    store.selectedSummaryPeriod.endedAt,
  );
}

/// Keep a previously loaded article only when its exact day is selected.
/// Preserves history periods for the calendar while withholding stale content.
WorkspaceSummarySnapshot? _summarySnapshotForSelectedDailyWindow(
  WorkspaceSummarySnapshot? snapshot,
  SummaryPeriod selectedPeriod, {
  required bool enforceExactWindow,
}) {
  final current = snapshot?.current;
  if (!enforceExactWindow ||
      snapshot == null ||
      current == null ||
      _sameSummaryPeriodWindow(current.period, selectedPeriod)) {
    return snapshot;
  }
  return WorkspaceSummarySnapshot(
    availablePeriods: _snapshotSummaryPeriods(snapshot),
    availablePeriodsAreComplete: snapshot.availablePeriodsAreComplete,
  );
}
