part of 'summaries_review_store.dart';

String _summaryPeriodAvailabilityKey(SummaryPeriod period) {
  return [
    period.cadence.name,
    period.startedAt.toUtc().toIso8601String(),
    period.endedAt.toUtc().toIso8601String(),
    period.timezone,
  ].join('|');
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
  return left.cadence == right.cadence &&
      left.startedAt.toUtc() == right.startedAt.toUtc() &&
      left.endedAt.toUtc() == right.endedAt.toUtc() &&
      left.timezone == right.timezone;
}

bool _periodMatchesPreset(SummaryPeriod period, SummaryPeriodPreset preset) {
  return switch (preset) {
    SummaryPeriodPreset.daily =>
      period.cadence == SummaryPeriodCadence.daily &&
          _periodDurationDays(period) == 1,
    SummaryPeriodPreset.weekly =>
      period.cadence == SummaryPeriodCadence.weekly &&
          _periodDurationDays(period) == 7,
    SummaryPeriodPreset.twoWeeks =>
      period.cadence == SummaryPeriodCadence.custom &&
          _periodDurationDays(period) == 14,
    SummaryPeriodPreset.threeWeeks =>
      period.cadence == SummaryPeriodCadence.custom &&
          _periodDurationDays(period) == 21,
    SummaryPeriodPreset.monthly =>
      period.cadence == SummaryPeriodCadence.monthly,
  };
}

int _periodDurationDays(SummaryPeriod period) {
  return period.endedAt.toUtc().difference(period.startedAt.toUtc()).inDays;
}
