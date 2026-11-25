// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'summary_job_timeline_event_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SummaryJobTimelineEventDto _$SummaryJobTimelineEventDtoFromJson(
  Map<String, dynamic> json,
) => SummaryJobTimelineEventDto(
  message: json['message'] as String,
  occurredAt: DateTime.parse(json['occurredAt'] as String),
  status: SummaryJobTimelineEventDtoStatusStatus.fromJson(
    json['status'] as String,
  ),
);

Map<String, dynamic> _$SummaryJobTimelineEventDtoToJson(
  SummaryJobTimelineEventDto instance,
) => <String, dynamic>{
  'message': instance.message,
  'occurredAt': instance.occurredAt.toIso8601String(),
  'status': instance.status,
};
