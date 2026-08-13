import '../../domain/aggregates/reader_summary.dart';
import '../formatters/top_post_metrics.dart';
import 'more_selected_posts_ranking.dart';

const readerSummaryCuratedTopPostLimit = 8;
const readerSummaryGitHubTrendingProviderKey = 'github-trending-page';

final class ReaderSummaryTopPostsProjection {
  ReaderSummaryTopPostsProjection._({
    required this.curatedPosts,
    required this.moreSelectedPosts,
    required this.githubTrendingPosts,
    required this.items,
    required List<String> datasetOrder,
  }) : _datasetOrder = datasetOrder;

  final List<TopRead> curatedPosts;
  final List<TopRead> moreSelectedPosts;
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
  final editorialTopReads = _stableUniquePosts(
    summary.content.topReads.where((item) => !isGitHubTrendingTopPost(item)),
  );
  final curatedPosts = editorialTopReads
      .take(readerSummaryCuratedTopPostLimit)
      .toList(growable: false);
  final moreSelectedPosts = List<TopRead>.unmodifiable(
    orderMoreSelectedPostsByUsefulness(
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
    ),
  );
  final githubTrendingPosts = List<TopRead>.unmodifiable(
    orderGitHubTrendingPosts(
      summary.content.selectedPosts.where(isGitHubTrendingTopPost),
    ),
  );
  final items = List<TopRead>.unmodifiable([
    ...curatedPosts,
    ...moreSelectedPosts,
    ...githubTrendingPosts,
  ]);

  return ReaderSummaryTopPostsProjection._(
    curatedPosts: List<TopRead>.unmodifiable(curatedPosts),
    moreSelectedPosts: moreSelectedPosts,
    githubTrendingPosts: githubTrendingPosts,
    items: items,
    datasetOrder: List<String>.unmodifiable([
      'curated:${curatedPosts.length}',
      for (final item in curatedPosts)
        'curated-post:${readerSummaryTopPostIdentity(item)}',
      for (final item in moreSelectedPosts)
        'more-selected:${readerSummaryTopPostIdentity(item)}',
      for (final item in githubTrendingPosts)
        'github:${readerSummaryTopPostIdentity(item)}',
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
