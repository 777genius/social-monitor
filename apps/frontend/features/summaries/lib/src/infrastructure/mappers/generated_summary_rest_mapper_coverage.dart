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
    lowRelevanceFeedItemCount: _safeGeneratedCount(
      coverage.lowRelevanceFeedItemCount,
    ),
    mutedFeedItemCount: _safeGeneratedCount(coverage.mutedFeedItemCount),
    userRatedFeedItemCount: _safeGeneratedCount(
      coverage.userRatedFeedItemCount,
    ),
    selectedFeedItemCount: _safeGeneratedCount(coverage.selectedFeedItemCount),
    topReadCount: _safeGeneratedCount(coverage.topReadCount),
    citationCount: _safeGeneratedCount(coverage.citationCount),
    providerBreakdown:
        coverage.providerBreakdown
            ?.map(_readerSummaryProviderCoverage)
            .toList(growable: false) ??
        const [],
    topicBreakdown:
        coverage.topicBreakdown
            ?.map(_readerSummaryTopicCoverage)
            .toList(growable: false) ??
        const [],
    queryBreakdown:
        coverage.queryBreakdown
            ?.map(_readerSummaryQueryCoverage)
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
    lowRelevanceFeedItemCount: _safeGeneratedCount(
      provider.lowRelevanceFeedItemCount,
    ),
    mutedFeedItemCount: _safeGeneratedCount(provider.mutedFeedItemCount),
    userRatedFeedItemCount: _safeGeneratedCount(
      provider.userRatedFeedItemCount,
    ),
    selectedFeedItemCount: _safeGeneratedCount(provider.selectedFeedItemCount),
    topReadCount: _safeGeneratedCount(provider.topReadCount),
    citationCount: _safeGeneratedCount(provider.citationCount),
  );
}

ReaderSummaryTopicCoverageApiDto _readerSummaryTopicCoverage(
  generated.ReaderSummaryTopicCoverageDto topic,
) {
  return ReaderSummaryTopicCoverageApiDto(
    topicKey: topic.topicKey,
    topicLabel: topic.topicLabel,
    collectedFeedItemCount: _safeGeneratedCount(topic.collectedFeedItemCount),
    lowRelevanceFeedItemCount: _safeGeneratedCount(
      topic.lowRelevanceFeedItemCount,
    ),
    mutedFeedItemCount: _safeGeneratedCount(topic.mutedFeedItemCount),
    userRatedFeedItemCount: _safeGeneratedCount(topic.userRatedFeedItemCount),
  );
}

ReaderSummaryQueryCoverageApiDto _readerSummaryQueryCoverage(
  generated.ReaderSummaryQueryCoverageDto query,
) {
  return ReaderSummaryQueryCoverageApiDto(
    query: query.query,
    collectedFeedItemCount: _safeGeneratedCount(query.collectedFeedItemCount),
    lowRelevanceFeedItemCount: _safeGeneratedCount(
      query.lowRelevanceFeedItemCount,
    ),
    mutedFeedItemCount: _safeGeneratedCount(query.mutedFeedItemCount),
    userRatedFeedItemCount: _safeGeneratedCount(query.userRatedFeedItemCount),
  );
}

int _safeGeneratedCount(num value) {
  if (value.isNaN || value.isInfinite || value < 0) {
    return 0;
  }
  return value.round();
}
