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

bool _sameSummaryPeriodWindow(SummaryPeriod left, SummaryPeriod right) {
  return sameSummaryPeriodWindow(left, right);
}

bool _periodMatchesPreset(SummaryPeriod period, SummaryPeriodPreset preset) {
  return summaryPeriodMatchesPreset(period, preset);
}
