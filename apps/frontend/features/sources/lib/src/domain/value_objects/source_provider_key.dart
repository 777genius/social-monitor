final class SourceProviderKey {
  const SourceProviderKey(this.value);

  final String value;

  String get normalized => value.trim();

  bool get isValid => normalized.isNotEmpty;

  @override
  bool operator ==(Object other) {
    return other is SourceProviderKey && other.value == value;
  }

  @override
  int get hashCode => value.hashCode;
}
