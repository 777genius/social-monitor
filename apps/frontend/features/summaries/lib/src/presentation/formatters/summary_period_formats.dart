import '../../domain/value_objects/summary_period.dart';

const _weekdayNames = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

const _monthShortNames = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const _monthLongNames = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/// The calendar day a period represents (its last covered day, UTC).
DateTime summaryPeriodFocusDay(SummaryPeriod period) {
  final utc = period.endedAt.toUtc().subtract(const Duration(days: 1));
  return DateTime.utc(utc.year, utc.month, utc.day);
}

String summaryPeriodWeekdayLabel(SummaryPeriod period) {
  return _weekdayNames[summaryPeriodFocusDay(period).weekday - 1];
}

String summaryPeriodDayNumberLabel(SummaryPeriod period) {
  return '${summaryPeriodFocusDay(period).day}';
}

String summaryPeriodMonthYearLabel(SummaryPeriod period) {
  final day = summaryPeriodFocusDay(period);
  return '${_monthShortNames[day.month - 1].toUpperCase()} ${day.year}';
}

/// Toolbar label, e.g. `Sat, Jun 21, 2026` or `Jun 15 - Jun 21, 2026`.
String summaryPeriodToolbarLabel(SummaryPeriod period) {
  final day = summaryPeriodFocusDay(period);
  switch (period.cadence) {
    case SummaryPeriodCadence.daily:
      final weekday = _weekdayNames[day.weekday - 1].substring(0, 3);
      return '$weekday, ${_monthShortNames[day.month - 1]} ${day.day}, '
          '${day.year}';
    case SummaryPeriodCadence.monthly:
      return '${_monthLongNames[day.month - 1]} ${day.year}';
    case SummaryPeriodCadence.weekly:
    case SummaryPeriodCadence.custom:
    case SummaryPeriodCadence.unknown:
      final start = period.startedAt.toUtc();
      return '${_monthShortNames[start.month - 1]} ${start.day} - '
          '${_monthShortNames[day.month - 1]} ${day.day}, ${day.year}';
  }
}

/// Day label for collected posts, e.g. `Jun 21, 2026`.
String summaryPeriodDayLabel(SummaryPeriod period) {
  final day = summaryPeriodFocusDay(period);
  return '${_monthShortNames[day.month - 1]} ${day.day}, ${day.year}';
}

/// Collection window label, e.g. `Jun 21, 2026 00:00 - Jun 22, 2026 00:00`.
String summaryPeriodCollectionWindowLabel(SummaryPeriod period) {
  return '${_utcStampLabel(period.startedAt)} - '
      '${_utcStampLabel(period.endedAt)}';
}

String _utcStampLabel(DateTime value) {
  final utc = value.toUtc();
  final hour = utc.hour.toString().padLeft(2, '0');
  final minute = utc.minute.toString().padLeft(2, '0');
  return '${_monthShortNames[utc.month - 1]} ${utc.day}, ${utc.year} '
      '$hour:$minute';
}
