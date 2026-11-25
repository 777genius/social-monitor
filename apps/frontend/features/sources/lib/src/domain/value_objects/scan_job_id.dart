final class ScanJobId {
  const ScanJobId(this.value);

  final String value;

  bool get isValid => value.trim().isNotEmpty;

  @override
  bool operator ==(Object other) {
    return other is ScanJobId && other.value == value;
  }

  @override
  int get hashCode => value.hashCode;
}
