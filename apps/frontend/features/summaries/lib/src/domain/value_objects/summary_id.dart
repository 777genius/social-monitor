final class SummaryId {
  const SummaryId(this.value);

  final String value;

  bool get isValid => value.trim().isNotEmpty;

  @override
  bool operator ==(Object other) {
    return other is SummaryId && other.value == value;
  }

  @override
  int get hashCode => value.hashCode;
}
