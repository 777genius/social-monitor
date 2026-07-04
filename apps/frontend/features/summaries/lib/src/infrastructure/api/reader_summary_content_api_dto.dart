part of 'summary_api_dto.dart';

final class ReaderSummaryContentApiDto {
  const ReaderSummaryContentApiDto({
    required this.headline,
    required this.oneLineTakeaway,
    required this.bullets,
    this.mainTopics = const [],
    required this.interestSections,
    required this.sourceMix,
    required this.topReads,
    this.selectedPosts = const [],
    this.claimBoard = const [],
    this.reliabilityReport = emptySummaryReliabilityReportApiDto,
    required this.trendDelta,
    required this.openQuestions,
    required this.risks,
    required this.nextActions,
    this.qualityState = const ReaderSummaryQualityStateApiDto(
      status: 'ready',
      flags: [],
      warnings: [],
      isSingleSource: false,
    ),
  });

  final String headline;
  final String oneLineTakeaway;
  final List<String> bullets;
  final List<String> mainTopics;
  final ReaderSummaryQualityStateApiDto qualityState;
  final List<ReaderInterestSectionApiDto> interestSections;
  final List<SourceMixEntryApiDto> sourceMix;
  final List<TopReadApiDto> topReads;
  final List<TopReadApiDto> selectedPosts;
  final List<SummaryClaimApiDto> claimBoard;
  final SummaryReliabilityReportApiDto reliabilityReport;
  final ReaderTrendDeltaApiDto trendDelta;
  final List<String> openQuestions;
  final List<String> risks;
  final List<ReaderActionApiDto> nextActions;
}
