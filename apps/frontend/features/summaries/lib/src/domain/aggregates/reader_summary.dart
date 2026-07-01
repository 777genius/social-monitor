import '../entities/reader_action.dart';
import '../entities/reader_interest_section.dart';
import '../entities/reader_trend_delta.dart';
import '../entities/repeated_signal.dart';
import '../entities/source_mix_entry.dart';
import '../entities/summary_citation.dart';
import '../entities/summary_story.dart';
import '../entities/top_read.dart';
import '../value_objects/summary_period.dart';
import '../value_objects/summary_quality.dart';
import '../value_objects/summary_window.dart';

export '../entities/reader_action.dart';
export '../entities/reader_interest_section.dart';
export '../entities/reader_trend_delta.dart';
export '../entities/repeated_signal.dart';
export '../entities/source_mix_entry.dart';
export '../entities/summary_story.dart';
export '../entities/top_read.dart';
export '../value_objects/preview_media.dart';
export '../value_objects/provider_metric_label.dart';
export '../value_objects/signal_score.dart';
export '../value_objects/summary_period.dart';
export '../value_objects/summary_quality.dart';
export '../value_objects/summary_window.dart';

final class WorkspaceSummarySnapshot {
  const WorkspaceSummarySnapshot({
    this.current,
    this.availablePeriods = const [],
  });

  final ReaderSummary? current;
  final List<SummaryPeriod> availablePeriods;
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
    required this.summaryWindow,
    required this.freshnessLabel,
    required this.isDegraded,
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
  final SummaryWindow summaryWindow;
  final String freshnessLabel;
  final bool isDegraded;
}

final class ReaderSummaryContent {
  const ReaderSummaryContent({
    required this.headline,
    required this.oneLineTakeaway,
    required this.bullets,
    required this.qualityState,
    required this.interestSections,
    required this.sourceMix,
    required this.topReads,
    required this.trendDelta,
    required this.openQuestions,
    required this.risks,
    required this.nextActions,
  });

  final String headline;
  final String oneLineTakeaway;
  final List<String> bullets;
  final ReaderSummaryQualityState qualityState;
  final List<ReaderInterestSection> interestSections;
  final List<SourceMixEntry> sourceMix;
  final List<TopRead> topReads;
  final ReaderTrendDelta trendDelta;
  final List<String> openQuestions;
  final List<String> risks;
  final List<ReaderAction> nextActions;
}
