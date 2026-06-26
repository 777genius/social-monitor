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
  providerKey: json['providerKey'] as String,
  sourceBindingId: json['sourceBindingId'] as String,
  sourceBindingStatus:
      ListSourceBindingDailyScanHistoryResponseDtoSourceBindingStatusSourceBindingStatus.fromJson(
        json['sourceBindingStatus'] as String,
      ),
  topicId: json['topicId'] as String,
  truncated: json['truncated'] as bool,
  windowEndedAt: DateTime.parse(json['windowEndedAt'] as String),
  windowStartedAt: DateTime.parse(json['windowStartedAt'] as String),
  cadence: json['cadence'] == null
      ? null
      : ScanPolicyCadenceResponseDto.fromJson(
          json['cadence'] as Map<String, dynamic>,
        ),
  summary: json['summary'] == null
      ? null
      : SourceBindingDailyScanHistorySummaryResponseDto.fromJson(
          json['summary'] as Map<String, dynamic>,
        ),
);

Map<String, dynamic> _$ListSourceBindingDailyScanHistoryResponseDtoToJson(
  ListSourceBindingDailyScanHistoryResponseDto instance,
) => <String, dynamic>{
  'cadence': instance.cadence,
  'days': instance.days,
  'maxScanJobs': instance.maxScanJobs,
  'providerKey': instance.providerKey,
  'sourceBindingId': instance.sourceBindingId,
  'sourceBindingStatus': instance.sourceBindingStatus,
  'summary': instance.summary,
  'topicId': instance.topicId,
  'truncated': instance.truncated,
  'windowEndedAt': instance.windowEndedAt.toIso8601String(),
  'windowStartedAt': instance.windowStartedAt.toIso8601String(),
};
