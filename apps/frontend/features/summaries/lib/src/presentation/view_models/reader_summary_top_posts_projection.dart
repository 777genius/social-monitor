import '../../domain/aggregates/reader_summary.dart';

const readerSummaryCuratedTopPostLimit = 8;
const readerSummaryGitHubTrendingProviderKey = 'github-trending-page';

final class ReaderSummaryTopPostsProjection {
  ReaderSummaryTopPostsProjection._({
    required this.curatedPosts,
    required this.continuationPosts,
    required this.posts,
    required this.githubTrendingPosts,
    required this.items,
    required List<String> datasetOrder,
  }) : _datasetOrder = datasetOrder;

  final List<TopRead> curatedPosts;
  final List<TopRead> continuationPosts;
  final List<TopRead> posts;
  final List<TopRead> githubTrendingPosts;
  final List<TopRead> items;
  final List<String> _datasetOrder;

  bool get isEmpty => items.isEmpty;

  bool hasSameDatasetAs(ReaderSummaryTopPostsProjection other) {
    if (_datasetOrder.length != other._datasetOrder.length) {
      return false;
    }
    for (var index = 0; index < _datasetOrder.length; index += 1) {
      if (_datasetOrder[index] != other._datasetOrder[index]) {
        return false;
      }
    }
    return true;
  }
}

ReaderSummaryTopPostsProjection readerSummaryTopPostsProjection(
  ReaderSummary summary,
) {
  final editorialTopReads = summary.content.topReads
      .where((item) => !isGitHubTrendingTopPost(item))
      .toList(growable: false);
  final curatedPosts = editorialTopReads
      .take(readerSummaryCuratedTopPostLimit)
      .toList(growable: false);
  // Preserve backend order while keeping the first identity across the
  // complete non-GitHub continuation.
  final continuationPosts = List<TopRead>.unmodifiable(
    _stableUniquePosts(
      [
        ...editorialTopReads.skip(readerSummaryCuratedTopPostLimit),
        ...summary.content.selectedPosts.where(
          (item) => !isGitHubTrendingTopPost(item),
        ),
      ],
      seenIdentities: {
        for (final item in curatedPosts) readerSummaryTopPostIdentity(item),
      },
    ),
  );
  final posts = List<TopRead>.unmodifiable([
    ...curatedPosts,
    ...continuationPosts,
  ]);
  final githubTrendingPosts = _projectGitHubTrendingPosts([
    ...summary.content.topReads.where(isGitHubTrendingTopPost),
    ...summary.content.selectedPosts.where(isGitHubTrendingTopPost),
  ]);
  final items = List<TopRead>.unmodifiable([...posts, ...githubTrendingPosts]);

  return ReaderSummaryTopPostsProjection._(
    curatedPosts: List<TopRead>.unmodifiable(curatedPosts),
    continuationPosts: List<TopRead>.unmodifiable(continuationPosts),
    posts: posts,
    githubTrendingPosts: githubTrendingPosts,
    items: items,
    datasetOrder: List<String>.unmodifiable([
      'curated:${curatedPosts.length}',
      for (final item in posts) 'post:${readerSummaryTopPostIdentity(item)}',
      for (final item in githubTrendingPosts)
        'github:${readerSummaryGitHubRepositoryIdentity(item)}',
    ]),
  );
}

bool isGitHubTrendingTopPost(TopRead item) =>
    item.providerKey.trim().toLowerCase() ==
    readerSummaryGitHubTrendingProviderKey;

String readerSummaryTopPostIdentity(TopRead item) {
  final canonicalUrl = item.canonicalUrl;
  if (canonicalUrl != null && canonicalUrl.trim().isNotEmpty) {
    return 'url:${_normalizedCanonicalUrl(canonicalUrl)}';
  }
  return 'fallback:${_normalizedText(item.providerKey)}:'
      '${_normalizedText(item.title)}';
}

String readerSummaryGitHubRepositoryIdentity(TopRead item) {
  final canonicalUrl = item.canonicalUrl;
  if (canonicalUrl != null) {
    final repository = _repositoryFromGitHubUrl(canonicalUrl);
    if (repository != null) {
      return repository;
    }
  }

  final titleMatch = RegExp(
    r'([a-zA-Z0-9_.-]+)/([a-zA-Z0-9_.-]+)',
  ).firstMatch(item.title);
  if (titleMatch != null) {
    final owner = _normalizedRepositorySegment(titleMatch.group(1)!);
    final repository = _normalizedRepositorySegment(titleMatch.group(2)!);
    if (owner.isNotEmpty && repository.isNotEmpty) {
      return '$owner/$repository';
    }
  }

  return readerSummaryTopPostIdentity(item);
}

List<TopRead> _stableUniquePosts(
  Iterable<TopRead> items, {
  Set<String>? seenIdentities,
}) {
  final seen = {...?seenIdentities};
  final unique = <TopRead>[];
  for (final item in items) {
    if (seen.add(readerSummaryTopPostIdentity(item))) {
      unique.add(item);
    }
  }
  return unique;
}

