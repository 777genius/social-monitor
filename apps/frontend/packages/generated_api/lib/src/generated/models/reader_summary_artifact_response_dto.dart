// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_artifact_response_dto_quality_flags_quality_flags.dart';
import 'reader_summary_citation_view_dto.dart';
import 'reader_summary_confidence_dto.dart';
import 'reader_summary_context_artifact_dto.dart';
import 'reader_summary_coverage_summary_dto.dart';
import 'reader_summary_freshness_dto.dart';
import 'reader_summary_interest_highlight_dto.dart';
import 'reader_summary_lineage_dto.dart';
import 'reader_summary_period_dto.dart';
import 'reader_summary_personalization_dto.dart';
import 'reader_summary_reader_brief_dto.dart';
import 'reader_summary_repeated_signal_dto.dart';
import 'reader_summary_risk_dto.dart';
import 'reader_summary_scope_dto.dart';
import 'reader_summary_source_window_dto.dart';
import 'reader_summary_story_cluster_dto.dart';
import 'reader_summary_top_story_dto.dart';
import 'reader_summary_usage_dto.dart';

part 'reader_summary_artifact_response_dto.g.dart';

@JsonSerializable()
class ReaderSummaryArtifactResponseDto {
  const ReaderSummaryArtifactResponseDto({
    required this.citations,
    required this.confidence,
    required this.contextArtifacts,
    required this.executiveSummary,
    required this.freshness,
    required this.headline,
    required this.interestHighlights,
    required this.lineage,
    required this.period,
    required this.qualityFlags,
    required this.readerBrief,
    required this.readerSummaryId,
    required this.repeatedSignals,
    required this.risksAndUnknowns,
    required this.schemaVersion,
    required this.scope,
    required this.sourceWindow,
    required this.storyClusters,
    required this.tenantId,
    required this.topStories,
    required this.usage,
    required this.workspaceId,
    this.coverage,
    this.generatedAt,
    this.noSignalReason,
    this.personalization,
    this.subscriptionId,
    this.userId,
  });

  factory ReaderSummaryArtifactResponseDto.fromJson(
    Map<String, Object?> json,
  ) => _$ReaderSummaryArtifactResponseDtoFromJson(json);

  final List<ReaderSummaryCitationViewDto> citations;
  final ReaderSummaryConfidenceDto confidence;
  final List<ReaderSummaryContextArtifactDto> contextArtifacts;
  final ReaderSummaryCoverageSummaryDto? coverage;
  final String executiveSummary;
  final ReaderSummaryFreshnessDto freshness;
  final DateTime? generatedAt;
  final String headline;
  final List<ReaderSummaryInterestHighlightDto> interestHighlights;
  final ReaderSummaryLineageDto lineage;
  final String? noSignalReason;
  final ReaderSummaryPeriodDto period;
  final ReaderSummaryPersonalizationDto? personalization;
  final List<ReaderSummaryArtifactResponseDtoQualityFlagsQualityFlags>
  qualityFlags;
  final ReaderSummaryReaderBriefDto readerBrief;
  final String readerSummaryId;
  final List<ReaderSummaryRepeatedSignalDto> repeatedSignals;
  final List<ReaderSummaryRiskDto> risksAndUnknowns;
  final String schemaVersion;
  final ReaderSummaryScopeDto scope;
  final ReaderSummarySourceWindowDto sourceWindow;
  final List<ReaderSummaryStoryClusterDto> storyClusters;
  final String? subscriptionId;
  final String tenantId;
  final List<ReaderSummaryTopStoryDto> topStories;
  final ReaderSummaryUsageDto usage;
  final String? userId;
  final String workspaceId;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryArtifactResponseDtoToJson(this);
}
