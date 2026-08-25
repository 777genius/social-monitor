import '../../domain/aggregates/reader_summary.dart';
import '../../domain/entities/summary_citation.dart';

bool readerSummaryHasCrossSourceSupport(
  TopRead item,
  List<SummaryCitation> citations,
) {
  final providerCount =
      [
            ...item.confirmedProviderKeys,
            ...citations.map((citation) => citation.providerKey ?? ''),
          ]
          .map((providerKey) => providerKey.trim().toLowerCase())
          .where((providerKey) => providerKey.isNotEmpty)
          .toSet()
          .length;

  if (providerCount > 1) {
    return true;
  }

  final evidenceText = '${item.reason} ${item.whyNow}'.toLowerCase();
  return evidenceText.contains('cross-source');
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
