import '../../domain/aggregates/reader_summary.dart';
import 'reader_summary_source_text.dart';

String readerSummaryDisplayReason(TopRead item) {
  for (final value in [item.reason, ...item.whyImportant]) {
    if (_isReaderFacingReason(value)) {
      return _reasonCopy(item, value);
    }
  }

  return readerSummaryNeedsSourceDisclosure(item.title)
      ? 'See source text for full context.'
      : 'Source-reported: ${item.title}';
}

List<String> readerSummaryDisplayWhyImportant(TopRead item) {
  final values = <String>[];
  for (final value in item.whyImportant) {
    if (_isReaderFacingReason(value)) {
      values.add(_reasonCopy(item, value));
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

String _reasonCopy(TopRead item, String value) {
  if (readerSummaryNeedsSourceDisclosure(item.title) &&
      value.contains(item.title)) {
    return 'See source text for full context.';
  }
  return _stripTrailingPeriod(value);
}
