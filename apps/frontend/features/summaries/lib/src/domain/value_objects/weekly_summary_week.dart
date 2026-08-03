final class WeeklySummaryWeek {
  const WeeklySummaryWeek._(this.startedOn);

  final DateTime startedOn;

  factory WeeklySummaryWeek.fromUtcMonday(DateTime value) {
    final utc = value.toUtc();
    final normalized = DateTime.utc(utc.year, utc.month, utc.day);
    if (normalized.weekday != DateTime.monday) {
      throw ArgumentError.value(
        value,
        'value',
        'Weekly summary weeks must start on a Monday UTC date',
      );
    }
    return WeeklySummaryWeek._(normalized);
  }

  factory WeeklySummaryWeek.containing(DateTime value) {
    final utc = value.toUtc();
    final day = DateTime.utc(utc.year, utc.month, utc.day);
    return WeeklySummaryWeek._(
      day.subtract(Duration(days: day.weekday - DateTime.monday)),
    );
  }

  DateTime get endedOn => startedOn.add(const Duration(days: 6));

  String get startedOnIso => _toIsoDate(startedOn);

  String get endedOnIso => _toIsoDate(endedOn);

  List<String> get utcDates => List<String>.unmodifiable(
    List<String>.generate(
      7,
      (index) => _toIsoDate(startedOn.add(Duration(days: index))),
    ),
  );

  WeeklySummaryWeek previous() =>
      WeeklySummaryWeek._(startedOn.subtract(const Duration(days: 7)));

  WeeklySummaryWeek next() =>
      WeeklySummaryWeek._(startedOn.add(const Duration(days: 7)));

  bool containsIsoDate(String value) => utcDates.contains(value);

  @override
  bool operator ==(Object other) =>
      other is WeeklySummaryWeek && other.startedOn == startedOn;

  @override
  int get hashCode => startedOn.hashCode;
}

String _toIsoDate(DateTime value) => value.toUtc().toIso8601String().substring(
  0,
  10,
);
