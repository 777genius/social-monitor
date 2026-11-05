// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_claim_dto.dart';
import 'reader_summary_narrative_section_dto.dart';
import 'reader_summary_next_action_dto.dart';
import 'reader_summary_reader_interest_section_dto.dart';
import 'reader_summary_reader_item_dto.dart';
import 'reader_summary_reader_quality_state_dto.dart';
import 'reader_summary_reliability_report_dto.dart';
import 'reader_summary_source_mix_entry_dto.dart';
import 'reader_summary_topic_map_dto.dart';
import 'reader_summary_trend_delta_dto.dart';

part 'reader_summary_reader_brief_dto.g.dart';

@JsonSerializable()
class ReaderSummaryReaderBriefDto {
  const ReaderSummaryReaderBriefDto({
    required this.bullets,
    required this.claimBoard,
    required this.headline,
    required this.interestSections,
    required this.mainTopics,
    required this.narrativeSections,
    required this.newsWithoutRatingPosts,
    required this.nextActions,
    required this.oneLineTakeaway,
    required this.openQuestions,
    required this.qualityState,
    required this.reliabilityReport,
    required this.risks,
    required this.selectedPosts,
    required this.sourceMix,
    required this.topicMap,
    required this.topReads,
    required this.trendDelta,
  });

  factory ReaderSummaryReaderBriefDto.fromJson(Map<String, Object?> json) =>
      _$ReaderSummaryReaderBriefDtoFromJson(json);

  final List<String> bullets;
  final List<ReaderSummaryClaimDto> claimBoard;
  final String headline;
  final List<ReaderSummaryReaderInterestSectionDto> interestSections;
  final List<String> mainTopics;
  final List<ReaderSummaryNarrativeSectionDto> narrativeSections;

  /// News without rating: posts from sources without a popularity rating (for example RSS). Never part of topReads or selectedPosts; one post per story, ordered by usefulness then publishedAt descending. Each item carries promotionAttestation.placement = "news" and signalScore = 0.
  final List<ReaderSummaryReaderItemDto> newsWithoutRatingPosts;
  final List<ReaderSummaryNextActionDto> nextActions;
  final String oneLineTakeaway;
  final List<String> openQuestions;
  final ReaderSummaryReaderQualityStateDto qualityState;
  final ReaderSummaryReliabilityReportDto reliabilityReport;
  final List<String> risks;

  /// "Show more" for Top: ranked posts after the first 12, same order, followed by supplemental GitHub Trending rows.
  final List<ReaderSummaryReaderItemDto> selectedPosts;
  final List<ReaderSummarySourceMixEntryDto> sourceMix;
  final ReaderSummaryTopicMapDto topicMap;

  /// Top posts: ranked sources only, ordered by the hybrid score 0.4 * model (important 1.0, useful 0.5) + 0.6 * popularity percentile inside the source network (0 when the metric is unknown), then publishedAt descending.
  final List<ReaderSummaryReaderItemDto> topReads;
  final ReaderSummaryTrendDeltaDto trendDelta;

  Map<String, Object?> toJson() => _$ReaderSummaryReaderBriefDtoToJson(this);
}
