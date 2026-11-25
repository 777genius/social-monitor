final class FeedItemFilter {
  const FeedItemFilter({
    this.search = '',
    this.interestId,
    this.providerKey,
    this.repositoryTrendWindow,
    this.repositoryLanguage,
    this.repositoryTopic,
  });

  final String search;
  final String? interestId;
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
    return search.trim().isNotEmpty || interestId != null || hasMetadataFilters;
  }

  FeedItemFilter copyWith({
    String? search,
    String? interestId,
    bool clearInterestId = false,
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
      interestId: clearInterestId ? null : interestId ?? this.interestId,
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
    final normalizedInterestId = _normalizeOptional(interestId);
    final normalizedProviderKey = _normalizeKey(providerKey);
    final normalizedTrendWindow = _normalizeTrendWindow(repositoryTrendWindow);
    final normalizedLanguage = _normalizeOptional(repositoryLanguage);
    final normalizedRepositoryTopic = _normalizeOptional(repositoryTopic);
    return FeedItemFilter(
      search: normalizedSearch,
      interestId: normalizedInterestId,
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
    '24h' || '48h' => normalized,
    _ => null,
  };
}
