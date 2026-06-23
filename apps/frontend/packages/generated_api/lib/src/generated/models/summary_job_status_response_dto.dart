// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'summary_job_status_response_dto_status_status.dart';
import 'summary_job_timeline_event_dto.dart';

part 'summary_job_status_response_dto.g.dart';

@JsonSerializable()
class SummaryJobStatusResponseDto {
  const SummaryJobStatusResponseDto({
    required this.requestedAt,
    required this.status,
    required this.summaryJobId,
    required this.timeline,
    required this.topicId,
    this.completedAt,
    this.failedAt,
    this.failureReason,
    this.startedAt,
    this.summaryId,
  });

  factory SummaryJobStatusResponseDto.fromJson(Map<String, Object?> json) =>
      _$SummaryJobStatusResponseDtoFromJson(json);

  final DateTime? completedAt;
  final DateTime? failedAt;
  final String? failureReason;
  final DateTime requestedAt;
  final DateTime? startedAt;
  final SummaryJobStatusResponseDtoStatusStatus status;
  final String? summaryId;
  final String summaryJobId;
  final List<SummaryJobTimelineEventDto> timeline;
  final String topicId;

  Map<String, Object?> toJson() => _$SummaryJobStatusResponseDtoToJson(this);
}
