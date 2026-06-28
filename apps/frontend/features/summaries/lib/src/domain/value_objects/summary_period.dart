enum SummaryPeriodCadence { daily, weekly, monthly, custom, unknown }

enum SummaryPeriodPreset {
  daily,
  weekly,
  twoWeeks,
  threeWeeks,
  monthly;

  String get label {
    return switch (this) {
      SummaryPeriodPreset.daily => 'Daily',
      SummaryPeriodPreset.weekly => 'Week',
      SummaryPeriodPreset.twoWeeks => '2 weeks',
      SummaryPeriodPreset.threeWeeks => '3 weeks',
      SummaryPeriodPreset.monthly => 'Month',
    };
  }

  SummaryPeriod resolve({DateTime? now, DateTime? periodEndedAt}) {
    final endedAt = periodEndedAt == null
        ? currentPeriodEndedAt(now: now)
        : _utcDayStart(periodEndedAt);

    return switch (this) {
      SummaryPeriodPreset.daily => SummaryPeriod(
        cadence: SummaryPeriodCadence.daily,
        startedAt: endedAt.subtract(const Duration(days: 1)),
        endedAt: endedAt,
        timezone: 'UTC',
      ),
      SummaryPeriodPreset.weekly => SummaryPeriod(
        cadence: SummaryPeriodCadence.weekly,
        startedAt: endedAt.subtract(const Duration(days: 7)),
        endedAt: endedAt,
        timezone: 'UTC',
      ),
      SummaryPeriodPreset.twoWeeks => SummaryPeriod(
        cadence: SummaryPeriodCadence.custom,
        startedAt: endedAt.subtract(const Duration(days: 14)),
        endedAt: endedAt,
        timezone: 'UTC',
      ),
      SummaryPeriodPreset.threeWeeks => SummaryPeriod(
        cadence: SummaryPeriodCadence.custom,
        startedAt: endedAt.subtract(const Duration(days: 21)),
        endedAt: endedAt,
        timezone: 'UTC',
      ),
      SummaryPeriodPreset.monthly => SummaryPeriod(
        cadence: SummaryPeriodCadence.monthly,
        startedAt: _previousMonthStart(endedAt),
        endedAt: endedAt,
        timezone: 'UTC',
      ),
    };
  }

  SummaryPeriod resolveForCalendarDate(DateTime date, {DateTime? now}) {
    final selectedDay = _calendarDayStart(date);
    final latestDay = latestSelectableCalendarDate(now: now);
    final day = selectedDay.isAfter(latestDay) ? latestDay : selectedDay;

    return switch (this) {
      SummaryPeriodPreset.daily => resolve(
        periodEndedAt: day.add(const Duration(days: 1)),
      ),
      SummaryPeriodPreset.weekly => SummaryPeriod(
        cadence: SummaryPeriodCadence.weekly,
        startedAt: day.subtract(Duration(days: day.weekday - DateTime.monday)),
        endedAt: day
            .subtract(Duration(days: day.weekday - DateTime.monday))
            .add(const Duration(days: 7)),
        timezone: 'UTC',
      ),
      SummaryPeriodPreset.twoWeeks => resolve(
        periodEndedAt: day.add(const Duration(days: 1)),
      ),
      SummaryPeriodPreset.threeWeeks => resolve(
        periodEndedAt: day.add(const Duration(days: 1)),
      ),
      SummaryPeriodPreset.monthly => SummaryPeriod(
        cadence: SummaryPeriodCadence.monthly,
        startedAt: DateTime.utc(day.year, day.month),
        endedAt: day.month == DateTime.december
            ? DateTime.utc(day.year + 1, DateTime.january)
            : DateTime.utc(day.year, day.month + 1),
        timezone: 'UTC',
      ),
    };
  }

  DateTime currentPeriodEndedAt({DateTime? now}) {
    final todayStart = _utcDayStart(now ?? DateTime.now());
    return switch (this) {
      SummaryPeriodPreset.daily => todayStart.add(const Duration(days: 1)),
      SummaryPeriodPreset.twoWeeks ||
      SummaryPeriodPreset.threeWeeks => todayStart,
      SummaryPeriodPreset.weekly => todayStart.subtract(
        Duration(days: todayStart.weekday - DateTime.monday),
      ),
      SummaryPeriodPreset.monthly => DateTime.utc(
        todayStart.year,
        todayStart.month,
      ),
    };
  }

