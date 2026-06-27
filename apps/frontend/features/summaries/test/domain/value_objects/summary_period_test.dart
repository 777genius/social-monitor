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
}
