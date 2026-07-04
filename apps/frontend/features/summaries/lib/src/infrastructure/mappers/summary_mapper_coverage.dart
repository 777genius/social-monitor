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
    collectedFeedItemCount: _safeNullableCoverageCount(
      dto.collectedFeedItemCount,
    ),
    providerBreakdown: dto.providerBreakdown
        .map(_readerSummaryProviderCoverageToDomain)
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
    collectedFeedItemCount: _safeNullableCoverageCount(
      dto.collectedFeedItemCount,
    ),
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
