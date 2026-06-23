final class TopicQuery {
  const TopicQuery(this.value);

  final String value;

  String get normalized => value.trim();

  bool get isValid => normalized.length >= 2;

  @override
  bool operator ==(Object other) {
    return other is TopicQuery && other.value == value;
  }

  @override
  int get hashCode => value.hashCode;
}
