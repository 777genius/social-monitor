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
    collectionCoverageState: _collectionCoverageState(
      dto.collectionCoverageState,
    ),
    degradedProviderKeys: dto.degradedProviderKeys
        .map(_nonEmptyProviderKey)
        .where((providerKey) => providerKey != 'unknown')
        .toSet()
        .toList(growable: false),
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
    collectionHealth: dto.collectionHealth == null
        ? null
        : _readerSummaryProviderCollectionHealthToDomain(dto.collectionHealth!),
  );
}

ReaderSummaryProviderCollectionHealth
_readerSummaryProviderCollectionHealthToDomain(
  ReaderSummaryProviderCollectionHealthApiDto dto,
) {
  return ReaderSummaryProviderCollectionHealth(
    state:
        _collectionCoverageState(dto.state) ??
        ReaderSummaryCollectionCoverageState.unknown,
    scanCount: _safeCoverageCount(dto.scanCount),
    targetItemCount: _safeNullableCoverageCount(dto.targetItemCount),
    collectedItemCount: _safeCoverageCount(dto.collectedItemCount),
    acceptedItemCount: _safeCoverageCount(dto.acceptedItemCount),
    insertedItemCount: _safeCoverageCount(dto.insertedItemCount),
    outsideWindowItemCount: _safeCoverageCount(dto.outsideWindowItemCount),
    paginationDuplicateItemCount: _safeCoverageCount(
      dto.paginationDuplicateItemCount,
    ),
    storageDuplicateItemCount: _safeCoverageCount(
      dto.storageDuplicateItemCount,
    ),
    pageCount: _safeCoverageCount(dto.pageCount),
    paginationStopReasons: dto.paginationStopReasons
        .map((reason) => reason.trim())
        .where((reason) => reason.isNotEmpty)
        .toSet()
        .toList(growable: false),
    failureKinds: dto.failureKinds
        .map((kind) => kind.trim())
        .where((kind) => kind.isNotEmpty)
        .toSet()
        .toList(growable: false),
    rateLimitEventCount: _safeCoverageCount(dto.rateLimitEventCount),
    oldestAcceptedPublishedAt: dto.oldestAcceptedPublishedAt,
    newestAcceptedPublishedAt: dto.newestAcceptedPublishedAt,
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

ReaderSummaryCollectionCoverageState? _collectionCoverageState(String? value) {
  return switch (value?.trim().toLowerCase()) {
    'complete' => ReaderSummaryCollectionCoverageState.complete,
    'partial' => ReaderSummaryCollectionCoverageState.partial,
    'degraded' => ReaderSummaryCollectionCoverageState.degraded,
    'unavailable' => ReaderSummaryCollectionCoverageState.unavailable,
    null || '' => null,
    _ => ReaderSummaryCollectionCoverageState.unknown,
  };
}
