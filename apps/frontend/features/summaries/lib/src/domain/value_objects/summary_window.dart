final class SummaryWindow {
  const SummaryWindow({required this.label, this.startsAt, this.endsAt});

  factory SummaryWindow.current() {
    return const SummaryWindow(label: 'Current summary window');
  }

  final String label;
  final DateTime? startsAt;
  final DateTime? endsAt;

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
