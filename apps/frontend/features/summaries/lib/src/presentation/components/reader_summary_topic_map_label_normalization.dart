part of 'reader_summary_brief_surface.dart';

String _compactTopicMapDisplayLabel(String value) {
  final withoutHeadlineEnvelope = value
      .replaceFirst(RegExp(r'^(?:\[\d+\]\s*)+'), '')
      .replaceFirst(RegExp(r'^(?:ask|show)\s+hn:\s*', caseSensitive: false), '')
      .replaceFirst(
        RegExp(
          r'^(?:why|how|what|when|where|who|should|could|would)\s+',
          caseSensitive: false,
        ),
        '',
      );
  final withIdentifierBoundaries = withoutHeadlineEnvelope
      .replaceAll(RegExp(r'[/_]+'), ' ')
      .replaceAllMapped(
        RegExp(r'([A-Z]+)([A-Z][a-z])'),
        (match) => '${match.group(1)} ${match.group(2)}',
      )
      .replaceAllMapped(
        RegExp(r'([a-z0-9])([A-Z][a-z])'),
        (match) => '${match.group(1)} ${match.group(2)}',
      )
      .replaceAllMapped(
        RegExp(r'([A-Za-z])-([A-Za-z])'),
        (match) => '${match.group(1)} ${match.group(2)}',
      )
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();
  final separatedInitialisms = withIdentifierBoundaries
      .split(' ')
      .map(_separateLongStemInitialism)
      .join(' ');

  return _deduplicateAdjacentTopicLabelTokens(separatedInitialisms);
}

String _separateLongStemInitialism(String token) {
  final match = RegExp(r'^(.{4,}[a-z0-9])([A-Z]{2,})$').firstMatch(token);
  if (match == null) {
    return token;
  }

  return '${match.group(1)} ${match.group(2)}';
}

String _deduplicateAdjacentTopicLabelTokens(String value) {
  final result = <String>[];
  for (final token in value.split(' ').where((token) => token.isNotEmpty)) {
    if (result.isEmpty || result.last.toLowerCase() != token.toLowerCase()) {
      result.add(token);
    }
  }

  return result.join(' ');
}
