import '../../domain/aggregates/reader_summary.dart';

String summaryPeriodAvailabilityKey(SummaryPeriod period) {
  return [
    period.cadence.name,
    period.startedAt.toUtc().toIso8601String(),
    period.endedAt.toUtc().toIso8601String(),
    period.timezone,
  ].join('|');
}

bool sameSummaryPeriodWindow(SummaryPeriod left, SummaryPeriod right) {
  return left.cadence == right.cadence &&
      left.startedAt.toUtc() == right.startedAt.toUtc() &&
      left.endedAt.toUtc() == right.endedAt.toUtc() &&
      left.timezone == right.timezone;
}

bool summaryPeriodMatchesPreset(
  SummaryPeriod period,
  SummaryPeriodPreset preset,
) {
  final days = period.endedAt
      .toUtc()
      .difference(period.startedAt.toUtc())
      .inDays;
  return switch (preset) {
    SummaryPeriodPreset.daily =>
      period.cadence == SummaryPeriodCadence.daily && days == 1,
    SummaryPeriodPreset.weekly =>
      period.cadence == SummaryPeriodCadence.weekly && days == 7,
    SummaryPeriodPreset.twoWeeks =>
      period.cadence == SummaryPeriodCadence.custom && days == 14,
    SummaryPeriodPreset.threeWeeks =>
      period.cadence == SummaryPeriodCadence.custom && days == 21,
    SummaryPeriodPreset.monthly =>
      period.cadence == SummaryPeriodCadence.monthly,
  };
}

SummaryPeriodPreset summaryPeriodPresetFor(SummaryPeriod period) {
  final days = period.endedAt
      .toUtc()
      .difference(period.startedAt.toUtc())
      .inDays;
  return switch (period.cadence) {
    SummaryPeriodCadence.daily => SummaryPeriodPreset.daily,
    SummaryPeriodCadence.weekly => SummaryPeriodPreset.weekly,
    SummaryPeriodCadence.monthly => SummaryPeriodPreset.monthly,
    SummaryPeriodCadence.custom when days == 14 => SummaryPeriodPreset.twoWeeks,
    SummaryPeriodCadence.custom when days == 21 =>
      SummaryPeriodPreset.threeWeeks,
    _ => SummaryPeriodPreset.daily,
  };
}

List<SummaryPeriod> mergeSummaryPeriods(
  Iterable<SummaryPeriod> current,
  Iterable<SummaryPeriod> incoming,
) {
  final periodsByKey = <String, SummaryPeriod>{};
  for (final period in [...current, ...incoming]) {
    periodsByKey[summaryPeriodAvailabilityKey(period)] = period;
  }
  return periodsByKey.values.toList(growable: false);
}

List<PublishedSummaryReference> mergePublishedSummaryReferences(
  Iterable<PublishedSummaryReference> current,
  Iterable<PublishedSummaryReference> incoming,
) {
  final referencesByKey = <String, PublishedSummaryReference>{};
  for (final reference in [...current, ...incoming]) {
    referencesByKey[summaryPeriodAvailabilityKey(reference.period)] = reference;
  }
  return referencesByKey.values.toList(growable: false);
}