  DateTime latestSelectableCalendarDate({DateTime? now}) {
    return currentPeriodEndedAt(now: now).subtract(const Duration(days: 1));
  }

  DateTime previousPeriodEndedAt(DateTime currentEndedAt) {
    final endedAt = _utcDayStart(currentEndedAt);
    return switch (this) {
      SummaryPeriodPreset.daily => endedAt.subtract(const Duration(days: 1)),
      SummaryPeriodPreset.weekly => endedAt.subtract(const Duration(days: 7)),
      SummaryPeriodPreset.twoWeeks => endedAt.subtract(
        const Duration(days: 14),
      ),
      SummaryPeriodPreset.threeWeeks => endedAt.subtract(
        const Duration(days: 21),
      ),
      SummaryPeriodPreset.monthly => _previousMonthStart(endedAt),
    };
  }

  DateTime nextPeriodEndedAt(DateTime currentEndedAt, {DateTime? now}) {
    final endedAt = _utcDayStart(currentEndedAt);
    final latestEndedAt = currentPeriodEndedAt(now: now);
    final nextEndedAt = switch (this) {
      SummaryPeriodPreset.daily => endedAt.add(const Duration(days: 1)),
      SummaryPeriodPreset.weekly => endedAt.add(const Duration(days: 7)),
      SummaryPeriodPreset.twoWeeks => endedAt.add(const Duration(days: 14)),
      SummaryPeriodPreset.threeWeeks => endedAt.add(const Duration(days: 21)),
      SummaryPeriodPreset.monthly => DateTime.utc(
        endedAt.month == DateTime.december ? endedAt.year + 1 : endedAt.year,
        endedAt.month == DateTime.december
            ? DateTime.january
            : endedAt.month + 1,
      ),
    };
    return nextEndedAt.isAfter(latestEndedAt) ? latestEndedAt : nextEndedAt;
  }

  bool canNavigateNext(DateTime currentEndedAt, {DateTime? now}) {
    return _utcDayStart(
      currentEndedAt,
    ).isBefore(currentPeriodEndedAt(now: now));
  }
}

final class SummaryPeriod {
  const SummaryPeriod({
    required this.cadence,
    required this.startedAt,
    required this.endedAt,
    required this.timezone,
    this.periodKey,
  });

  final SummaryPeriodCadence cadence;
  final DateTime startedAt;
  final DateTime endedAt;
  final String timezone;
  final String? periodKey;

  bool get isValid {
    return cadence != SummaryPeriodCadence.unknown &&
        timezone.trim().isNotEmpty &&
        endedAt.isAfter(startedAt);
  }

  String get rangeLabel {
    return '${_dateLabel(startedAt)} - ${_dateLabel(endedAt)}';
  }

  String get utcRangeLabel {
    return '${_dateTimeUtcLabel(startedAt)} - ${_dateTimeUtcLabel(endedAt)} UTC';
  }

  DateTime get calendarFocusDate {
    return _utcDayStart(endedAt.subtract(const Duration(days: 1)));
  }

  @override
  bool operator ==(Object other) {
    return other is SummaryPeriod &&
        other.cadence == cadence &&
        other.startedAt == startedAt &&
        other.endedAt == endedAt &&
        other.timezone == timezone &&
        other.periodKey == periodKey;
  }

  @override
  int get hashCode {
    return Object.hash(cadence, startedAt, endedAt, timezone, periodKey);
  }
}

DateTime _utcDayStart(DateTime value) {
  final utc = value.toUtc();
  return DateTime.utc(utc.year, utc.month, utc.day);
}

DateTime _calendarDayStart(DateTime value) {
  return DateTime.utc(value.year, value.month, value.day);
}

DateTime _previousMonthStart(DateTime currentMonthStart) {
  return currentMonthStart.month == DateTime.january
      ? DateTime.utc(currentMonthStart.year - 1, DateTime.december)
      : DateTime.utc(currentMonthStart.year, currentMonthStart.month - 1);
}

String _dateLabel(DateTime value) {
  final utc = value.toUtc();
  final month = utc.month.toString().padLeft(2, '0');
  final day = utc.day.toString().padLeft(2, '0');
  return '${utc.year}-$month-$day';
}

String _dateTimeUtcLabel(DateTime value) {
  final utc = value.toUtc();
  final hour = utc.hour.toString().padLeft(2, '0');
  final minute = utc.minute.toString().padLeft(2, '0');
  return '${_dateLabel(utc)} $hour:$minute';
}
