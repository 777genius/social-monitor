// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_weekly_projection_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryWeeklyProjectionResponseDto
_$ReaderSummaryWeeklyProjectionResponseDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryWeeklyProjectionResponseDto(
  artifact: json['artifact'] == null
      ? null
      : ReaderSummaryWeeklyProjectionArtifactDto.fromJson(
          json['artifact'] as Map<String, dynamic>,
        ),
  blockingReasons: (json['blockingReasons'] as List<dynamic>)
      .map(
        (e) =>
            ReaderSummaryWeeklyProjectionResponseDtoBlockingReasonsBlockingReasons
                .fromJson(e as String),
      )
      .toList(),
  certifiedDailyEvidenceDates:
      (json['certifiedDailyEvidenceDates'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
  missingDailyEvidenceDates: (json['missingDailyEvidenceDates'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  schemaVersion:
      ReaderSummaryWeeklyProjectionResponseDtoSchemaVersionSchemaVersion
          .fromJson(json['schemaVersion'] as String),
  status: ReaderSummaryWeeklyProjectionResponseDtoStatusStatus.fromJson(
    json['status'] as String,
  ),
  tenantId: json['tenantId'] as String,
  weekEndedOn: json['weekEndedOn'] as String,
  weekStartedOn: json['weekStartedOn'] as String,
  workspaceId: json['workspaceId'] as String,
);

Map<String, dynamic> _$ReaderSummaryWeeklyProjectionResponseDtoToJson(
  ReaderSummaryWeeklyProjectionResponseDto instance,
) => <String, dynamic>{
  'artifact': instance.artifact,
  'blockingReasons': instance.blockingReasons,
  'certifiedDailyEvidenceDates': instance.certifiedDailyEvidenceDates,
  'missingDailyEvidenceDates': instance.missingDailyEvidenceDates,
  'schemaVersion': instance.schemaVersion,
  'status': instance.status,
  'tenantId': instance.tenantId,
  'weekEndedOn': instance.weekEndedOn,
  'weekStartedOn': instance.weekStartedOn,
  'workspaceId': instance.workspaceId,
};
