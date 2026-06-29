import '../../domain/aggregates/reader_summary.dart';

String readerSummaryDisplayReason(TopRead item) {
  for (final value in [item.reason, ...item.whyImportant]) {
    if (_isReaderFacingReason(value)) {
      return _stripTrailingPeriod(value);
    }
  }

  return 'Source-reported: ${item.title}';
}

List<String> readerSummaryDisplayWhyImportant(TopRead item) {
  final values = <String>[];
  for (final value in item.whyImportant) {
    if (_isReaderFacingReason(value)) {
      values.add(_stripTrailingPeriod(value));
    }
  }

  if (values.isNotEmpty) {
    return values.take(3).toList(growable: false);
  }

  return [readerSummaryDisplayReason(item)];
}

bool _isReaderFacingReason(String value) {
  final lower = value.trim().toLowerCase();

  return lower.isNotEmpty &&
      !lower.startsWith('story signal score') &&
      !lower.startsWith('current summary window has') &&
      lower != 'strong source engagement signal' &&
      lower != 'passes source quality and interest relevance gate' &&
      lower != 'fresh item in the current monitoring window' &&
      !RegExp(r'^clustered \d+ (similar|related) items?$').hasMatch(lower) &&
      !lower.contains('citation references bodypreview evidence') &&
      !lower.contains('source item source-binding') &&
      !lower.contains('bodypreview evidence from source item');
}

String _stripTrailingPeriod(String value) {
  final trimmed = value.trim();
  return trimmed.endsWith('.')
      ? trimmed.substring(0, trimmed.length - 1)
      : trimmed;
}
