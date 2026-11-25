import '../../domain/value_objects/summary_period.dart';
import '../api/summary_api_dto.dart';

ReaderSummaryApiDto readerSummaryForPeriod(
  ReaderSummaryApiDto summary,
  SummaryPeriod period,
) {
  return ReaderSummaryApiDto(
    id: summary.id,
    title: summary.title,
    executiveSummary: summary.executiveSummary,
    userId: summary.userId,
    content: summary.content,
    topStories: summary.topStories,
    storyClusterIds: summary.storyClusterIds,
    storyClusterAuthorities: summary.storyClusterAuthorities,
    repeatedSignals: summary.repeatedSignals,
    citations: summary.citations,
    period: SummaryPeriodApiDto(
      cadence: period.cadence.name,
      startedAt: period.startedAt,
      endedAt: period.endedAt,
      timezone: period.timezone,
      periodKey: period.periodKey,
    ),
    generatedAt: summary.generatedAt,
    sourceWindow: summary.sourceWindow,
    freshnessLabel: summary.freshnessLabel,
    isDegraded: summary.isDegraded,
    coverage: summary.coverage,
  );
}
