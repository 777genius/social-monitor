// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'briefing_job_status_response_dto_status_status.dart';
import 'briefing_job_timeline_event_dto.dart';
import 'briefing_scope_dto.dart';

part 'briefing_job_status_response_dto.g.dart';

@JsonSerializable()
class BriefingJobStatusResponseDto {
  const BriefingJobStatusResponseDto({
    required this.briefingJobId,
    required this.requestedAt,
    required this.scope,
    required this.status,
    required this.timeline,
    this.briefingId,
    this.completedAt,
    this.failedAt,
    this.failureReason,
    this.startedAt,
  });

  factory BriefingJobStatusResponseDto.fromJson(Map<String, Object?> json) =>
      _$BriefingJobStatusResponseDtoFromJson(json);

  final String? briefingId;
  final String briefingJobId;
  final DateTime? completedAt;
  final DateTime? failedAt;
  final String? failureReason;
  final DateTime requestedAt;
  final BriefingScopeDto scope;
  final DateTime? startedAt;
  final BriefingJobStatusResponseDtoStatusStatus status;
  final List<BriefingJobTimelineEventDto> timeline;

  Map<String, Object?> toJson() => _$BriefingJobStatusResponseDtoToJson(this);
}
