import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';

void main() {
  test('formats closed UTC summary period boundaries', () {
    final period = SummaryPeriod(
      cadence: SummaryPeriodCadence.daily,
      startedAt: DateTime.utc(2026, 6, 24),
      endedAt: DateTime.utc(2026, 6, 25),
      timezone: 'UTC',
    );

    expect(period.utcRangeLabel, '2026-06-24 00:00 - 2026-06-25 00:00 UTC');
  });

  test('resolves calendar dates into closed UTC periods', () {
    final daily = SummaryPeriodPreset.daily.resolveForCalendarDate(
      DateTime(2026, 6, 10),
      now: DateTime.utc(2026, 6, 27, 12),
    );
    final weekly = SummaryPeriodPreset.weekly.resolveForCalendarDate(
      DateTime(2026, 7, 8),
      now: DateTime.utc(2026, 7, 15, 12),
    );
    final monthly = SummaryPeriodPreset.monthly.resolveForCalendarDate(
      DateTime(2026, 6, 23),
      now: DateTime.utc(2026, 7, 15, 12),
    );

    expect(daily.startedAt, DateTime.utc(2026, 6, 10));
    expect(daily.endedAt, DateTime.utc(2026, 6, 11));
    expect(weekly.startedAt, DateTime.utc(2026, 7, 6));
    expect(weekly.endedAt, DateTime.utc(2026, 7, 13));
    expect(monthly.startedAt, DateTime.utc(2026, 6));
    expect(monthly.endedAt, DateTime.utc(2026, 7));
  });

  test('uses the current UTC day for daily workspace summaries', () {
    final period = SummaryPeriodPreset.daily.resolve(
      now: DateTime.utc(2026, 6, 27, 12),
    );

    expect(period.startedAt, DateTime.utc(2026, 6, 27));
    expect(period.endedAt, DateTime.utc(2026, 6, 28));
    expect(
      SummaryPeriodPreset.daily.latestSelectableCalendarDate(
        now: DateTime.utc(2026, 6, 27, 12),
      ),
      DateTime.utc(2026, 6, 27),
    );
  });

  test('clamps calendar dates to latest completed period', () {
    final period = SummaryPeriodPreset.monthly.resolveForCalendarDate(
      DateTime(2026, 9, 1),
      now: DateTime.utc(2026, 7, 15, 12),
    );

    expect(period.startedAt, DateTime.utc(2026, 6));
    expect(period.endedAt, DateTime.utc(2026, 7));
  });
}
