import '../../domain/entities/summary_citation.dart';

String? readerSummaryDisplayCitationSnippet(SummaryCitation citation) {
  final value = citation.safeSnippet.trim();
  if (value.isEmpty || readerSummaryIsTechnicalEvidenceText(value)) {
    return null;
  }
  return value;
}

bool readerSummaryIsTechnicalEvidenceText(String value) {
  final lower = value.toLowerCase();
  return lower.startsWith('story signal score') ||
      lower.contains('citation references title evidence') ||
      lower.contains('citation references bodypreview evidence') ||
      lower.contains('source item source-binding') ||
      lower.contains('bodypreview evidence from source item');
}
