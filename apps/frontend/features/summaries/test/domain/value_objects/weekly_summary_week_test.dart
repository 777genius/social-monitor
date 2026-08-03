import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/weekly_summary_week.dart';

void main() {
  test('normalizes only Monday UTC dates into a seven-day projection window', () {
    final week = WeeklySummaryWeek.fromUtcMonday(DateTime.utc(2026, 7, 20));

    expect(week.startedOnIso, '2026-07-20');
    expect(week.endedOnIso, '2026-07-26');
    expect(week.utcDates, hasLength(7));
    expect(week.previous().startedOnIso, '2026-07-13');
    expect(week.next().startedOnIso, '2026-07-27');
  });

  test('rejects a non-Monday UTC week start', () {
    expect(
      () => WeeklySummaryWeek.fromUtcMonday(DateTime.utc(2026, 7, 21)),
      throwsArgumentError,
    );
  });
}
