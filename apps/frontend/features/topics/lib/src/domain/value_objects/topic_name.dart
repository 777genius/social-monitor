final class TopicName {
  const TopicName(this.value);

  final String value;

  String get normalized => value.trim();

  bool get isValid => normalized.length >= 2;

  @override
  bool operator ==(Object other) {
    return other is TopicName && other.value == value;
  }

  @override
  int get hashCode => value.hashCode;
}
