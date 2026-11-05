import '../../domain/aggregates/reader_summary.dart';
import '../../domain/entities/summary_citation.dart';
import '../../domain/value_objects/reader_summary_provider_family.dart';

bool readerSummaryHasCrossSourceSupport(
  TopRead item,
  List<SummaryCitation> citations,
) {
  final providerCount =
      [
            ...item.confirmedProviderKeys,
            ...citations.map((citation) => citation.providerKey ?? ''),
          ]
          .map(readerSummaryIndependentProviderFamily)
          .where((providerFamily) => providerFamily.isNotEmpty)
          .toSet()
          .length;

  return providerCount > 1;
}

String? readerSummarySourceSupportBadge(
  TopRead item,
  List<SummaryCitation> citations,
) {
  if (readerSummaryHasCrossSourceSupport(item, citations)) {
    return 'cross-source';
  }
  return null;
}
