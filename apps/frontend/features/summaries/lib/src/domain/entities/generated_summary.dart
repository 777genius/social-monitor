import '../value_objects/summary_generation_status.dart';
import '../value_objects/summary_id.dart';
import 'summary_citation.dart';

final class GeneratedSummary {
  const GeneratedSummary({
    required this.id,
    required this.title,
    required this.bodyPreview,
    required this.status,
    required this.citations,
    required this.freshnessLabel,
    required this.feedbackSubmitted,
  });

  final SummaryId id;
  final String title;
  final String bodyPreview;
  final SummaryGenerationStatus status;
  final List<SummaryCitation> citations;
  final String freshnessLabel;
  final bool feedbackSubmitted;
}
