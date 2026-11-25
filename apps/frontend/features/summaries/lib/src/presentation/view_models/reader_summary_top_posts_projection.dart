import '../../domain/aggregates/reader_summary.dart';

/// Display projection of the reader promotion board.
///
/// - [curatedPosts] ("Top posts") and [additionalNotableStories] ("Show
///   more") are one ranked sequence; [items] is that sequence.
/// - [newsWithoutRatingPosts] is the separate block for sources without a
///   popularity rating.
///
/// The backend order is preserved; a single unauthorized card hides the
/// whole board, never just that card.
final class ReaderSummaryTopPostsProjection {
  ReaderSummaryTopPostsProjection._({
    required this.curatedPosts,
    required this.additionalNotableStories,
    required this.newsWithoutRatingPosts,
    required this.items,
    required this.availability,
    required List<String> datasetOrder,
  }) : _datasetOrder = datasetOrder;

  final List<TopRead> curatedPosts;
  final List<TopRead> additionalNotableStories;
  final List<TopRead> newsWithoutRatingPosts;
  final List<TopRead> items;
  final ReaderSummaryPromotionBoardAvailability availability;
  final List<String> _datasetOrder;

  bool get hasRankedPosts => items.isNotEmpty;
  bool get hasNewsWithoutRating => newsWithoutRatingPosts.isNotEmpty;

  /// Nothing to show in either block.
  bool get isEmpty => !hasRankedPosts && !hasNewsWithoutRating;

  /// The day was ranked under an earlier policy and waits for a rebuild.
  bool get requiresRebuild =>
      availability == ReaderSummaryPromotionBoardAvailability.rebuildRequired;

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
  final availability = summary.content.promotionBoardAvailability;
  if (availability != ReaderSummaryPromotionBoardAvailability.available) {
    return _withheldPromotionProjection(availability);
  }
  final curatedPosts = _authorizedPromotions(
    summary.content.topReads,
    placement: ReaderPostPromotionPlacement.top,
  );
  final additionalNotableStories = _authorizedPromotions(
    summary.content.selectedPosts,
    placement: ReaderPostPromotionPlacement.additional,
  );
  final newsWithoutRatingPosts = _authorizedPromotions(
    summary.content.newsWithoutRatingPosts,
    placement: ReaderPostPromotionPlacement.news,
  );
  if (curatedPosts.length != summary.content.topReads.length ||
      additionalNotableStories.length != summary.content.selectedPosts.length ||
      newsWithoutRatingPosts.length !=
          summary.content.newsWithoutRatingPosts.length) {
    return _withheldPromotionProjection(
      ReaderSummaryPromotionBoardAvailability.unavailable,
    );
  }
  final items = List<TopRead>.unmodifiable([
    ...curatedPosts,
    ...additionalNotableStories,
  ]);

  return ReaderSummaryTopPostsProjection._(
    curatedPosts: curatedPosts,
    additionalNotableStories: additionalNotableStories,
    newsWithoutRatingPosts: newsWithoutRatingPosts,
    items: items,
    availability: availability,
    datasetOrder: List<String>.unmodifiable([
      'summary:${summary.id}',
      'curated:${curatedPosts.length}',
      for (final item in curatedPosts)
        'curated-post:${readerSummaryTopPostIdentity(item)}',
      for (final item in additionalNotableStories)
        'additional-story:${readerSummaryTopPostIdentity(item)}',
      for (final item in newsWithoutRatingPosts)
        'news-post:${readerSummaryTopPostIdentity(item)}',
    ]),
  );
}

ReaderSummaryTopPostsProjection _withheldPromotionProjection(
  ReaderSummaryPromotionBoardAvailability availability,
) => ReaderSummaryTopPostsProjection._(
  curatedPosts: const [],
  additionalNotableStories: const [],
  newsWithoutRatingPosts: const [],
  items: const [],
  availability: availability,
  datasetOrder: ['promotion-board:${availability.name}'],
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
        item.cardKind != placement.cardKind) {
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
