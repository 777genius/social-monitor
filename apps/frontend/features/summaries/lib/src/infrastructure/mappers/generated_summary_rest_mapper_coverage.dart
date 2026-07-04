part of 'generated_summary_rest_mapper.dart';

ReaderSummaryCoverageApiDto? _readerSummaryCoverage(
  generated.ReaderSummaryCoverageSummaryDto? coverage,
) {
  if (coverage == null) {
    return null;
  }

  return ReaderSummaryCoverageApiDto(
    collectedFeedItemCount: coverage.collectedFeedItemCount == null
        ? null
        : _safeGeneratedCount(coverage.collectedFeedItemCount!),
    selectedFeedItemCount: _safeGeneratedCount(coverage.selectedFeedItemCount),
    topReadCount: _safeGeneratedCount(coverage.topReadCount),
    citationCount: _safeGeneratedCount(coverage.citationCount),
    providerBreakdown:
        coverage.providerBreakdown
            ?.map(_readerSummaryProviderCoverage)
            .toList(growable: false) ??
        const [],
  );
}

ReaderSummaryProviderCoverageApiDto _readerSummaryProviderCoverage(
  generated.ReaderSummaryProviderCoverageDto provider,
) {
  return ReaderSummaryProviderCoverageApiDto(
    providerKey: provider.providerKey,
    collectedFeedItemCount: provider.collectedFeedItemCount == null
        ? null
        : _safeGeneratedCount(provider.collectedFeedItemCount!),
    selectedFeedItemCount: _safeGeneratedCount(provider.selectedFeedItemCount),
    topReadCount: _safeGeneratedCount(provider.topReadCount),
    citationCount: _safeGeneratedCount(provider.citationCount),
  );
}

int _safeGeneratedCount(num value) {
  if (value.isNaN || value.isInfinite || value < 0) {
    return 0;
  }
  return value.round();
}
