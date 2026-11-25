final class SummaryRefreshSchedule {
  const SummaryRefreshSchedule._();

  static const _scheduledHoursUtc = [4, 8, 12, 16, 20];
  static const scheduledMinuteUtc = 15;

  /// Collection can finish shortly before its nominal publication slot.
  static const collectionLeadTolerance = Duration(minutes: 5);

  static DateTime nextScheduledAt(DateTime now) {
    final utc = now.toUtc();
    for (final hour in _scheduledHoursUtc) {
      final candidate = _slot(utc, hour);
      if (candidate.isAfter(utc)) return candidate;
    }
    final tomorrow = utc.add(const Duration(days: 1));
    return _slot(tomorrow, _scheduledHoursUtc.first);
  }

  static DateTime latestScheduledAt(DateTime now) {
    final utc = now.toUtc();
    for (final hour in _scheduledHoursUtc.reversed) {
      final candidate = _slot(utc, hour);
      if (!candidate.isAfter(utc)) return candidate;
    }
    final yesterday = utc.subtract(const Duration(days: 1));
    return _slot(yesterday, _scheduledHoursUtc.last);
  }

  static bool isUpdateDue({
    required DateTime now,
    required DateTime collectedAt,
  }) {
    final latestSlot = latestScheduledAt(now);
    final freshnessCutoff = latestSlot.subtract(collectionLeadTolerance);
    return collectedAt.toUtc().isBefore(freshnessCutoff);
  }

  static Duration remaining({required DateTime now, required DateTime next}) {
    final value = next.toUtc().difference(now.toUtc());
    return value.isNegative ? Duration.zero : value;
  }

  static DateTime _slot(DateTime day, int hour) =>
      DateTime.utc(day.year, day.month, day.day, hour, scheduledMinuteUtc);
}
