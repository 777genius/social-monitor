sealed class FeedProviderMetrics {
  const FeedProviderMetrics({
    required this.sourceKey,
    required this.contentType,
  });

  final String sourceKey;
  final String contentType;
}

final class FeedMetricDelta {
  const FeedMetricDelta({required this.window, required this.value});

  final String window;
  final int value;
}

final class RedditPostMetrics extends FeedProviderMetrics {
  const RedditPostMetrics({
    required super.sourceKey,
    required this.score,
    required this.comments,
    this.upvoteRatio,
  }) : super(contentType: 'post');

  final int score;
  final int comments;
  final double? upvoteRatio;
}

final class GitHubRepositoryMetrics extends FeedProviderMetrics {
  const GitHubRepositoryMetrics({
    required super.sourceKey,
    required this.stars,
    required this.forks,
    required this.trendingDelta,
    required this.trendDeltas,
  }) : super(contentType: 'repository');

  final int stars;
  final int forks;
  final FeedMetricDelta trendingDelta;
  final List<FeedMetricDelta> trendDeltas;
}

final class HackerNewsStoryMetrics extends FeedProviderMetrics {
  const HackerNewsStoryMetrics({
    required super.sourceKey,
    required this.points,
    required this.comments,
  }) : super(contentType: 'story');

  final int points;
  final int comments;
}

final class XPostMetrics extends FeedProviderMetrics {
  const XPostMetrics({
    required super.sourceKey,
    required this.likes,
    required this.reposts,
    required this.replies,
    required this.quotes,
    required this.bookmarks,
    required this.impressions,
  }) : super(contentType: 'post');

  final int likes;
  final int reposts;
  final int replies;
  final int quotes;
  final int bookmarks;
  final int impressions;
}

FeedProviderMetrics? feedProviderMetricsFromApi(Object? raw) {
  final record = _readRecord(raw);
  final kind = _readString(record?['kind']);

  return switch (kind) {
    'reddit_post' => _redditPostMetrics(record),
    'github_repository' => _githubRepositoryMetrics(record),
    'hacker_news_story' => _hackerNewsStoryMetrics(record),
    'x_post' => _xPostMetrics(record),
    _ => null,
  };
}

FeedProviderMetrics? _redditPostMetrics(Map<String, Object?>? record) {
  if (record == null) {
    return null;
  }
  final score = _readIntOrNull(record['score']);
  final comments = _readNonNegativeIntOrNull(record['comments']);

  if (score == null && comments == null) {
    return null;
  }

  return RedditPostMetrics(
    sourceKey: _readString(record['sourceKey']) ?? 'reddit:unknown',
    score: score ?? 0,
    comments: comments ?? 0,
    upvoteRatio: _readRatio(record['upvoteRatio']),
  );
}

FeedProviderMetrics? _githubRepositoryMetrics(Map<String, Object?>? record) {
  final delta = _readRecord(record?['trendingDelta']);
  if (record == null || delta == null) {
    return null;
  }
  final stars = _readNonNegativeIntOrNull(record['stars']);
  final forks = _readNonNegativeIntOrNull(record['forks']);
  final deltaValue = _readNonNegativeIntOrNull(delta['value']);
  if (stars == null || forks == null || deltaValue == null) {
    return null;
  }
  final primaryDelta = FeedMetricDelta(
    window: _readString(delta['window']) ?? 'unknown',
    value: deltaValue,
  );

  return GitHubRepositoryMetrics(
    sourceKey: _readString(record['sourceKey']) ?? 'repo-trending:unknown',
    stars: stars,
    forks: forks,
    trendingDelta: primaryDelta,
    trendDeltas: _readTrendDeltas(
      record['trendDeltas'],
      fallback: primaryDelta,
    ),
  );
}

FeedProviderMetrics? _hackerNewsStoryMetrics(Map<String, Object?>? record) {
  if (record == null) {
    return null;
  }
  final points = _readNonNegativeIntOrNull(record['points']);
  final comments = _readNonNegativeIntOrNull(record['comments']);

  if (points == null && comments == null) {
    return null;
  }

  return HackerNewsStoryMetrics(
    sourceKey: _readString(record['sourceKey']) ?? 'hn:unknown',
    points: points ?? 0,
    comments: comments ?? 0,
  );
}

FeedProviderMetrics? _xPostMetrics(Map<String, Object?>? record) {
  if (record == null) {
    return null;
  }
  final likes = _readNonNegativeIntOrNull(record['likes']);
  final reposts = _readNonNegativeIntOrNull(record['reposts']);
  final replies = _readNonNegativeIntOrNull(record['replies']);
  final quotes = _readNonNegativeIntOrNull(record['quotes']);
  final bookmarks = _readNonNegativeIntOrNull(record['bookmarks']);
  final impressions = _readNonNegativeIntOrNull(record['impressions']);

  if (likes == null &&
      reposts == null &&
      replies == null &&
      quotes == null &&
      bookmarks == null &&
      impressions == null) {
    return null;
  }

  return XPostMetrics(
    sourceKey: _readString(record['sourceKey']) ?? 'x:unknown',
    likes: likes ?? 0,
    reposts: reposts ?? 0,
    replies: replies ?? 0,
    quotes: quotes ?? 0,
    bookmarks: bookmarks ?? 0,
    impressions: impressions ?? 0,
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

List<FeedMetricDelta> _readTrendDeltas(
  Object? value, {
  required FeedMetricDelta fallback,
}) {
  if (value is! List) {
    return [fallback];
  }
  final deltas = value
      .map(_readRecord)
      .whereType<Map<String, Object?>>()
      .map((delta) {
        final window = _readString(delta['window']);
        final value = _readNonNegativeIntOrNull(delta['value']);
        if (window == null || value == null) {
          return null;
        }
        return FeedMetricDelta(window: window, value: value);
      })
      .whereType<FeedMetricDelta>()
      .toList(growable: false);

  return deltas.isEmpty ? [fallback] : deltas;
}

String? _readString(Object? value) {
  if (value is! String) {
    return null;
  }
  final trimmed = value.trim();
  return trimmed.isEmpty ? null : trimmed;
}

int? _readNonNegativeIntOrNull(Object? value) {
  if (value is int && value >= 0) {
    return value;
  }
  if (value is num && value.isFinite && value >= 0) {
    return value.truncate();
  }
  return null;
}

int? _readIntOrNull(Object? value) {
  if (value is int) {
    return value;
  }
  if (value is num && value.isFinite) {
    return value.truncate();
  }
  return null;
}

double? _readRatio(Object? value) {
  if (value is num && value.isFinite && value >= 0 && value <= 1) {
    return value.toDouble();
  }
  return null;
}
