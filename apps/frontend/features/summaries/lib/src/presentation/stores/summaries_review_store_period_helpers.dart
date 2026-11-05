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
