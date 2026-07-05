part of 'summary_mapper.dart';

ReaderSummaryCoverage? _readerSummaryCoverageToDomainHelper(
  ReaderSummaryCoverageApiDto? dto,
) {
  if (dto == null) {
    return null;
  }

  return ReaderSummaryCoverage(
    selectedFeedItemCount: _safeCoverageCount(dto.selectedFeedItemCount),
    topReadCount: _safeCoverageCount(dto.topReadCount),
    citationCount: _safeCoverageCount(dto.citationCount),
    lowRelevanceFeedItemCount: _safeCoverageCount(
      dto.lowRelevanceFeedItemCount,
    ),
    mutedFeedItemCount: _safeCoverageCount(dto.mutedFeedItemCount),
    userRatedFeedItemCount: _safeCoverageCount(dto.userRatedFeedItemCount),
    collectedFeedItemCount: _safeNullableCoverageCount(
      dto.collectedFeedItemCount,
    ),
    providerBreakdown: dto.providerBreakdown
        .map(_readerSummaryProviderCoverageToDomain)
        .toList(growable: false),
    topicBreakdown: dto.topicBreakdown
        .map(_readerSummaryTopicCoverageToDomain)
        .toList(growable: false),
    queryBreakdown: dto.queryBreakdown
        .map(_readerSummaryQueryCoverageToDomain)
        .toList(growable: false),
  );
}

ReaderSummaryProviderCoverage _readerSummaryProviderCoverageToDomain(
  ReaderSummaryProviderCoverageApiDto dto,
) {
  return ReaderSummaryProviderCoverage(
    providerKey: _nonEmptyProviderKey(dto.providerKey),
    selectedFeedItemCount: _safeCoverageCount(dto.selectedFeedItemCount),
    topReadCount: _safeCoverageCount(dto.topReadCount),
    citationCount: _safeCoverageCount(dto.citationCount),
    lowRelevanceFeedItemCount: _safeCoverageCount(
      dto.lowRelevanceFeedItemCount,
    ),
    mutedFeedItemCount: _safeCoverageCount(dto.mutedFeedItemCount),
    userRatedFeedItemCount: _safeCoverageCount(dto.userRatedFeedItemCount),
    collectedFeedItemCount: _safeNullableCoverageCount(
      dto.collectedFeedItemCount,
    ),
  );
}

ReaderSummaryTopicCoverage _readerSummaryTopicCoverageToDomain(
  ReaderSummaryTopicCoverageApiDto dto,
) {
  return ReaderSummaryTopicCoverage(
    topicKey: _nonEmptyCoverageLabel(dto.topicKey),
    topicLabel: _nullableCoverageLabel(dto.topicLabel),
    collectedFeedItemCount: _safeCoverageCount(dto.collectedFeedItemCount),
    lowRelevanceFeedItemCount: _safeCoverageCount(
      dto.lowRelevanceFeedItemCount,
    ),
    mutedFeedItemCount: _safeCoverageCount(dto.mutedFeedItemCount),
    userRatedFeedItemCount: _safeCoverageCount(dto.userRatedFeedItemCount),
  );
}

ReaderSummaryQueryCoverage _readerSummaryQueryCoverageToDomain(
  ReaderSummaryQueryCoverageApiDto dto,
) {
  return ReaderSummaryQueryCoverage(
    query: _nonEmptyCoverageLabel(dto.query),
    collectedFeedItemCount: _safeCoverageCount(dto.collectedFeedItemCount),
    lowRelevanceFeedItemCount: _safeCoverageCount(
      dto.lowRelevanceFeedItemCount,
    ),
    mutedFeedItemCount: _safeCoverageCount(dto.mutedFeedItemCount),
    userRatedFeedItemCount: _safeCoverageCount(dto.userRatedFeedItemCount),
  );
}

int _safeCoverageCount(int value) {
  return value < 0 ? 0 : value;
}

int? _safeNullableCoverageCount(int? value) {
  return value == null ? null : _safeCoverageCount(value);
}

String _nonEmptyProviderKey(String value) {
  final trimmed = value.trim();
  return trimmed.isEmpty ? 'unknown' : trimmed;
}

String _nonEmptyCoverageLabel(String value) {
  final trimmed = value.trim();
  return trimmed.isEmpty ? 'unknown' : trimmed;
}

String? _nullableCoverageLabel(String? value) {
  final trimmed = value?.trim();
  return trimmed == null || trimmed.isEmpty ? null : trimmed;
}
