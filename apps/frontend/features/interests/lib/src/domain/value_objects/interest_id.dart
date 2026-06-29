final class InterestId {
  const InterestId(this.value);

  final String value;

  bool get isValid => value.trim().isNotEmpty;

  @override
  bool operator ==(Object other) {
    return other is InterestId && other.value == value;
  }

  @override
  int get hashCode => value.hashCode;
}
