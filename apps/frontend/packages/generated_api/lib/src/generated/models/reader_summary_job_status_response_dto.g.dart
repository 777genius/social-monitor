// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reader_summary_job_status_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReaderSummaryJobStatusResponseDto _$ReaderSummaryJobStatusResponseDtoFromJson(
  Map<String, dynamic> json,
) => ReaderSummaryJobStatusResponseDto(
  period: ReaderSummaryPeriodDto.fromJson(
    json['period'] as Map<String, dynamic>,
  ),
  readerSummaryJobId: json['readerSummaryJobId'] as String,
  requestedAt: DateTime.parse(json['requestedAt'] as String),
  scope: ReaderSummaryScopeDto.fromJson(json['scope'] as Map<String, dynamic>),
  status: ReaderSummaryJobStatusResponseDtoStatusStatus.fromJson(
    json['status'] as String,
  ),
  timeline: (json['timeline'] as List<dynamic>)
      .map(
        (e) => ReaderSummaryJobTimelineEventDto.fromJson(
          e as Map<String, dynamic>,
        ),
      )
      .toList(),
  completedAt: json['completedAt'] == null
      ? null
      : DateTime.parse(json['completedAt'] as String),
  failedAt: json['failedAt'] == null
      ? null
      : DateTime.parse(json['failedAt'] as String),
  failureClass: json['failureClass'] == null
      ? null
      : ReaderSummaryJobStatusResponseDtoFailureClassFailureClass.fromJson(
          json['failureClass'] as String,
        ),
  failureReason: json['failureReason'] as String?,
  readerSummaryId: json['readerSummaryId'] as String?,
  startedAt: json['startedAt'] == null
      ? null
      : DateTime.parse(json['startedAt'] as String),
);

Map<String, dynamic> _$ReaderSummaryJobStatusResponseDtoToJson(
  ReaderSummaryJobStatusResponseDto instance,
) => <String, dynamic>{
  'completedAt': instance.completedAt?.toIso8601String(),
  'failedAt': instance.failedAt?.toIso8601String(),
  'failureClass': instance.failureClass,
  'failureReason': instance.failureReason,
  'period': instance.period,
  'readerSummaryId': instance.readerSummaryId,
  'readerSummaryJobId': instance.readerSummaryJobId,
  'requestedAt': instance.requestedAt.toIso8601String(),
  'scope': instance.scope,
  'startedAt': instance.startedAt?.toIso8601String(),
  'status': instance.status,
  'timeline': instance.timeline,
};
