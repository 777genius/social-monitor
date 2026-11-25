final class InterestQuery {
  const InterestQuery(this.value);

  final String value;

  String get normalized => value.trim();

  bool get isValid => normalized.length >= 2;

  @override
  bool operator ==(Object other) {
    return other is InterestQuery && other.value == value;
  }

  @override
  int get hashCode => value.hashCode;
}
