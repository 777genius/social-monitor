// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'briefing_artifact_response_dto_quality_flags_quality_flags.dart';
import 'briefing_citation_view_dto.dart';
import 'briefing_confidence_dto.dart';
import 'briefing_context_artifact_dto.dart';
import 'briefing_freshness_dto.dart';
import 'briefing_lineage_dto.dart';
import 'briefing_reader_brief_dto.dart';
import 'briefing_repeated_signal_dto.dart';
import 'briefing_risk_dto.dart';
import 'briefing_scope_dto.dart';
import 'briefing_source_window_dto.dart';
import 'briefing_story_cluster_dto.dart';
import 'briefing_top_story_dto.dart';
import 'briefing_topic_highlight_dto.dart';
import 'briefing_usage_dto.dart';

part 'briefing_artifact_response_dto.g.dart';

@JsonSerializable()
class BriefingArtifactResponseDto {
  const BriefingArtifactResponseDto({
    required this.briefingId,
    required this.citations,
    required this.confidence,
    required this.contextArtifacts,
    required this.executiveSummary,
    required this.freshness,
    required this.headline,
    required this.lineage,
    required this.qualityFlags,
    required this.readerBrief,
    required this.repeatedSignals,
    required this.risksAndUnknowns,
    required this.schemaVersion,
    required this.scope,
    required this.sourceWindow,
    required this.storyClusters,
    required this.tenantId,
    required this.topicHighlights,
    required this.topStories,
    required this.usage,
    required this.workspaceId,
    this.noSignalReason,
    this.subscriptionId,
    this.userId,
  });

  factory BriefingArtifactResponseDto.fromJson(Map<String, Object?> json) =>
      _$BriefingArtifactResponseDtoFromJson(json);

  final String briefingId;
  final List<BriefingCitationViewDto> citations;
  final BriefingConfidenceDto confidence;
  final List<BriefingContextArtifactDto> contextArtifacts;
  final String executiveSummary;
  final BriefingFreshnessDto freshness;
  final String headline;
  final BriefingLineageDto lineage;
  final String? noSignalReason;
  final List<BriefingArtifactResponseDtoQualityFlagsQualityFlags> qualityFlags;
  final BriefingReaderBriefDto readerBrief;
  final List<BriefingRepeatedSignalDto> repeatedSignals;
  final List<BriefingRiskDto> risksAndUnknowns;
  final String schemaVersion;
  final BriefingScopeDto scope;
  final BriefingSourceWindowDto sourceWindow;
  final List<BriefingStoryClusterDto> storyClusters;
  final String? subscriptionId;
  final String tenantId;
  final List<BriefingTopicHighlightDto> topicHighlights;
  final List<BriefingTopStoryDto> topStories;
  final BriefingUsageDto usage;
  final String? userId;
  final String workspaceId;

  Map<String, Object?> toJson() => _$BriefingArtifactResponseDtoToJson(this);
}
