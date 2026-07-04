import '../../domain/aggregates/reader_summary.dart';
import 'summary_period_formats.dart';

/// Plain-text export of the current workspace summary for the clipboard.
String buildSummaryExportText(ReaderSummary summary) {
  final buffer = StringBuffer()
    ..writeln(summary.title)
    ..writeln('Period: ${summaryPeriodToolbarLabel(summary.period)}')
    ..writeln(
      'Collection window (UTC): '
      '${summaryPeriodCollectionWindowLabel(summary.period)}',
    )
    ..writeln()
    ..writeln(summary.executiveSummary.trim());

  if (summary.citations.isNotEmpty) {
    buffer
      ..writeln()
      ..writeln('Citations:');
    for (final citation in summary.citations) {
      final url = citation.canonicalUrl;
      buffer.writeln(
        '- ${citation.sourceLabel}${url == null ? '' : ' ($url)'}',
      );
    }
  }
  return buffer.toString();
}
