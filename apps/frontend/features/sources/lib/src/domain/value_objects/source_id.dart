final class SourceId {
  const SourceId(this.value);

  final String value;

  bool get isValid => value.trim().isNotEmpty;

  @override
  bool operator ==(Object other) {
    return other is SourceId && other.value == value;
  }

  @override
  int get hashCode => value.hashCode;
}
