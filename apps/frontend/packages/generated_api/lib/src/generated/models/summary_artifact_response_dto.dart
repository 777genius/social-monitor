// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'summary_artifact_response_dto_quality_flags_quality_flags.dart';
import 'summary_citation_view_dto.dart';
import 'summary_confidence_dto.dart';
import 'summary_freshness_dto.dart';
import 'summary_key_point_dto.dart';
import 'summary_lineage_dto.dart';
import 'summary_risk_dto.dart';
import 'summary_source_window_dto.dart';
import 'summary_usage_dto.dart';

part 'summary_artifact_response_dto.g.dart';

@JsonSerializable()
class SummaryArtifactResponseDto {
  const SummaryArtifactResponseDto({
    required this.citations,
    required this.confidence,
    required this.executiveSummary,
    required this.freshness,
    required this.headline,
    required this.keyPoints,
    required this.lineage,
    required this.qualityFlags,
    required this.risksAndUnknowns,
    required this.schemaVersion,
    required this.sourceHighlights,
    required this.sourceWindow,
    required this.summaryId,
    required this.tenantId,
    required this.topicId,
    required this.usage,
    required this.workspaceId,
    this.noSignalReason,
    this.subscriptionId,
    this.userId,
  });

  factory SummaryArtifactResponseDto.fromJson(Map<String, Object?> json) =>
      _$SummaryArtifactResponseDtoFromJson(json);

  final List<SummaryCitationViewDto> citations;
  final SummaryConfidenceDto confidence;
  final String executiveSummary;
  final SummaryFreshnessDto freshness;
  final String headline;
  final List<SummaryKeyPointDto> keyPoints;
  final SummaryLineageDto lineage;
  final String? noSignalReason;
  final List<SummaryArtifactResponseDtoQualityFlagsQualityFlags> qualityFlags;
  final List<SummaryRiskDto> risksAndUnknowns;
  final String schemaVersion;
  final List<String> sourceHighlights;
  final SummarySourceWindowDto sourceWindow;
  final String? subscriptionId;
  final String summaryId;
  final String tenantId;
  final String topicId;
  final SummaryUsageDto usage;
  final String? userId;
  final String workspaceId;

  Map<String, Object?> toJson() => _$SummaryArtifactResponseDtoToJson(this);
}
