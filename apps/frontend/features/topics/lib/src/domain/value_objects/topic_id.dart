final class TopicId {
  const TopicId(this.value);

  final String value;

  bool get isValid => value.trim().isNotEmpty;

  @override
  bool operator ==(Object other) {
    return other is TopicId && other.value == value;
  }

  @override
  int get hashCode => value.hashCode;
}
