final class SourceTopicId {
  const SourceTopicId(this.value);

  final String value;

  bool get isValid => value.trim().isNotEmpty;

  @override
  bool operator ==(Object other) {
    return other is SourceTopicId && other.value == value;
  }

  @override
  int get hashCode => value.hashCode;
}
