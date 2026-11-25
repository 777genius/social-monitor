import '../../domain/aggregates/reader_summary.dart';

final _uuidPattern = RegExp(
  r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
  caseSensitive: false,
);

// Machine-oriented matched rules (`interest:<uuid>`, `source-binding:<uuid>`,
// `provider:reddit`) are wiring metadata, not reader-facing tags. Keep only
// human-readable labels and drop id-bearing or prefixed technical rules.
const _technicalTagPrefixes = {
  'interest',
  'source-binding',
  'sourcebinding',
  'provider',
  'rule',
  'binding',
  'scope',
};

/// Returns a reader-facing tag for a matched rule, or null to hide it.
String? readablePostTag(String rule) {
  final trimmed = rule.trim();
  if (trimmed.isEmpty || _uuidPattern.hasMatch(trimmed)) {
    return null;
  }
  final colon = trimmed.indexOf(':');
  if (colon > 0) {
    final prefix = trimmed.substring(0, colon).trim().toLowerCase();
    if (_technicalTagPrefixes.contains(prefix)) {
      return null;
    }
  }
  return trimmed;
}

/// Secondary source line for a top post row, derived from the canonical URL:
/// `@cursor_ai` for X, `r/LocalLLaMA` for Reddit, otherwise the host.
String? topPostSourceHandle(TopRead read) {
  final url = read.canonicalUrl;
  if (url == null || url.trim().isEmpty) {
    return null;
  }
  final uri = Uri.tryParse(url.trim());
  if (uri == null || uri.host.isEmpty) {
    return null;
  }
  final host = uri.host.replaceFirst('www.', '').toLowerCase();
  final segments = uri.pathSegments
      .where((segment) => segment.trim().isNotEmpty)
      .toList(growable: false);

  if ((host == 'x.com' || host == 'twitter.com') && segments.isNotEmpty) {
    return '@${segments.first}';
  }
  if (host.endsWith('reddit.com') &&
      segments.length >= 2 &&
      segments.first == 'r') {
    return 'r/${segments[1]}';
  }
  return host;
}
