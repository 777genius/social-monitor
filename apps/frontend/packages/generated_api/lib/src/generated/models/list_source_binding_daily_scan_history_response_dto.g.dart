// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'list_source_binding_daily_scan_history_response_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ListSourceBindingDailyScanHistoryResponseDto
_$ListSourceBindingDailyScanHistoryResponseDtoFromJson(
  Map<String, dynamic> json,
) => ListSourceBindingDailyScanHistoryResponseDto(
  days: (json['days'] as List<dynamic>)
      .map(
        (e) => SourceBindingDailyScanHistoryDayResponseDto.fromJson(
          e as Map<String, dynamic>,
        ),
      )
      .toList(),
  maxScanJobs: json['maxScanJobs'] as num,
  sourceBindingId: json['sourceBindingId'] as String,
  truncated: json['truncated'] as bool,
  windowEndedAt: DateTime.parse(json['windowEndedAt'] as String),
  windowStartedAt: DateTime.parse(json['windowStartedAt'] as String),
  summary: json['summary'] == null
      ? null
      : SourceBindingDailyScanHistorySummaryResponseDto.fromJson(
          json['summary'] as Map<String, dynamic>,
        ),
);

Map<String, dynamic> _$ListSourceBindingDailyScanHistoryResponseDtoToJson(
  ListSourceBindingDailyScanHistoryResponseDto instance,
) => <String, dynamic>{
  'days': instance.days,
  'maxScanJobs': instance.maxScanJobs,
  'sourceBindingId': instance.sourceBindingId,
  'summary': instance.summary,
  'truncated': instance.truncated,
  'windowEndedAt': instance.windowEndedAt.toIso8601String(),
  'windowStartedAt': instance.windowStartedAt.toIso8601String(),
};
