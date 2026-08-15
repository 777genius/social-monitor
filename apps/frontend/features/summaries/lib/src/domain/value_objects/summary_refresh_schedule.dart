final class SummaryRefreshSchedule {
  const SummaryRefreshSchedule._();

  static const refreshInterval = Duration(hours: 4);
  static const scheduledMinuteUtc = 15;

  static DateTime nextScheduledAt(DateTime now) {
    final utc = now.toUtc();
    final currentSlotHour =
        (utc.hour ~/ refreshInterval.inHours) * refreshInterval.inHours;
    var candidate = DateTime.utc(
      utc.year,
      utc.month,
      utc.day,
      currentSlotHour,
      scheduledMinuteUtc,
    );
    if (!candidate.isAfter(utc)) {
      candidate = candidate.add(refreshInterval);
    }
    return candidate;
  }

  static DateTime latestScheduledAt(DateTime now) =>
      nextScheduledAt(now).subtract(refreshInterval);

  static bool isUpdateDue({
    required DateTime now,
    required DateTime collectedAt,
  }) => collectedAt.toUtc().isBefore(latestScheduledAt(now));

  static Duration remaining({required DateTime now, required DateTime next}) {
    final value = next.toUtc().difference(now.toUtc());
    return value.isNegative ? Duration.zero : value;
  }
}
