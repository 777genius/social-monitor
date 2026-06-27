// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reader_summary_job_status_response_dto_status_status.dart';
import 'reader_summary_job_timeline_event_dto.dart';
import 'reader_summary_period_dto.dart';
import 'reader_summary_scope_dto.dart';

part 'reader_summary_job_status_response_dto.g.dart';

@JsonSerializable()
class ReaderSummaryJobStatusResponseDto {
  const ReaderSummaryJobStatusResponseDto({
    required this.period,
    required this.readerSummaryJobId,
    required this.requestedAt,
    required this.scope,
    required this.status,
    required this.timeline,
    this.completedAt,
    this.failedAt,
    this.failureReason,
    this.readerSummaryId,
    this.startedAt,
  });

  factory ReaderSummaryJobStatusResponseDto.fromJson(
    Map<String, Object?> json,
  ) => _$ReaderSummaryJobStatusResponseDtoFromJson(json);

  final DateTime? completedAt;
  final DateTime? failedAt;
  final String? failureReason;
  final ReaderSummaryPeriodDto period;
  final String? readerSummaryId;
  final String readerSummaryJobId;
  final DateTime requestedAt;
  final ReaderSummaryScopeDto scope;
  final DateTime? startedAt;
  final ReaderSummaryJobStatusResponseDtoStatusStatus status;
  final List<ReaderSummaryJobTimelineEventDto> timeline;

  Map<String, Object?> toJson() =>
      _$ReaderSummaryJobStatusResponseDtoToJson(this);
}
