part of 'summary_api_dto.dart';

final class WorkspaceSummaryApiDto {
  const WorkspaceSummaryApiDto({
    this.current,
    this.availablePeriods = const [],
    this.availableSummaryReferences = const [],
    this.availablePeriodsAreComplete = false,
  });

  final ReaderSummaryApiDto? current;
  final List<SummaryPeriodApiDto> availablePeriods;
  final List<PublishedSummaryReferenceApiDto> availableSummaryReferences;
  final bool availablePeriodsAreComplete;
}

final class PublishedSummaryReferenceApiDto {
  const PublishedSummaryReferenceApiDto({
    required this.summaryId,
    required this.period,
  });

  final String summaryId;
  final SummaryPeriodApiDto period;
}
