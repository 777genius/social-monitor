part of 'workspace_summary_period_toolbar.dart';

/// Calendar-only date labels, grid positions and day identity.
String _monthLabel(DateTime month) {
  const monthNames = [
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
  return '${monthNames[month.month - 1]} ${month.year}';
}

DateTime _previousMonth(DateTime month) {
  return month.month == DateTime.january
      ? DateTime(month.year - 1, DateTime.december)
      : DateTime(month.year, month.month - 1);
}

DateTime _nextMonth(DateTime month) {
  return month.month == DateTime.december
      ? DateTime(month.year + 1, DateTime.january)
      : DateTime(month.year, month.month + 1);
}

DateTime? _dateForCell(
  DateTime firstOfMonth,
  int cellIndex,
  int leadingEmptyCells,
) {
  final day = cellIndex - leadingEmptyCells + 1;
  final daysInMonth = DateTime(
    firstOfMonth.year,
    firstOfMonth.month + 1,
    0,
  ).day;
  if (day < 1 || day > daysInMonth) {
    return null;
  }
  return DateTime(firstOfMonth.year, firstOfMonth.month, day);
}

bool _sameDate(DateTime left, DateTime right) {
  return left.year == right.year &&
      left.month == right.month &&
      left.day == right.day;
}

String _dateKey(DateTime date) {
  final month = date.month.toString().padLeft(2, '0');
  final day = date.day.toString().padLeft(2, '0');
  return '${date.year}-$month-$day';
}
