final class GitHubTrendingWatchLine {
  const GitHubTrendingWatchLine({
    required this.repository,
    required this.repositoryIdentity,
    required this.metric,
    required this.starsToday,
  });
  final String repository;
  final String repositoryIdentity;
  final String metric;
  final int starsToday;
  String get visibleText => '$repository: $metric';
}

List<GitHubTrendingWatchLine> formatGitHubTrendingWatchLines(String value) {
  final parsed = _entryPattern.allMatches(value).indexed.map((indexedMatch) {
    final (inputOrder, match) = indexedMatch;
    final repository = match.group(1)?.trim();
    final repositoryIdentity = normalizedGitHubRepositoryIdentity(repository);
    final metric = match.group(2)?.replaceAll(RegExp(r'\s+'), ' ').trim();
    final starsToday = int.tryParse(match.group(3)?.replaceAll(',', '') ?? '');
    if (repository == null ||
        repository.isEmpty ||
        repositoryIdentity == null ||
        metric == null ||
        metric.isEmpty ||
        starsToday == null ||
        starsToday <= 1000) {
      return null;
    }
    return (
      line: GitHubTrendingWatchLine(
        repository: repository,
        repositoryIdentity: repositoryIdentity,
        metric: metric,
        starsToday: starsToday,
      ),
      inputOrder: inputOrder,
    );
  }).whereType<({GitHubTrendingWatchLine line, int inputOrder})>();
  final strongest =
      <String, ({GitHubTrendingWatchLine line, int inputOrder})>{};
  for (final candidate in parsed) {
    final current = strongest[candidate.line.repositoryIdentity];
    if (current == null ||
        candidate.line.starsToday > current.line.starsToday ||
        (candidate.line.starsToday == current.line.starsToday &&
            candidate.inputOrder > current.inputOrder)) {
      strongest[candidate.line.repositoryIdentity] = candidate;
    }
  }
  final lines = strongest.values.toList()
    ..sort((left, right) {
      final stars = right.line.starsToday.compareTo(left.line.starsToday);
      return stars != 0 ? stars : left.inputOrder.compareTo(right.inputOrder);
    });
  return lines
      .map((candidate) => candidate.line)
      .take(3)
      .toList(growable: false);
}

final _entryPattern = RegExp(
  r'(?:\*\*)?([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)(?:\*\*)?\s*(?::|[—–-])\s*(\+([\d,]+)\s+stars?\s+today\.?)',
  caseSensitive: false,
);

String? normalizedGitHubRepositoryIdentity(String? value) {
  final normalized = value?.trim().replaceFirst(
    RegExp(r'\.git$', caseSensitive: false),
    '',
  );
  final match = RegExp(
    r'^([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)$',
  ).firstMatch(normalized ?? '');
  final owner = match?.group(1);
  final repository = match?.group(2);
  if (owner == null ||
      repository == null ||
      owner == '.' ||
      owner == '..' ||
      repository == '.' ||
      repository == '..') {
    return null;
  }
  return '$owner/$repository'.toLowerCase();
}

String? normalizedGitHubRepositoryUrlIdentity(String? value) {
  final uri = Uri.tryParse(value?.trim() ?? '');
  if (uri == null ||
      (uri.scheme != 'https' && uri.scheme != 'http') ||
      uri.host.toLowerCase() != 'github.com' ||
      uri.userInfo.isNotEmpty ||
      uri.hasPort) {
    return null;
  }
  final segments = uri.pathSegments
      .where((segment) => segment.isNotEmpty)
      .toList();
  if (segments.length != 2) {
    return null;
  }
  return normalizedGitHubRepositoryIdentity('${segments[0]}/${segments[1]}');
}
