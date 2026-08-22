final class SummaryWindow {
  const SummaryWindow({
    this.id,
    required this.label,
    this.startsAt,
    this.endsAt,
    this.ingestionCutoff,
  });

  factory SummaryWindow.current() {
    return const SummaryWindow(label: 'Current summary window');
  }

  final String? id;
  final String label;
  final DateTime? startsAt;
  final DateTime? endsAt;
  final DateTime? ingestionCutoff;

  bool contains(DateTime value) {
    final start = startsAt;
    final end = endsAt;

    if (start != null && value.isBefore(start)) {
      return false;
    }
    if (end != null && value.isAfter(end)) {
      return false;
    }

    return true;
  }
}
