// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'briefing_job_timeline_event_dto_status_status.dart';

part 'briefing_job_timeline_event_dto.g.dart';

@JsonSerializable()
class BriefingJobTimelineEventDto {
  const BriefingJobTimelineEventDto({
    required this.message,
    required this.occurredAt,
    required this.status,
  });

  factory BriefingJobTimelineEventDto.fromJson(Map<String, Object?> json) =>
      _$BriefingJobTimelineEventDtoFromJson(json);

  final String message;
  final DateTime occurredAt;
  final BriefingJobTimelineEventDtoStatusStatus status;

  Map<String, Object?> toJson() => _$BriefingJobTimelineEventDtoToJson(this);
}
