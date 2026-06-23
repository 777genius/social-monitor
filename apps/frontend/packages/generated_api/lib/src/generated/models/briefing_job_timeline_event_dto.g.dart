// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'briefing_job_timeline_event_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BriefingJobTimelineEventDto _$BriefingJobTimelineEventDtoFromJson(
  Map<String, dynamic> json,
) => BriefingJobTimelineEventDto(
  message: json['message'] as String,
  occurredAt: DateTime.parse(json['occurredAt'] as String),
  status: BriefingJobTimelineEventDtoStatusStatus.fromJson(
    json['status'] as String,
  ),
);

Map<String, dynamic> _$BriefingJobTimelineEventDtoToJson(
  BriefingJobTimelineEventDto instance,
) => <String, dynamic>{
  'message': instance.message,
  'occurredAt': instance.occurredAt.toIso8601String(),
  'status': instance.status,
};
