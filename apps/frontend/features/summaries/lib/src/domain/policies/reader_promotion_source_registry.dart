import '../value_objects/reader_promotion_comparator.dart';

/// One source family and the promotion block its posts belong to.
final class ReaderPromotionSource {
  const ReaderPromotionSource({
    required this.family,
    required this.providerKeys,
    required this.block,
  });

  /// Normalized family used for popularity cohorts.
  final String family;

  /// Persisted provider keys (lowercase) that belong to this family.
  final Set<String> providerKeys;
  final ReaderPromotionBlock block;
}

/// The single table that decides which block a source belongs to.
///
/// Mirrors `READER_PROMOTION_SOURCE_REGISTRY` in
/// `libs/summary/domain/policies/reader-promotion-source-registry.ts`. Block
/// membership is never inferred from a provider name elsewhere: a new source
/// without a rating is one more row here and on the backend.
const readerPromotionSourceRegistry = <ReaderPromotionSource>[
  ReaderPromotionSource(
    family: 'x',
    providerKeys: {'x', 'twitter', 'x-twitter'},
    block: ReaderPromotionBlock.ranked,
  ),
  ReaderPromotionSource(
    family: 'reddit',
    providerKeys: {'reddit'},
    block: ReaderPromotionBlock.ranked,
  ),
  ReaderPromotionSource(
    family: 'hacker_news',
    providerKeys: {'hn', 'hacker_news', 'hacker-news'},
    block: ReaderPromotionBlock.ranked,
  ),
  ReaderPromotionSource(
    family: 'github_radar',
    providerKeys: {
      'github',
      'github_radar',
      'github-repo-radar',
      'github-trending-page',
    },
    block: ReaderPromotionBlock.ranked,
  ),
  ReaderPromotionSource(
    family: 'rss',
    providerKeys: {'rss'},
    block: ReaderPromotionBlock.unranked,
  ),
];

/// Registry row of an exact persisted provider key, or `null` when the
/// source is not registered (such a card can never be promoted).
ReaderPromotionSource? readerPromotionSourceForProviderKey(String providerKey) {
  final key = providerKey.trim().toLowerCase();
  for (final source in readerPromotionSourceRegistry) {
    if (source.providerKeys.contains(key)) return source;
  }
  return null;
}
