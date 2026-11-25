// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_weekly_projection_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryWeeklyProjectionResponseDto
_$ReaderSummaryWeeklyProjectionResponseDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryWeeklyProjectionResponseDto(
  activeWeeklyCertifiedArtifactPresent:
      json['activeWeeklyCertifiedArtifactPresent'] as bool,
  artifact: json['artifact'] == null
      ? null
      : ReaderSummaryWeeklyProjectionArtifactDto.fromJson(
          json['artifact'] as Map<String, dynamic>,
        ),
  blockingReasons: (json['blockingReasons'] as List<dynamic>)
      .map(
        (e) =>
            ReaderSummaryWeeklyProjectionResponseDtoBlockingReasonsBlockingReasons.fromJson(
              e as String,
            ),
      )
      .toList(),
  certifiedDailyEvidenceDates:
      (json['certifiedDailyEvidenceDates'] as List<dynamic>)
          .map((e) => DateTime.parse(e as String))
          .toList(),
  evidenceLimitations: (json['evidenceLimitations'] as List<dynamic>)
      .map(
        (e) => ReaderSummaryWeeklyProjectionEvidenceLimitationDto.fromJson(
          e as Map<String, dynamic>,
        ),
      )
      .toList(),
  missingDailyEvidenceDates:
      (json['missingDailyEvidenceDates'] as List<dynamic>)
          .map((e) => DateTime.parse(e as String))
          .toList(),
  schemaVersion:
      ReaderSummaryWeeklyProjectionResponseDtoSchemaVersionSchemaVersion.fromJson(
        json['schemaVersion'] as String,
      ),
  status: ReaderSummaryWeeklyProjectionResponseDtoStatusStatus.fromJson(
    json['status'] as String,
  ),
  tenantId: json['tenantId'] as String,
  weekEndedOn: DateTime.parse(json['weekEndedOn'] as String),
  weekStartedOn: DateTime.parse(json['weekStartedOn'] as String),
  workspaceId: json['workspaceId'] as String,
);

Map<String, dynamic> _$ReaderSummaryWeeklyProjectionResponseDtoToJson(
  ReaderSummaryWeeklyProjectionResponseDto instance,
) => <String, dynamic>{
  'activeWeeklyCertifiedArtifactPresent':
      instance.activeWeeklyCertifiedArtifactPresent,
  'artifact': instance.artifact,
  'blockingReasons': instance.blockingReasons,
  'certifiedDailyEvidenceDates': instance.certifiedDailyEvidenceDates
      .map((e) => e.toIso8601String())
      .toList(),
  'evidenceLimitations': instance.evidenceLimitations,
  'missingDailyEvidenceDates': instance.missingDailyEvidenceDates
      .map((e) => e.toIso8601String())
      .toList(),
  'schemaVersion': instance.schemaVersion,
  'status': instance.status,
  'tenantId': instance.tenantId,
  'weekEndedOn': instance.weekEndedOn.toIso8601String(),
  'weekStartedOn': instance.weekStartedOn.toIso8601String(),
  'workspaceId': instance.workspaceId,
};
