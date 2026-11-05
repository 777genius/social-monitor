const _newsAggregatorHosts = {'news.google.com'};
const _publisherSeparator = ' - ';
const _maxPublisherLength = 120;

/// Real publisher of a Google News item, read from the title suffix.
///
/// Google News RSS titles look like "Chip export rules tighten - Reuters".
/// The aggregator is not the publisher, so the news block keeps at most one
/// post per real publisher. Returns a case-folded publisher key, or `null`
/// when the item is not from the aggregator or no publisher can be read; a
/// `null` publisher is never deduplicated.
///
/// Mirrors `readerPromotionNewsPublisher` in
/// `libs/summary/domain/policies/reader-promotion-news-publisher.ts`,
/// including its JavaScript whitespace rules.
String? readerPromotionNewsPublisher({
  required String canonicalIdentity,
  required String title,
}) {
  if (!_newsAggregatorHosts.contains(_hostOf(canonicalIdentity))) return null;
  // JavaScript `\s` with the `u` flag; Dart RegExp uses the same classes.
  final normalized = _trimSpaces(
    title.replaceAll(RegExp(r'\s+', unicode: true), ' '),
  );
  final index = normalized.lastIndexOf(_publisherSeparator);
  if (index <= 0) return null;
  final publisher = _trimSpaces(
    normalized.substring(index + _publisherSeparator.length),
  );
  if (publisher.isEmpty || publisher.length > _maxPublisherLength) return null;
  return publisher.toLowerCase();
}

String _hostOf(String canonicalIdentity) {
  final identity = canonicalIdentity
      .trim()
      .replaceFirst(RegExp('^url:', caseSensitive: false), '')
      .trim();
  final uri = Uri.tryParse(
    identity.startsWith('//') ? 'https:$identity' : identity,
  );
  return uri == null || uri.scheme.isEmpty ? '' : uri.host.toLowerCase();
}

/// After whitespace runs are folded to one space, JavaScript `trim()` only
/// has plain spaces left to remove. Dart `trim()` would also drop U+0085.
String _trimSpaces(String value) {
  var start = 0;
  var end = value.length;
  while (start < end && value.codeUnitAt(start) == 0x20) {
    start += 1;
  }
  while (end > start && value.codeUnitAt(end - 1) == 0x20) {
    end -= 1;
  }
  return value.substring(start, end);
}
