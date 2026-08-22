import '../../domain/aggregates/reader_summary.dart';

final class ReaderSummaryTopPostsProjection {
  ReaderSummaryTopPostsProjection._({
    required this.curatedPosts,
    required this.additionalNotableStories,
    required this.items,
    required List<String> datasetOrder,
  }) : _datasetOrder = datasetOrder;

  final List<TopRead> curatedPosts;
  final List<TopRead> additionalNotableStories;
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
  if (summary.content.promotionBoardAvailability ==
      ReaderSummaryPromotionBoardAvailability.unavailable) {
    return _unavailablePromotionProjection();
  }
  final curatedPosts = _authorizedPromotions(
    summary.content.topReads,
    placement: ReaderPostPromotionPlacement.top,
  );
  final additionalNotableStories = List<TopRead>.unmodifiable(
    _authorizedPromotions(
      summary.content.selectedPosts,
      placement: ReaderPostPromotionPlacement.additional,
    ),
  );
  if (curatedPosts.length != summary.content.topReads.length ||
      additionalNotableStories.length != summary.content.selectedPosts.length) {
    return _unavailablePromotionProjection();
  }
  final items = List<TopRead>.unmodifiable([
    ...curatedPosts,
    ...additionalNotableStories,
  ]);

  return ReaderSummaryTopPostsProjection._(
    curatedPosts: List<TopRead>.unmodifiable(curatedPosts),
    additionalNotableStories: additionalNotableStories,
    items: items,
    datasetOrder: List<String>.unmodifiable([
      'curated:${curatedPosts.length}',
      for (final item in curatedPosts)
        'curated-post:${readerSummaryTopPostIdentity(item)}',
      for (final item in additionalNotableStories)
        'additional-story:${readerSummaryTopPostIdentity(item)}',
    ]),
  );
}

ReaderSummaryTopPostsProjection _unavailablePromotionProjection() =>
    ReaderSummaryTopPostsProjection._(
      curatedPosts: const [],
      additionalNotableStories: const [],
      items: const [],
      datasetOrder: const ['promotion-board:unavailable'],
    );

List<TopRead> _authorizedPromotions(
  Iterable<TopRead> items, {
  required ReaderPostPromotionPlacement placement,
}) {
  final authorized = <TopRead>[];
  for (final item in items) {
    final attestation = item.promotionAttestation;
    if (attestation == null ||
        attestation.placement != placement ||
        !_hasAuthorizedStoryMarker(item) ||
        (placement == ReaderPostPromotionPlacement.top &&
            item.cardKind != ReaderSummaryCardKind.curatedTopRead) ||
        (placement == ReaderPostPromotionPlacement.additional &&
            item.cardKind != ReaderSummaryCardKind.additionalNotableStory)) {
      return const [];
    }
    authorized.add(item);
  }
  return List<TopRead>.unmodifiable(authorized);
}

bool _hasAuthorizedStoryMarker(TopRead item) {
  final storyClusterId = item.storyClusterId?.trim();
  return storyClusterId != null && storyClusterId.isNotEmpty;
}

String readerSummaryTopPostIdentity(TopRead item) {
  final storyClusterId = item.storyClusterId?.trim();
  if (storyClusterId != null && storyClusterId.isNotEmpty) {
    return 'cluster:${_normalizedText(storyClusterId)}';
  }
  final canonicalUrl = item.canonicalUrl;
  if (canonicalUrl != null && canonicalUrl.trim().isNotEmpty) {
    return 'url:${_normalizedCanonicalUrl(canonicalUrl)}';
  }
  return 'fallback:${_normalizedText(item.providerKey)}:'
      '${_normalizedText(item.title)}';
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
