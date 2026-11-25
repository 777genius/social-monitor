// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_weekly_projection_artifact_dto.dart';
import 'reader_summary_weekly_projection_evidence_limitation_dto.dart';
import 'reader_summary_weekly_projection_response_dto_blocking_reasons_blocking_reasons.dart';
import 'reader_summary_weekly_projection_response_dto_schema_version_schema_version.dart';
import 'reader_summary_weekly_projection_response_dto_status_status.dart';

part 'reader_summary_weekly_projection_response_dto.g.dart';

@JsonSerializable()
class ReaderSummaryWeeklyProjectionResponseDto {
  const ReaderSummaryWeeklyProjectionResponseDto({
    required this.activeWeeklyCertifiedArtifactPresent,
    required this.artifact,
    required this.blockingReasons,
    required this.certifiedDailyEvidenceDates,
    required this.evidenceLimitations,
    required this.missingDailyEvidenceDates,
    required this.schemaVersion,
    required this.status,
    required this.tenantId,
    required this.weekEndedOn,
    required this.weekStartedOn,
    required this.workspaceId,
  });

  factory ReaderSummaryWeeklyProjectionResponseDto.fromJson(
    Map<String, Object?> json,
  ) => _$ReaderSummaryWeeklyProjectionResponseDtoFromJson(json);

  final bool activeWeeklyCertifiedArtifactPresent;
  final ReaderSummaryWeeklyProjectionArtifactDto? artifact;
  final List<
    ReaderSummaryWeeklyProjectionResponseDtoBlockingReasonsBlockingReasons
  >
  blockingReasons;
  final List<DateTime> certifiedDailyEvidenceDates;
  final List<ReaderSummaryWeeklyProjectionEvidenceLimitationDto>
  evidenceLimitations;
  final List<DateTime> missingDailyEvidenceDates;
  final ReaderSummaryWeeklyProjectionResponseDtoSchemaVersionSchemaVersion
  schemaVersion;
  final ReaderSummaryWeeklyProjectionResponseDtoStatusStatus status;
  final String tenantId;
  final DateTime weekEndedOn;
  final DateTime weekStartedOn;
  final String workspaceId;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryWeeklyProjectionResponseDtoToJson(this);
}
