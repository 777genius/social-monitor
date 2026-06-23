final class FeedItemFilter {
  const FeedItemFilter({
    this.search = '',
    this.topicId,
    this.providerKey,
    this.repositoryTrendWindow,
    this.repositoryLanguage,
    this.repositoryTopic,
  });

  final String search;
  final String? topicId;
  final String? providerKey;
  final String? repositoryTrendWindow;
  final String? repositoryLanguage;
  final String? repositoryTopic;

  bool get hasMetadataFilters {
    return providerKey != null ||
        repositoryTrendWindow != null ||
        repositoryLanguage != null ||
        repositoryTopic != null;
  }

  bool get hasAnyFilter {
    return search.trim().isNotEmpty || topicId != null || hasMetadataFilters;
  }

  FeedItemFilter copyWith({
    String? search,
    String? topicId,
    bool clearTopicId = false,
    String? providerKey,
    bool clearProviderKey = false,
    String? repositoryTrendWindow,
    bool clearRepositoryTrendWindow = false,
    String? repositoryLanguage,
    bool clearRepositoryLanguage = false,
    String? repositoryTopic,
    bool clearRepositoryTopic = false,
  }) {
    return FeedItemFilter(
      search: search ?? this.search,
      topicId: clearTopicId ? null : topicId ?? this.topicId,
      providerKey: clearProviderKey ? null : providerKey ?? this.providerKey,
      repositoryTrendWindow: clearRepositoryTrendWindow
          ? null
          : repositoryTrendWindow ?? this.repositoryTrendWindow,
      repositoryLanguage: clearRepositoryLanguage
          ? null
          : repositoryLanguage ?? this.repositoryLanguage,
      repositoryTopic: clearRepositoryTopic
          ? null
          : repositoryTopic ?? this.repositoryTopic,
    ).normalized();
  }

  FeedItemFilter normalized() {
    final normalizedSearch = search.trim();
    final normalizedTopicId = _normalizeOptional(topicId);
    final normalizedProviderKey = _normalizeKey(providerKey);
    final normalizedTrendWindow = _normalizeTrendWindow(repositoryTrendWindow);
    final normalizedLanguage = _normalizeOptional(repositoryLanguage);
    final normalizedRepositoryTopic = _normalizeOptional(repositoryTopic);
    return FeedItemFilter(
      search: normalizedSearch,
      topicId: normalizedTopicId,
      providerKey: normalizedProviderKey,
      repositoryTrendWindow: normalizedTrendWindow,
      repositoryLanguage: normalizedLanguage,
      repositoryTopic: normalizedRepositoryTopic,
    );
  }
}

String? _normalizeOptional(String? value) {
  final trimmed = value?.trim();

  return trimmed == null || trimmed.isEmpty ? null : trimmed;
}

String? _normalizeKey(String? value) {
  return _normalizeOptional(value)?.toLowerCase();
}

String? _normalizeTrendWindow(String? value) {
  final normalized = _normalizeOptional(value)?.toLowerCase();

  return switch (normalized) {
    '24h' || '7d' || '30d' || '90d' => normalized,
    _ => null,
  };
}
