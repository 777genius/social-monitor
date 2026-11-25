// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_job_timeline_event_dto_status_status.dart';

part 'reader_summary_job_timeline_event_dto.g.dart';

@JsonSerializable()
class ReaderSummaryJobTimelineEventDto {
  const ReaderSummaryJobTimelineEventDto({
    required this.message,
    required this.occurredAt,
    required this.status,
  });

  factory ReaderSummaryJobTimelineEventDto.fromJson(
    Map<String, Object?> json,
  ) => _$ReaderSummaryJobTimelineEventDtoFromJson(json);

  final String message;
  final DateTime occurredAt;
  final ReaderSummaryJobTimelineEventDtoStatusStatus status;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryJobTimelineEventDtoToJson(this);
}
