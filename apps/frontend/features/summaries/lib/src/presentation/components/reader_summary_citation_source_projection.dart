part of 'reader_summary_brief_surface.dart';

final class _CitationSourceContext {
  const _CitationSourceContext({
    required this.title,
    required this.providerKey,
    required this.read,
    this.canonicalUrl,
  });

  final String title;
  final String providerKey;
  final TopRead read;
  final String? canonicalUrl;
}

Map<String, _CitationSourceContext> _primaryCitationSourceById(
  List<TopRead> reads,
) {
  final sources = <String, _CitationSourceContext>{};
  for (final read in reads) {
    final primaryCitationId = _firstNonEmptyCitationId(read.citationIds);
    if (primaryCitationId == null) {
      continue;
    }
    sources.putIfAbsent(
      primaryCitationId,
      () => _CitationSourceContext(
        title: _shortTitle(read.title),
        providerKey: read.providerKey,
        canonicalUrl: read.canonicalUrl,
        read: read,
      ),
    );
  }
  return sources;
}

List<SummaryCitation> _uniqueCitationSources(
  Iterable<SummaryCitation> citations,
) {
  final seen = <String>{};
  final result = <SummaryCitation>[];
  for (final citation in citations) {
    if (seen.add(_citationSourceIdentity(citation))) {
      result.add(citation);
    }
  }
  return result;
}

String? _firstNonEmptyCitationId(Iterable<String> citationIds) {
  for (final citationId in citationIds) {
    final normalized = citationId.trim();
    if (normalized.isNotEmpty) {
      return normalized;
    }
  }
  return null;
}

String _citationSourceIdentity(SummaryCitation citation) {
  final canonicalUrl = _normalizedSourceIdentityPart(citation.canonicalUrl);
  if (canonicalUrl != null) {
    return 'url:$canonicalUrl';
  }

  final providerKey =
      _normalizedSourceIdentityPart(citation.providerKey) ?? 'unknown';
  final sourceItemId = _normalizedSourceIdentityPart(citation.sourceItemId);
  if (sourceItemId != null) {
    return 'source-item:$providerKey:$sourceItemId';
  }

  final feedItemId = _normalizedSourceIdentityPart(citation.feedItemId);
  if (feedItemId != null) {
    return 'feed-item:$feedItemId';
  }

  return 'citation:${citation.id.trim().toLowerCase()}';
}

String? _normalizedSourceIdentityPart(String? value) {
  final normalized = value?.trim().toLowerCase();
  if (normalized == null || normalized.isEmpty) {
    return null;
  }
  return normalized;
}
