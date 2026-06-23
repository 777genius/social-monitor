final class SourceBindingId {
  const SourceBindingId(this.value);

  final String value;

  bool get isValid => value.trim().isNotEmpty;

  @override
  bool operator ==(Object other) {
    return other is SourceBindingId && other.value == value;
  }

  @override
  int get hashCode => value.hashCode;
}
