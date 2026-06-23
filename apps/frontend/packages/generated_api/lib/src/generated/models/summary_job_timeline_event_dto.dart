// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'summary_job_timeline_event_dto_status_status.dart';

part 'summary_job_timeline_event_dto.g.dart';

@JsonSerializable()
class SummaryJobTimelineEventDto {
  const SummaryJobTimelineEventDto({
    required this.message,
    required this.occurredAt,
    required this.status,
  });

  factory SummaryJobTimelineEventDto.fromJson(Map<String, Object?> json) =>
      _$SummaryJobTimelineEventDtoFromJson(json);

  final String message;
  final DateTime occurredAt;
  final SummaryJobTimelineEventDtoStatusStatus status;

  Map<String, Object?> toJson() => _$SummaryJobTimelineEventDtoToJson(this);
}
