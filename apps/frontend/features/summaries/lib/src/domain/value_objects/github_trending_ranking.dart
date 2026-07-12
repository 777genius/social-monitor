enum GitHubTrendingWindow { daily, weekly, monthly, unknown }

final class GitHubTrendingScope {
  const GitHubTrendingScope({this.programmingLanguage, this.spokenLanguage});

  final String? programmingLanguage;
  final String? spokenLanguage;

  String get comparisonKey => [
    programmingLanguage?.trim().toLowerCase() ?? 'any',
    spokenLanguage?.trim().toLowerCase() ?? 'any',
  ].join(':');
}

/// One provider-owned position from one captured GitHub Trending list.
final class GitHubTrendingRanking {
  const GitHubTrendingRanking({
    required this.position,
    required this.starsGained,
    required this.window,
    required this.capturedAt,
    required this.scope,
  });

  final int position;
  final int starsGained;
  final GitHubTrendingWindow window;
  final DateTime capturedAt;
  final GitHubTrendingScope scope;

  String get snapshotScopeKey => [
    capturedAt.toUtc().toIso8601String(),
    window.name,
    scope.comparisonKey,
  ].join('|');
}
