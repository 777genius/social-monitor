final class ScanPolicyId {
  const ScanPolicyId(this.value);

  final String value;

  bool get isValid => value.trim().isNotEmpty;

  @override
  bool operator ==(Object other) {
    return other is ScanPolicyId && other.value == value;
  }

  @override
  int get hashCode => value.hashCode;
}
