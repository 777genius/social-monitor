sealed class FeedProviderMetadata {
  const FeedProviderMetadata();
}

final class GitHubRepositoryTrendMetadata extends FeedProviderMetadata {
  const GitHubRepositoryTrendMetadata({
    required this.repositoryFullName,
    required this.repositoryUrl,
    required this.totalStars,
    required this.stars24h,
    required this.stars7d,
    required this.stars30d,
    required this.stars90d,
    required this.rank,
    required this.primaryWindow,
    required this.source,
    this.description,
    this.language,
    this.topics = const [],
    this.license,
    this.checkedAt,
  });

  final String repositoryFullName;
  final String repositoryUrl;
  final String? description;
  final String? language;
  final List<String> topics;
  final String? license;
  final int totalStars;
  final int stars24h;
  final int stars7d;
  final int stars30d;
  final int stars90d;
  final int rank;
  final String primaryWindow;
  final DateTime? checkedAt;
  final String source;

  int get primaryWindowStars {
    return switch (primaryWindow) {
      '24h' => stars24h,
      '7d' => stars7d,
      '30d' => stars30d,
      '90d' => stars90d,
      _ => stars7d,
    };
  }

  String get primaryWindowLabel => '+$primaryWindowStars / $primaryWindow';
}

FeedProviderMetadata? feedProviderMetadataFromApi(Object? raw) {
  final record = _readRecord(raw);
  if (record == null || record['kind'] != 'github_repository_trend') {
    return null;
  }

  final repository = _readRecord(record['repository']);
  final trend = _readRecord(record['trend']);
  if (repository == null || trend == null) {
    return null;
  }

  final fullName = _readString(repository['fullName']);
  final url = _readString(repository['url']);
  if (fullName == null || url == null) {
    return null;
  }

  return GitHubRepositoryTrendMetadata(
    repositoryFullName: fullName,
    repositoryUrl: url,
    description: _readString(repository['description']),
    language: _readString(repository['language']),
    topics: _readStringList(repository['topics']),
    license: _readString(repository['license']),
    totalStars: _readNonNegativeInt(trend['totalStars']),
    stars24h: _readNonNegativeInt(trend['stars24h']),
    stars7d: _readNonNegativeInt(trend['stars7d']),
    stars30d: _readNonNegativeInt(trend['stars30d']),
    stars90d: _readNonNegativeInt(trend['stars90d']),
    rank: _readPositiveInt(trend['rank']),
    primaryWindow: _readTrendWindow(trend['primaryWindow']),
    checkedAt: _readDateTime(trend['checkedAt']),
    source: _readString(trend['source']) ?? 'unknown',
  );
}

Map<String, Object?>? _readRecord(Object? value) {
  if (value is Map<String, Object?>) {
    return value;
  }
  if (value is Map) {
    return {
      for (final entry in value.entries)
        if (entry.key is String) entry.key as String: entry.value,
    };
  }
  return null;
}

String? _readString(Object? value) {
  if (value is! String) {
    return null;
  }
  final trimmed = value.trim();
  return trimmed.isEmpty ? null : trimmed;
}

List<String> _readStringList(Object? value) {
  if (value is! List) {
    return const [];
  }
  return value
      .whereType<String>()
      .map((item) => item.trim())
      .where((item) => item.isNotEmpty)
      .toList(growable: false);
}

int _readNonNegativeInt(Object? value) {
  if (value is int && value >= 0) {
    return value;
  }
  if (value is num && value.isFinite && value >= 0) {
    return value.truncate();
  }
  if (value is String) {
    final parsed = int.tryParse(value);
    if (parsed != null && parsed >= 0) {
      return parsed;
    }
  }
  return 0;
}

int _readPositiveInt(Object? value) {
  final parsed = _readNonNegativeInt(value);
  return parsed <= 0 ? 1 : parsed;
}

String _readTrendWindow(Object? value) {
  return switch (value) {
    '24h' || '7d' || '30d' || '90d' => value as String,
    _ => '7d',
  };
}

DateTime? _readDateTime(Object? value) {
  final raw = _readString(value);
  return raw == null ? null : DateTime.tryParse(raw);
}
