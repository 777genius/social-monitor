// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'summary_job_status_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SummaryJobStatusResponseDto _$SummaryJobStatusResponseDtoFromJson(
  Map<String, dynamic> json,
) => SummaryJobStatusResponseDto(
  interestId: json['interestId'] as String,
  requestedAt: DateTime.parse(json['requestedAt'] as String),
  status: SummaryJobStatusResponseDtoStatusStatus.fromJson(
    json['status'] as String,
  ),
  summaryJobId: json['summaryJobId'] as String,
  timeline: (json['timeline'] as List<dynamic>)
      .map(
        (e) => SummaryJobTimelineEventDto.fromJson(e as Map<String, dynamic>),
      )
      .toList(),
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
  summaryId: json['summaryId'] as String?,
);

Map<String, dynamic> _$SummaryJobStatusResponseDtoToJson(
  SummaryJobStatusResponseDto instance,
) => <String, dynamic>{
  'completedAt': instance.completedAt?.toIso8601String(),
  'failedAt': instance.failedAt?.toIso8601String(),
  'failureReason': instance.failureReason,
  'interestId': instance.interestId,
  'requestedAt': instance.requestedAt.toIso8601String(),
  'startedAt': instance.startedAt?.toIso8601String(),
  'status': instance.status,
  'summaryId': instance.summaryId,
  'summaryJobId': instance.summaryJobId,
  'timeline': instance.timeline,
};
