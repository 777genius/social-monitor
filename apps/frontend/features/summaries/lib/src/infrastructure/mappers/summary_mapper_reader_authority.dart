part of 'summary_mapper.dart';

Map<String, ReaderSummaryStoryClusterAuthorityApiDto>
_uniqueStoryClusterAuthorities(
  Iterable<ReaderSummaryStoryClusterAuthorityApiDto> authorities,
) {
  final authorityList = authorities.toList(growable: false);
  final canonical = _uniquelyIdentified(
    authorityList,
    (authority) => authority.id,
  );
  if (canonical.length != authorityList.length) return const {};
  final clusterIdsByFeedItemId = <String, Set<String>>{};
  for (final authority in canonical.values) {
    for (final feedItemId in authority.feedItemIds) {
      final normalizedFeedItemId = feedItemId.trim();
      if (normalizedFeedItemId.isEmpty) return const {};
      clusterIdsByFeedItemId
          .putIfAbsent(normalizedFeedItemId, () => <String>{})
          .add(authority.id);
    }
  }
  if (clusterIdsByFeedItemId.values.any(
    (clusterIds) => clusterIds.length != 1,
  )) {
    return const {};
  }
  return canonical;
}

Map<String, SummaryCitationApiDto> _uniqueSummaryCitations(
  Iterable<SummaryCitationApiDto> citations,
) {
  final citationList = citations.toList(growable: false);
  final canonical = _uniquelyIdentified(
    citationList,
    (citation) => citation.id,
  );
  return canonical.length == citationList.length ? canonical : const {};
}

Map<String, T> _uniquelyIdentified<T>(
  Iterable<T> values,
  String Function(T value) identityOf,
) {
  final counts = <String, int>{};
  final valuesById = <String, T>{};
  for (final value in values) {
    final id = identityOf(value);
    counts.update(id, (count) => count + 1, ifAbsent: () => 1);
    valuesById[id] = value;
  }
  valuesById.removeWhere((id, _) => counts[id] != 1);
  return valuesById;
}

bool _hasCanonicalClusterCardAuthority(
  TopReadApiDto item,
  String? storyClusterId,
  _ReaderItemContext context,
) {
  final authority = storyClusterId == null
      ? null
      : context.storyClusterAuthorities[storyClusterId];
  if (authority == null ||
      item.citationIds.toSet().length != item.citationIds.length) {
    return false;
  }
  final citations = item.citationIds
      .map((citationId) => context.citationsById[citationId])
      .toList(growable: false);
  if (citations.any((citation) => citation == null)) {
    return false;
  }
  final authorityFeedItems = authority.feedItemIds.toSet();
  final authorityProviders = authority.providerKeys
      .map(_normalizedReaderProvider)
      .toSet();
  final citationProviders = <String>{};
  for (final citation in citations.whereType<SummaryCitationApiDto>()) {
    final provider = _normalizedReaderProvider(citation.providerKey ?? '');
    if (!authorityFeedItems.contains(citation.feedItemId) ||
        !authorityProviders.contains(provider)) {
      return false;
    }
    citationProviders.add(provider);
  }
  final primaryProvider = _normalizedReaderProvider(item.providerKey);
  final confirmedProviders = item.confirmedProviderKeys
      .map(_normalizedReaderProvider)
      .toSet();
  final canonicalUrlMatches =
      item.canonicalUrl == null ||
      citations.whereType<SummaryCitationApiDto>().any(
        (citation) =>
            _normalizedReaderProvider(citation.providerKey ?? '') ==
                primaryProvider &&
            citation.canonicalUrl?.trim() == item.canonicalUrl!.trim(),
      );
  return citationProviders.contains(primaryProvider) &&
      confirmedProviders.length == item.confirmedProviderKeys.length &&
      confirmedProviders.length == citationProviders.length &&
      confirmedProviders.every(citationProviders.contains) &&
      canonicalUrlMatches;
}

String _normalizedReaderProvider(String value) =>
    readerSummaryIndependentProviderFamily(value);
