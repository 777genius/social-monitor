// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_job_timeline_event_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryJobTimelineEventDto _$ReaderSummaryJobTimelineEventDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryJobTimelineEventDto(
  message: json['message'] as String,
  occurredAt: DateTime.parse(json['occurredAt'] as String),
  status: ReaderSummaryJobTimelineEventDtoStatusStatus.fromJson(
    json['status'] as String,
  ),
);

Map<String, dynamic> _$ReaderSummaryJobTimelineEventDtoToJson(
  ReaderSummaryJobTimelineEventDto instance,
) => <String, dynamic>{
  'message': instance.message,
  'occurredAt': instance.occurredAt.toIso8601String(),
  'status': instance.status,
};
