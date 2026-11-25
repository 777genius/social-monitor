final class InterestName {
  const InterestName(this.value);

  final String value;

  String get normalized => value.trim();

  bool get isValid => normalized.length >= 2;

  @override
  bool operator ==(Object other) {
    return other is InterestName && other.value == value;
  }

  @override
  int get hashCode => value.hashCode;
}
