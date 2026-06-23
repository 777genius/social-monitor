// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'briefing_job_status_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BriefingJobStatusResponseDto _$BriefingJobStatusResponseDtoFromJson(
  Map<String, dynamic> json,
) => BriefingJobStatusResponseDto(
  briefingJobId: json['briefingJobId'] as String,
  requestedAt: DateTime.parse(json['requestedAt'] as String),
  scope: BriefingScopeDto.fromJson(json['scope'] as Map<String, dynamic>),
  status: BriefingJobStatusResponseDtoStatusStatus.fromJson(
    json['status'] as String,
  ),
  timeline: (json['timeline'] as List<dynamic>)
      .map(
        (e) => BriefingJobTimelineEventDto.fromJson(e as Map<String, dynamic>),
      )
      .toList(),
  briefingId: json['briefingId'] as String?,
  completedAt: json['completedAt'] == null
      ? null
      : DateTime.parse(json['completedAt'] as String),
  failedAt: json['failedAt'] == null
      ? null
      : DateTime.parse(json['failedAt'] as String),
  failureReason: json['failureReason'] as String?,
  startedAt: json['startedAt'] == null
      ? null
      : DateTime.parse(json['startedAt'] as String),
);

Map<String, dynamic> _$BriefingJobStatusResponseDtoToJson(
  BriefingJobStatusResponseDto instance,
) => <String, dynamic>{
  'briefingId': instance.briefingId,
  'briefingJobId': instance.briefingJobId,
  'completedAt': instance.completedAt?.toIso8601String(),
  'failedAt': instance.failedAt?.toIso8601String(),
  'failureReason': instance.failureReason,
  'requestedAt': instance.requestedAt.toIso8601String(),
  'scope': instance.scope,
  'startedAt': instance.startedAt?.toIso8601String(),
  'status': instance.status,
  'timeline': instance.timeline,
};
