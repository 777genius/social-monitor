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
  return value
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
