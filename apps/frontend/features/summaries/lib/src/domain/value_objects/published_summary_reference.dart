import 'summary_period.dart';

final class PublishedSummaryReference {
  const PublishedSummaryReference({
    required this.summaryId,
    required this.period,
  });

  final String summaryId;
  final SummaryPeriod period;
}
