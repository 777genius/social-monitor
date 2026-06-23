final class TopicRules {
  const TopicRules({required this.keywords});

  final List<String> keywords;

  List<String> get normalizedKeywords {
    return keywords
        .map((keyword) => keyword.trim())
        .where((keyword) => keyword.isNotEmpty)
        .toSet()
        .toList(growable: false);
  }

  bool get isValid => normalizedKeywords.isNotEmpty;

  @override
  bool operator ==(Object other) {
    return other is TopicRules &&
        _sameKeywords(other.normalizedKeywords, normalizedKeywords);
  }

  @override
  int get hashCode => Object.hashAll(normalizedKeywords);

  static bool _sameKeywords(List<String> left, List<String> right) {
    if (left.length != right.length) {
      return false;
    }
    for (var index = 0; index < left.length; index += 1) {
      if (left[index] != right[index]) {
        return false;
      }
    }
    return true;
  }
}