List<TopRead> _projectGitHubTrendingPosts(
  Iterable<TopRead> items, {
  int limit = 10,
}) {
  final seenRepositories = <String>{};
  final candidates = <_GitHubRepositoryCandidate>[];
  var sourceIndex = 0;
  for (final item in items) {
    final identity = readerSummaryGitHubRepositoryIdentity(item);
    if (seenRepositories.add(identity)) {
      candidates.add(
        _GitHubRepositoryCandidate(
          item: item,
          rank: _githubTrendingRank(item),
          firstSourceIndex: sourceIndex,
        ),
      );
    }
    sourceIndex += 1;
  }

  final ordered = candidates.toList(growable: false)
    ..sort((left, right) {
      final leftRank = left.rank;
      final rightRank = right.rank;
      if (leftRank == null && rightRank == null) {
        return left.firstSourceIndex.compareTo(right.firstSourceIndex);
      }
      if (leftRank == null) {
        return 1;
      }
      if (rightRank == null) {
        return -1;
      }
      final rankOrder = leftRank.compareTo(rightRank);
      return rankOrder != 0
          ? rankOrder
          : left.firstSourceIndex.compareTo(right.firstSourceIndex);
    });

  return List<TopRead>.unmodifiable(
    ordered.take(limit).map((candidate) => candidate.item),
  );
}

int? _githubTrendingRank(TopRead read) {
  for (final metric in read.providerMetrics) {
    if (!metric.label.toLowerCase().contains('trending today')) {
      continue;
    }
    final rawRank = RegExp(r'#([\d,]+)').firstMatch(metric.value)?.group(1);
    final rank = int.tryParse(rawRank?.replaceAll(',', '') ?? '');
    if (rank != null && rank > 0) {
      return rank;
    }
  }
  return null;
}

String? _repositoryFromGitHubUrl(String rawUrl) {
  final uri = Uri.tryParse(rawUrl.trim());
  if (uri == null) {
    return null;
  }
  final host = uri.host.toLowerCase();
  if (host != 'github.com' && host != 'www.github.com') {
    return null;
  }
  final segments = uri.pathSegments
      .where((segment) => segment.trim().isNotEmpty)
      .toList(growable: false);
  if (segments.length < 2) {
    return null;
  }
  final owner = _normalizedRepositorySegment(segments[0]);
  final repository = _normalizedRepositorySegment(segments[1]);
  return owner.isEmpty || repository.isEmpty ? null : '$owner/$repository';
}

String _normalizedRepositorySegment(String value) {
  return value
      .trim()
      .replaceFirst(RegExp(r'\.git$', caseSensitive: false), '')
      .replaceFirst(RegExp(r'[.,:;]+$'), '')
      .toLowerCase();
}

String _normalizedCanonicalUrl(String rawUrl) {
  final trimmed = rawUrl.trim();
  final uri = Uri.tryParse(trimmed);
  if (uri == null || !uri.hasScheme || uri.host.isEmpty) {
    return _normalizedText(trimmed);
  }

  var path = uri.path;
  while (path.length > 1 && path.endsWith('/')) {
    path = path.substring(0, path.length - 1);
  }
  if (path == '/') {
    path = '';
  }
  final scheme = uri.scheme.toLowerCase();
  final isDefaultPort =
      (scheme == 'http' && uri.port == 80) ||
      (scheme == 'https' && uri.port == 443);
  final query = _normalizedCanonicalQuery(uri);

  return Uri(
    scheme: scheme,
    userInfo: uri.userInfo,
    host: uri.host.toLowerCase(),
    port: uri.hasPort && !isDefaultPort ? uri.port : null,
    path: path,
    query: query.isEmpty ? null : query,
  ).toString();
}

String _normalizedCanonicalQuery(Uri uri) {
  if (!uri.hasQuery) {
    return '';
  }
  final host = uri.host.toLowerCase();
  final entries = <MapEntry<String, String>>[];
  for (final parameter in uri.queryParametersAll.entries) {
    final normalizedKey = parameter.key.trim().toLowerCase();
    if (normalizedKey.startsWith('utm_') ||
        _discardedTrackingParameters.contains(normalizedKey) ||
        (_isGitHubHost(host) && normalizedKey == 'ref')) {
      continue;
    }
    for (final value in parameter.value) {
      entries.add(MapEntry(parameter.key, value));
    }
  }
  entries.sort((left, right) {
    final keyOrder = left.key.toLowerCase().compareTo(right.key.toLowerCase());
    if (keyOrder != 0) {
      return keyOrder;
    }
    final exactKeyOrder = left.key.compareTo(right.key);
    return exactKeyOrder != 0
        ? exactKeyOrder
        : left.value.compareTo(right.value);
  });
  return entries
      .map(
        (entry) =>
            '${Uri.encodeQueryComponent(entry.key)}='
            '${Uri.encodeQueryComponent(entry.value)}',
      )
      .join('&');
}

const _discardedTrackingParameters = <String>{
  'fbclid',
  'gclid',
  'igshid',
  'mc_cid',
  'mc_eid',
};

bool _isGitHubHost(String host) =>
    host == 'github.com' || host == 'www.github.com';

String _normalizedText(String value) =>
    value.trim().toLowerCase().replaceAll(RegExp(r'\s+'), ' ');

final class _GitHubRepositoryCandidate {
  const _GitHubRepositoryCandidate({
    required this.item,
    required this.rank,
    required this.firstSourceIndex,
  });

  final TopRead item;
  final int? rank;
  final int firstSourceIndex;
}
