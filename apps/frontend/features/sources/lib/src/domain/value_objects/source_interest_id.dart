final class SourceInterestId {
  const SourceInterestId(this.value);

  final String value;

  bool get isValid => value.trim().isNotEmpty;

  @override
  bool operator ==(Object other) {
    return other is SourceInterestId && other.value == value;
  }

  @override
  int get hashCode => value.hashCode;
}
