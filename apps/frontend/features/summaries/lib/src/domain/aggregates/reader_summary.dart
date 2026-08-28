import '../entities/reader_action.dart';
import '../entities/reader_interest_section.dart';
import '../entities/reader_summary_narrative_section.dart';
import '../entities/reader_summary_topic_map.dart';
import '../entities/reader_trend_delta.dart';
import '../entities/repeated_signal.dart';
import '../entities/source_mix_entry.dart';
import '../entities/summary_citation.dart';
import '../entities/summary_claim.dart';
import '../entities/summary_reliability.dart';
import '../entities/summary_story.dart';
import '../entities/top_read.dart';
import '../value_objects/published_summary_reference.dart';
import '../value_objects/reader_summary_coverage.dart';
import '../value_objects/summary_period.dart';
import '../value_objects/summary_quality.dart';
import '../value_objects/summary_window.dart';

export '../entities/reader_action.dart';
export '../entities/reader_interest_section.dart';
export '../entities/reader_summary_narrative_section.dart';
export '../entities/reader_summary_topic_map.dart';
export '../entities/reader_trend_delta.dart';
export '../entities/repeated_signal.dart';
export '../entities/source_mix_entry.dart';
export '../entities/summary_claim.dart';
export '../entities/summary_reliability.dart';
export '../entities/summary_story.dart';
export '../entities/top_read.dart';
export '../value_objects/preview_media.dart';
export '../value_objects/provider_metric_label.dart';
export '../value_objects/published_summary_reference.dart';
export '../value_objects/reader_post_promotion_attestation.dart';
export '../value_objects/reader_summary_coverage.dart';
export '../value_objects/signal_score.dart';
export '../value_objects/summary_period.dart';
export '../value_objects/summary_quality.dart';
export '../value_objects/summary_window.dart';

final class WorkspaceSummarySnapshot {
  const WorkspaceSummarySnapshot({
    this.current,
    this.availablePeriods = const [],
    this.availableSummaryReferences = const [],
    this.availablePeriodsAreComplete = false,
  });

  final ReaderSummary? current;
  final List<SummaryPeriod> availablePeriods;
  final List<PublishedSummaryReference> availableSummaryReferences;
  final bool availablePeriodsAreComplete;
}

final class ReaderSummary {
  const ReaderSummary({
    required this.id,
    required this.title,
    required this.executiveSummary,
    required this.userId,
    required this.content,
    required this.topStories,
    required this.repeatedSignals,
    required this.citations,
    required this.period,
    this.generatedAt,
    required this.summaryWindow,
    required this.freshnessLabel,
    required this.isDegraded,
    this.coverage,
  });

  final String id;
  final String title;
  final String executiveSummary;
  final String? userId;
  final ReaderSummaryContent content;
  final List<SummaryStory> topStories;
  final List<RepeatedSignal> repeatedSignals;
  final List<SummaryCitation> citations;
  final SummaryPeriod period;
  final DateTime? generatedAt;
  final SummaryWindow summaryWindow;
  final String freshnessLabel;
  final bool isDegraded;
  final ReaderSummaryCoverage? coverage;
}

final class ReaderSummaryContent {
  const ReaderSummaryContent({
    required this.headline,
    required this.oneLineTakeaway,
    required this.bullets,
    this.narrativeSections = const [],
    this.mainTopics = const [],
    this.topicMap = emptyReaderSummaryTopicMap,
    required this.qualityState,
    required this.interestSections,
    required this.sourceMix,
    required this.topReads,
    this.selectedPosts = const [],
    this.claimBoard = const [],
    this.reliabilityReport = emptySummaryReliabilityReport,
    required this.trendDelta,
    required this.openQuestions,
    required this.risks,
    required this.nextActions,
    this.promotionBoardAvailability =
        ReaderSummaryPromotionBoardAvailability.available,
  });

  final String headline;
  final String oneLineTakeaway;
  final List<String> bullets;
  final List<ReaderSummaryNarrativeSection> narrativeSections;
  final List<String> mainTopics;
  final ReaderSummaryTopicMap topicMap;
  final ReaderSummaryQualityState qualityState;
  final List<ReaderInterestSection> interestSections;
  final List<SourceMixEntry> sourceMix;
  final List<TopRead> topReads;
  final List<TopRead> selectedPosts;
  final List<SummaryClaim> claimBoard;
  final SummaryReliabilityReport reliabilityReport;
  final ReaderTrendDelta trendDelta;
  final List<String> openQuestions;
  final List<String> risks;
  final List<ReaderAction> nextActions;
  final ReaderSummaryPromotionBoardAvailability promotionBoardAvailability;
}

enum ReaderSummaryPromotionBoardAvailability { available, unavailable }
