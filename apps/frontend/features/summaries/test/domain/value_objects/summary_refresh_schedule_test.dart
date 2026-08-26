import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/summary_refresh_schedule.dart';

void main() {
  group('SummaryRefreshSchedule', () {
    test('selects the next four-hour UTC collection slot', () {
      expect(
        SummaryRefreshSchedule.nextScheduledAt(
          DateTime.parse('2026-08-15T05:12:00.000Z'),
        ),
        DateTime.parse('2026-08-15T08:15:00.000Z'),
      );
    });

    test('moves to the first rolling slot after the nightly finalizer', () {
      expect(
        SummaryRefreshSchedule.nextScheduledAt(
          DateTime.parse('2026-08-15T20:15:00.000Z'),
        ),
        DateTime.parse('2026-08-16T04:15:00.000Z'),
      );
    });

    test('uses the previous evening slot before the first daily run', () {
      expect(
        SummaryRefreshSchedule.latestScheduledAt(
          DateTime.parse('2026-08-16T02:00:00.000Z'),
        ),
        DateTime.parse('2026-08-15T20:15:00.000Z'),
      );
    });

    test('never exposes a negative countdown', () {
      expect(
        SummaryRefreshSchedule.remaining(
          now: DateTime.parse('2026-08-15T08:16:00.000Z'),
          next: DateTime.parse('2026-08-15T08:15:00.000Z'),
        ),
        Duration.zero,
      );
    });

    test('marks a missed publication slot as due', () {
      expect(
        SummaryRefreshSchedule.isUpdateDue(
          now: DateTime.parse('2026-08-15T08:20:00.000Z'),
          collectedAt: DateTime.parse('2026-08-15T04:15:00.000Z'),
        ),
        isTrue,
      );
      expect(
        SummaryRefreshSchedule.isUpdateDue(
          now: DateTime.parse('2026-08-15T08:20:00.000Z'),
          collectedAt: DateTime.parse('2026-08-15T08:16:00.000Z'),
        ),
        isFalse,
      );
    });

    test('accepts a collection watermark shortly before its slot', () {
      final now = DateTime.parse('2026-08-15T18:05:00.000Z');

      expect(
        SummaryRefreshSchedule.isUpdateDue(
          now: now,
          collectedAt: DateTime.parse('2026-08-15T16:13:00.000Z'),
        ),
        isFalse,
      );
      expect(
        SummaryRefreshSchedule.isUpdateDue(
          now: now,
          collectedAt: DateTime.parse('2026-08-15T16:09:59.000Z'),
        ),
        isTrue,
      );
    });
  });
}
