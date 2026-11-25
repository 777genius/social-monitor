part of 'summary_mapper.dart';

String _sanitizeText(String raw) {
  return _readerFacingSummaryText(
    _redactReaderText(raw),
  ).replaceAll(RegExp(r'\s+'), ' ').trim();
}

String _sanitizeLongText(String raw) {
  return _readerFacingSummaryText(_redactReaderText(raw))
      .replaceAll('\r\n', '\n')
      .replaceAll('\r', '\n')
      .split('\n')
      .map((line) => line.replaceAll(RegExp(r'[ \t]+'), ' ').trim())
      .join('\n')
      .replaceAll(RegExp(r'\n{3,}'), '\n\n')
      .trim();
}

String _redactReaderText(String raw) {
  return raw
      .replaceAll(RegExp(r'Bearer\s+[A-Za-z0-9._~+/=-]+'), '[redacted]')
      .replaceAll(RegExp(r'sk-[A-Za-z0-9_-]+'), '[redacted]')
      .replaceAll(RegExp(r'client_secret\s*[:=]\s*\S+'), '[redacted]');
}

String _readerFacingSummaryText(String value) {
  final plain = _stripReaderHtml(value);
  return plain
      .replaceAll(
        RegExp(r'\bbackend cross-provider clusters\b', caseSensitive: false),
        'confirmed cross-source matches',
      )
      .replaceAll(
        RegExp(r'\bcross-provider clusters\b', caseSensitive: false),
        'cross-source matches',
      )
      .replaceAll(
        RegExp(r'\bbroad provider coverage\b', caseSensitive: false),
        'broad source coverage',
      )
      .replaceAll(
        RegExp(r'\bprovider coverage\b', caseSensitive: false),
        'source coverage',
      )
      .replaceAll(
        RegExp(r'\bsource families\b', caseSensitive: false),
        'source groups',
      )
      .replaceAll(
        RegExp(r'\bstory clusters\b', caseSensitive: false),
        'story groups',
      );
}

String _stripReaderHtml(String value) {
  const namedEntities = {
    'nbsp': ' ',
    'amp': '&',
    'lt': '<',
    'gt': '>',
    'quot': '"',
    'apos': "'",
    'hellip': '…',
    'mdash': '—',
    'ndash': '–',
    'rsquo': '\u2019',
    'lsquo': '\u2018',
    'rdquo': '\u201d',
    'ldquo': '\u201c',
  };
  final withoutTags = value.replaceAll(RegExp(r'<[^>]*>'), ' ');
  return withoutTags.replaceAllMapped(
    RegExp(r'&(#[0-9]+|#[xX][0-9A-Fa-f]+|[A-Za-z0-9]+);'),
    (match) {
      final code = match.group(1)!;
      if (code.startsWith('#')) {
        final hex = code.length > 1 && (code[1] == 'x' || code[1] == 'X');
        final point = int.tryParse(
          hex ? code.substring(2) : code.substring(1),
          radix: hex ? 16 : 10,
        );
        return point == null ? match.group(0)! : String.fromCharCode(point);
      }
      return namedEntities[code.toLowerCase()] ?? match.group(0)!;
    },
  );
}

ReaderCapturedSource? _sanitizeCapturedSource(ReaderCapturedSource? source) {
  if (source == null) return null;
  return ReaderCapturedSource(
    title: _sanitizeText(source.title),
    body: source.body == null ? null : _sanitizeLongText(source.body!),
    captureAvailability: source.captureAvailability,
    reviewAvailability: source.reviewAvailability,
  );
}

ReaderDisplayHeadline? _sanitizeDisplayHeadline(
  ReaderDisplayHeadline? headline,
) {
  if (headline == null) return null;
  return ReaderDisplayHeadline(
    text: _sanitizeText(headline.text),
    kind: headline.kind,
  );
}
